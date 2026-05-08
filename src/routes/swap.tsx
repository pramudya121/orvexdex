import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { TokenSelect } from "@/components/TokenSelect";
import { NATIVE, WZKLTC, type Token } from "@/lib/tokens";
import { ADDR } from "@/lib/chain";
import { erc20Abi, wzkltcAbi } from "@/lib/abis/wzkltc";
import { routerAbi } from "@/lib/abis/router";
import { useAllowance, useBestRoute, useTokenBalance, MAX_UINT256 } from "@/lib/hooks";
import { deadline, fmt, safeParse, slippageMin } from "@/lib/format";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/swap")({
  component: SwapPage,
  head: () => ({ meta: [{ title: "Swap — ORVEX" }] }),
});

type Mode = "wrap" | "unwrap" | "swap";

function SwapPage() {
  const { address } = useAccount();
  const toast = useToast();
  const [tokenIn, setTokenIn] = useState<Token>(NATIVE);
  const [tokenOut, setTokenOut] = useState<Token>(WZKLTC);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50); // 0.50% default
  const [deadlineMin, setDeadlineMin] = useState(20);
  const [showSettings, setShowSettings] = useState(false);

  const mode: Mode = useMemo(() => {
    if (tokenIn.isNative && tokenOut.isWrapped) return "wrap";
    if (tokenIn.isWrapped && tokenOut.isNative) return "unwrap";
    return "swap";
  }, [tokenIn, tokenOut]);

  const amountInWei = safeParse(amountIn, tokenIn.decimals);

  // Native balance
  const nativeBal = useBalance({ address, query: { refetchInterval: 8000 } });
  // ERC20 balances
  const inBal = useTokenBalance(tokenIn.isNative ? undefined : (tokenIn.address as `0x${string}`), address);
  const outBal = useTokenBalance(tokenOut.isNative ? undefined : (tokenOut.address as `0x${string}`), address);

  const balanceIn = tokenIn.isNative ? nativeBal.data?.value : (inBal.data as bigint | undefined);
  const balanceOut = tokenOut.isNative ? nativeBal.data?.value : (outBal.data as bigint | undefined);

  // Smart routing: best of direct vs multi-hop via WzkLTC
  const tokenInAddr = (tokenIn.isNative ? ADDR.wzkLTC : tokenIn.address) as `0x${string}`;
  const tokenOutAddr = (tokenOut.isNative ? ADDR.wzkLTC : tokenOut.address) as `0x${string}`;
  const route = useBestRoute(mode === "swap" ? amountInWei : 0n, tokenInAddr, tokenOutAddr);
  const path = mode === "swap" ? route.path : undefined;

  const expectedOut = useMemo<bigint>(() => {
    if (mode === "wrap" || mode === "unwrap") return amountInWei;
    return route.amountOut;
  }, [mode, amountInWei, route.amountOut]);


  // Allowance for ERC20 -> router
  const allowance = useAllowance(
    !tokenIn.isNative && mode === "swap" ? (tokenIn.address as `0x${string}`) : undefined,
    address,
    ADDR.router,
  );
  const needsApproval = mode === "swap" && !tokenIn.isNative && (allowance.data as bigint | undefined ?? 0n) < amountInWei;

  const { writeContractAsync, isPending } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash });

  useEffect(() => {
    if (receipt.isSuccess && pendingHash) {
      toast.push({ title: "Transaction confirmed", type: "success", hash: pendingHash });
      setPendingHash(undefined);
      setAmountIn("");
      allowance.refetch();
      nativeBal.refetch();
      inBal.refetch();
      outBal.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
  };

  const buttonLabel = mode === "wrap" ? "WRAP" : mode === "unwrap" ? "UNWRAP" : needsApproval ? `Approve ${tokenIn.symbol}` : "SWAP";

  const handleAction = async () => {
    if (!address || amountInWei <= 0n) return;
    try {
      if (mode === "wrap") {
        const hash = await writeContractAsync({
          address: ADDR.wzkLTC, abi: wzkltcAbi, functionName: "deposit", value: amountInWei,
        });
        setPendingHash(hash);
        toast.push({ title: "Wrapping zkLTC…", hash });
        return;
      }
      if (mode === "unwrap") {
        const hash = await writeContractAsync({
          address: ADDR.wzkLTC, abi: wzkltcAbi, functionName: "withdraw", args: [amountInWei],
        });
        setPendingHash(hash);
        toast.push({ title: "Unwrapping wzkLTC…", hash });
        return;
      }
      // swap
      if (needsApproval) {
        const hash = await writeContractAsync({
          address: tokenIn.address as `0x${string}`, abi: erc20Abi, functionName: "approve",
          args: [ADDR.router, MAX_UINT256],
        });
        setPendingHash(hash);
        toast.push({ title: `Approving ${tokenIn.symbol}…`, hash });
        return;
      }
      if (!path) return;
      const minOut = slippageMin(expectedOut, slippageBps);
      const dl = deadline(deadlineMin);
      let hash: `0x${string}`;
      if (tokenIn.isNative) {
        hash = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "swapExactETHForTokens",
          args: [minOut, path, address, dl], value: amountInWei,
        });
      } else if (tokenOut.isNative) {
        hash = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "swapExactTokensForETH",
          args: [amountInWei, minOut, path, address, dl],
        });
      } else {
        hash = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "swapExactTokensForTokens",
          args: [amountInWei, minOut, path, address, dl],
        });
      }
      setPendingHash(hash);
      toast.push({ title: "Swapping…", hash });
    } catch (e: any) {
      toast.push({ title: "Transaction failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const disabled = !address || amountInWei <= 0n || isPending || !!pendingHash || (mode === "swap" && !needsApproval && expectedOut === 0n);

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="glass-strong rounded-3xl p-6 shadow-neon">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold">Swap</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-surface-2 text-muted-foreground">
              {mode === "wrap" ? "Wrap" : mode === "unwrap" ? "Unwrap" : "AMM"}
            </span>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="h-8 w-8 rounded-lg bg-surface-2 border border-border hover:border-primary/60 transition flex items-center justify-center text-sm"
              aria-label="Settings"
            >⚙</button>
          </div>
        </div>

        {showSettings && (
          <div className="mb-4 p-4 rounded-2xl bg-surface-2/70 border border-border space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Slippage tolerance</span>
                <span className="text-accent">{(slippageBps / 100).toFixed(2)}%</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[10, 50, 100, 300].map((bps) => (
                  <button key={bps} onClick={() => setSlippageBps(bps)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${slippageBps === bps ? "bg-gradient-brand text-primary-foreground border-transparent" : "bg-surface border-border hover:border-primary/60"}`}
                  >{(bps / 100).toFixed(bps < 100 ? 2 : 1)}%</button>
                ))}
                <input
                  type="number" min={0.01} max={50} step={0.01}
                  value={(slippageBps / 100).toString()}
                  onChange={(e) => setSlippageBps(Math.max(1, Math.min(5000, Math.round(+e.target.value * 100))))}
                  className="w-20 px-2 py-1.5 rounded-lg bg-surface border border-border text-xs outline-none focus:border-primary"
                  placeholder="custom"
                />
              </div>
              {slippageBps > 300 && <div className="text-[11px] text-amber-400 mt-1.5">High slippage — your trade may be front-run.</div>}
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Transaction deadline</span>
                <span className="text-accent">{deadlineMin} min</span>
              </div>
              <input type="number" min={1} max={120} value={deadlineMin}
                onChange={(e) => setDeadlineMin(Math.max(1, Math.min(120, +e.target.value || 20)))}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        <TokenPanel
          label="From"
          token={tokenIn}
          onTokenChange={setTokenIn}
          excludeFor={tokenOut}
          amount={amountIn}
          onAmountChange={setAmountIn}
          balance={balanceIn}
        />

        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={flip}
            className="h-10 w-10 rounded-xl bg-surface-2 border border-border hover:border-primary/60 hover:rotate-180 transition-transform duration-300"
          >
            ↓
          </button>
        </div>

        <TokenPanel
          label="To"
          token={tokenOut}
          onTokenChange={setTokenOut}
          excludeFor={tokenIn}
          amount={fmt(expectedOut, tokenOut.decimals)}
          balance={balanceOut}
          readOnly
        />

        {mode === "swap" && expectedOut > 0n && amountInWei > 0n && (
          <div className="mt-4 p-3 rounded-xl bg-surface-2 text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Rate</span>
              <span className="text-right truncate">1 {tokenIn.symbol} ≈ {fmt((expectedOut * 10n ** BigInt(tokenIn.decimals)) / (amountInWei || 1n), tokenOut.decimals, 6)} {tokenOut.symbol}</span>
            </div>
            <div className="flex justify-between"><span>Slippage</span><span>1.00%</span></div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Route</span>
              <span className="text-right truncate text-accent">
                {route.hops === 2 ? `${tokenIn.symbol} → wzkLTC → ${tokenOut.symbol}` : `${tokenIn.symbol} → ${tokenOut.symbol}`}
                {route.hops === 2 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20">SMART</span>}
              </span>
            </div>
          </div>
        )}


        <button
          onClick={handleAction}
          disabled={disabled}
          className="mt-5 w-full py-4 rounded-xl bg-gradient-brand text-primary-foreground font-bold text-lg shadow-neon hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {!address ? "Connect wallet" : isPending || pendingHash ? "Confirming…" : buttonLabel}
        </button>
      </div>
    </div>
  );
}

function TokenPanel({
  label, token, onTokenChange, excludeFor, amount, onAmountChange, balance, readOnly,
}: {
  label: string;
  token: Token;
  onTokenChange: (t: Token) => void;
  excludeFor?: Token;
  amount: string;
  onAmountChange?: (v: string) => void;
  balance?: bigint;
  readOnly?: boolean;
}) {
  return (
    <div className="bg-surface-2/50 rounded-2xl p-4 border border-border overflow-hidden">
      <div className="flex justify-between text-xs text-muted-foreground mb-2 gap-2">
        <span className="shrink-0">{label}</span>
        <span className="truncate text-right">
          Balance: {fmt(balance, token.decimals)}{" "}
          {!readOnly && balance !== undefined && balance > 0n && (
            <button
              onClick={() => onAmountChange?.(fmt(balance, token.decimals, 18))}
              className="text-accent hover:underline ml-1"
            >MAX</button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          placeholder="0.0"
          readOnly={readOnly}
          value={amount}
          onChange={(e) => onAmountChange?.(e.target.value)}
          className="flex-1 min-w-0 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground/40"
        />
        <TokenSelect value={token} onChange={onTokenChange} exclude={excludeFor} />
      </div>
    </div>
  );
}

