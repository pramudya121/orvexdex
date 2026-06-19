import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { TokenSelect } from "@/components/TokenSelect";
import { NATIVE, TOKENS, WZKLTC, type Token } from "@/lib/tokens";
import { ADDR } from "@/lib/chain";
import { erc20Abi, wzkltcAbi } from "@/lib/abis/wzkltc";
import { routerAbi } from "@/lib/abis/router";
import { useAllowance, useBestRoute, useBestRouteExactOut, useGetPair, usePairReserves, useTokenBalance, MAX_UINT256 } from "@/lib/hooks";
import { deadline, fmt, safeParse, slippageMin, slippageMax } from "@/lib/format";
import { useToast } from "@/components/ui/toaster";
import { explorerAddr } from "@/lib/chain";
import { SwapCardSkeleton } from "@/components/skeletons";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { SwapConfirmModal } from "@/components/SwapConfirmModal";

type SwapSearch = { from?: string; to?: string };

export const Route = createFileRoute("/swap")({
  component: SwapPage,
  pendingComponent: () => (
    <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 grid lg:grid-cols-[1fr_minmax(420px,460px)_1fr] gap-8 items-start">
      <div className="hidden lg:block" />
      <SwapCardSkeleton />
      <div className="hidden lg:block" />
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Swap — ORVEX" },
      { name: "description", content: "Trade tokens instantly on ORVEX with smart routing, live price impact, and slippage controls on LitVM." },
      { property: "og:title", content: "Swap — ORVEX" },
      { property: "og:description", content: "Trade tokens instantly on ORVEX with smart routing, live price impact, and slippage controls on LitVM." },
      { property: "og:url", content: "https://orvexdex.lovable.app/swap" },
      { name: "twitter:title", content: "Swap — ORVEX" },
      { name: "twitter:description", content: "Trade tokens instantly on ORVEX with smart routing, live price impact, and slippage controls on LitVM." },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/swap" }],
  }),
  validateSearch: (s: Record<string, unknown>): SwapSearch => ({
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
  }),
});

function findTokenByAddr(addr?: string): Token | undefined {
  if (!addr) return undefined;
  const a = addr.toLowerCase();
  return TOKENS.find((t) => t.address.toLowerCase() === a);
}

type Mode = "wrap" | "unwrap" | "swap";

function SwapPage() {
  const { address } = useAccount();
  const toast = useToast();
  const sp = Route.useSearch();
  const [tokenIn, setTokenIn] = useState<Token>(() => findTokenByAddr(sp.from) ?? NATIVE);
  const [tokenOut, setTokenOut] = useState<Token>(() => findTokenByAddr(sp.to) ?? WZKLTC);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [tradeMode, setTradeMode] = useState<"exactIn" | "exactOut">("exactIn");
  const [slippageBps, setSlippageBps] = useLocalStorage<number>("orvex.slippageBps", 50); // 0.50% default
  const [deadlineMin, setDeadlineMin] = useLocalStorage<number>("orvex.deadlineMin", 20);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const a = findTokenByAddr(sp.from);
    const b = findTokenByAddr(sp.to);
    if (a) setTokenIn(a);
    if (b) setTokenOut(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.from, sp.to]);

  const mode: Mode = useMemo(() => {
    if (tokenIn.isNative && tokenOut.isWrapped) return "wrap";
    if (tokenIn.isWrapped && tokenOut.isNative) return "unwrap";
    return "swap";
  }, [tokenIn, tokenOut]);

  const amountInWei = safeParse(amountIn, tokenIn.decimals);
  const amountOutWei = safeParse(amountOut, tokenOut.decimals);

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
  const routeIn = useBestRoute(mode === "swap" && tradeMode === "exactIn" ? amountInWei : 0n, tokenInAddr, tokenOutAddr);
  const routeOut = useBestRouteExactOut(mode === "swap" && tradeMode === "exactOut" ? amountOutWei : 0n, tokenInAddr, tokenOutAddr);
  const route = tradeMode === "exactIn" ? routeIn : { path: routeOut.path, hops: routeOut.hops };
  const path = mode === "swap" ? route.path : undefined;

  // Effective amounts shown in each panel
  const effInWei = mode === "swap" && tradeMode === "exactOut" ? routeOut.amountIn : amountInWei;
  const effOutWei = mode === "wrap" || mode === "unwrap" ? amountInWei
    : tradeMode === "exactIn" ? routeIn.amountOut : amountOutWei;
  const expectedOut = effOutWei; // back-compat alias

  // Price impact (direct path only). Returns percentage number (0–100).
  const directPair = useGetPair(
    mode === "swap" && route.hops === 1 ? tokenInAddr : undefined,
    mode === "swap" && route.hops === 1 ? tokenOutAddr : undefined,
  );
  const pairAddr = directPair.data as `0x${string}` | undefined;
  const reserves = usePairReserves(
    pairAddr && pairAddr !== "0x0000000000000000000000000000000000000000" ? pairAddr : undefined,
  );
  const priceImpact = useMemo<number | null>(() => {
    if (mode !== "swap" || route.hops !== 1 || effInWei <= 0n || effOutWei <= 0n) return null;
    const r = reserves.data;
    const reserveTuple = r?.[0]?.result as readonly [bigint, bigint, number] | undefined;
    const t0 = r?.[1]?.result as `0x${string}` | undefined;
    if (!reserveTuple || !t0) return null;
    const inputIsToken0 = t0.toLowerCase() === tokenInAddr.toLowerCase();
    const reserveIn = inputIsToken0 ? reserveTuple[0] : reserveTuple[1];
    const reserveOut = inputIsToken0 ? reserveTuple[1] : reserveTuple[0];
    if (reserveIn === 0n || reserveOut === 0n) return null;
    // mid price (out per in) vs execution price
    const PREC = 10n ** 18n;
    const mid = (reserveOut * PREC) / reserveIn;
    const exec = (effOutWei * PREC) / (effInWei || 1n);
    if (mid === 0n) return null;
    const diff = mid > exec ? mid - exec : 0n;
    return Number((diff * 10000n) / mid) / 100; // % with 2 decimals
  }, [mode, route.hops, effInWei, effOutWei, reserves.data, tokenInAddr]);



  // Allowance for ERC20 -> router
  const allowance = useAllowance(
    !tokenIn.isNative && mode === "swap" ? (tokenIn.address as `0x${string}`) : undefined,
    address,
    ADDR.router,
  );
  const needsApproval = mode === "swap" && !tokenIn.isNative && (allowance.data as bigint | undefined ?? 0n) < effInWei;

  const { writeContractAsync, isPending } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash });

  useEffect(() => {
    if (receipt.isSuccess && pendingHash) {
      toast.push({ title: "Transaction confirmed", type: "success", hash: pendingHash });
      setPendingHash(undefined);
      setAmountIn("");
      setAmountOut("");
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
    setAmountOut("");
  };

  const buttonLabel = mode === "wrap" ? "WRAP" : mode === "unwrap" ? "UNWRAP" : needsApproval ? `Approve ${tokenIn.symbol}` : "SWAP";

  const handleAction = async () => {
    if (!address) return;
    if (mode === "swap" && tradeMode === "exactOut" ? amountOutWei <= 0n : amountInWei <= 0n) return;
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
      // Open confirm modal before submitting the swap
      setConfirmOpen(true);
    } catch (e: any) {
      toast.push({ title: "Transaction failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const executeSwap = async () => {
    if (!address || !path) return;
    try {
      const dl = deadline(deadlineMin);
      let hash: `0x${string}`;
      if (tradeMode === "exactIn") {
        const minOut = slippageMin(effOutWei, slippageBps);
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
      } else {
        const maxIn = slippageMax(effInWei, slippageBps);
        if (tokenIn.isNative) {
          hash = await writeContractAsync({
            address: ADDR.router, abi: routerAbi, functionName: "swapETHForExactTokens",
            args: [amountOutWei, path, address, dl], value: maxIn,
          });
        } else if (tokenOut.isNative) {
          hash = await writeContractAsync({
            address: ADDR.router, abi: routerAbi, functionName: "swapTokensForExactETH",
            args: [amountOutWei, maxIn, path, address, dl],
          });
        } else {
          hash = await writeContractAsync({
            address: ADDR.router, abi: routerAbi, functionName: "swapTokensForExactTokens",
            args: [amountOutWei, maxIn, path, address, dl],
          });
        }
      }
      setPendingHash(hash);
      setConfirmOpen(false);
      toast.push({ title: "Swapping…", hash });
    } catch (e: any) {
      toast.push({ title: "Transaction failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const userAmt = mode === "swap" && tradeMode === "exactOut" ? amountOutWei : amountInWei;
  const disabled = !address || userAmt <= 0n || isPending || !!pendingHash || (mode === "swap" && !needsApproval && (effInWei === 0n || effOutWei === 0n));

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Ambient aurora */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/4 h-[520px] w-[520px] rounded-full bg-[oklch(0.55_0.28_295)/0.25] blur-3xl animate-aurora" />
        <div className="absolute top-40 right-10 h-[420px] w-[420px] rounded-full bg-[oklch(0.75_0.18_85)/0.18] blur-3xl animate-aurora-2" />
        <div className="absolute bottom-0 left-10 h-[360px] w-[360px] rounded-full bg-[oklch(0.65_0.22_220)/0.18] blur-3xl animate-aurora" />
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 grid lg:grid-cols-[1fr_minmax(420px,460px)_1fr] gap-8 items-start">
        {/* Left brand column */}
        <div className="hidden lg:block animate-rise space-y-6 pt-8">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2/70 border border-border text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /> ORVEX · Atelier
          </span>
          <p className="text-5xl font-bold leading-[1.05]">
            Trade with <span className="text-gradient-brand">precision</span>.<br/>
            Settle with <span className="text-gradient-brand">grace</span>.
          </p>
          <p className="text-muted-foreground max-w-sm">
            Swap on LitVM LiteForge with smart routing through wzkLTC, transparent price impact, and atelier-grade execution.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {[
              { k: "Routing", v: "Smart 2-hop" },
              { k: "Network", v: "LitVM" },
              { k: "Default fee", v: "0.30%" },
              { k: "Slippage", v: "0.50%" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl glass p-3 border border-border">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.k}</div>
                <div className="text-sm font-semibold mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Center swap card */}
        <div className="animated-border rounded-3xl mx-auto w-full max-w-md animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="glass-strong rounded-3xl p-6 shadow-neon">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Swap Tokens</h1>
            <div className="text-[11px] text-muted-foreground mt-0.5">Atelier execution · zero hidden fees</div>
          </div>
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
                  aria-label="Custom slippage tolerance (percent)"
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
                aria-label="Transaction deadline in minutes"
              />
            </div>
          </div>
        )}

        <TokenPanel
          label="From"
          token={tokenIn}
          onTokenChange={setTokenIn}
          excludeFor={tokenOut}
          amount={mode === "swap" && tradeMode === "exactOut" ? fmt(effInWei, tokenIn.decimals) : amountIn}
          onAmountChange={(v) => { setTradeMode("exactIn"); setAmountIn(v); }}
          balance={balanceIn}
          readOnly={mode === "swap" && tradeMode === "exactOut"}
        />

        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={flip}
            aria-label="Flip input and output tokens"
            title="Flip input and output tokens"
            className="press group h-10 w-10 rounded-xl bg-surface-2 border border-border hover:border-primary/60 hover:shadow-neon transition-all duration-300"
          >
            <span className="inline-block transition-transform duration-500 group-hover:rotate-180 group-active:rotate-[360deg]">↓</span>
          </button>
        </div>

        <TokenPanel
          label="To"
          token={tokenOut}
          onTokenChange={setTokenOut}
          excludeFor={tokenIn}
          amount={mode === "swap" && tradeMode === "exactOut" ? amountOut : fmt(effOutWei, tokenOut.decimals)}
          onAmountChange={mode === "swap" ? (v) => { setTradeMode("exactOut"); setAmountOut(v); } : undefined}
          balance={balanceOut}
          readOnly={mode !== "swap" || tradeMode === "exactIn"}
        />

        {mode === "swap" && effOutWei > 0n && effInWei > 0n && (
          <div className="mt-4 p-3 rounded-xl bg-surface-2 text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Rate</span>
              <span className="text-right truncate">1 {tokenIn.symbol} ≈ {fmt((effOutWei * 10n ** BigInt(tokenIn.decimals)) / (effInWei || 1n), tokenOut.decimals, 6)} {tokenOut.symbol}</span>
            </div>
            <div className="flex justify-between"><span>Slippage</span><span>{(slippageBps / 100).toFixed(2)}%</span></div>
            {tradeMode === "exactIn" ? (
              <div className="flex justify-between gap-2"><span className="shrink-0">Min received</span><span className="text-right truncate">{fmt(slippageMin(effOutWei, slippageBps), tokenOut.decimals)} {tokenOut.symbol}</span></div>
            ) : (
              <div className="flex justify-between gap-2"><span className="shrink-0">Max sold</span><span className="text-right truncate">{fmt(slippageMax(effInWei, slippageBps), tokenIn.decimals)} {tokenIn.symbol}</span></div>
            )}
            {priceImpact !== null && (
              <div className="flex justify-between">
                <span>Price impact</span>
                <span className={priceImpact >= 5 ? "text-destructive font-semibold" : priceImpact >= 1 ? "text-amber-400" : "text-accent"}>
                  {priceImpact < 0.01 ? "< 0.01" : priceImpact.toFixed(2)}%
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Route</span>
              <span className="text-right truncate text-accent">
                {route.hops === 2 ? `${tokenIn.symbol} → wzkLTC → ${tokenOut.symbol}` : `${tokenIn.symbol} → ${tokenOut.symbol}`}
                {route.hops === 2 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20">SMART</span>}
              </span>
            </div>
            {pairAddr && pairAddr !== "0x0000000000000000000000000000000000000000" && route.hops === 1 && (
              <div className="flex justify-between gap-2">
                <span className="shrink-0">Pair</span>
                <a href={explorerAddr(pairAddr)} target="_blank" rel="noreferrer"
                   className="text-right truncate font-mono hover:text-accent">
                  {pairAddr.slice(0, 8)}…{pairAddr.slice(-6)} ↗
                </a>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-border/50">
              <span>Mode</span>
              <span className="text-accent">{tradeMode === "exactIn" ? "Exact input" : "Exact output"}</span>
            </div>
          </div>
        )}

        {priceImpact !== null && priceImpact >= 5 && (
          <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/40 text-xs text-destructive">
            ⚠ High price impact ({priceImpact.toFixed(2)}%). You will lose a significant amount to slippage. Consider a smaller trade.
          </div>
        )}



        <button
          onClick={handleAction}
          disabled={disabled}
          className="press relative mt-5 w-full py-4 rounded-xl bg-gradient-brand text-primary-foreground font-bold text-lg shadow-neon overflow-hidden hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {(isPending || pendingHash) && <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />}
            {!address ? "Connect wallet" : isPending || pendingHash ? "Confirming…" : buttonLabel}
          </span>
          {!disabled && (
            <span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12 animate-[shimmer-sweep_2.6s_ease-in-out_infinite]" />
          )}
        </button>
        </div>
        </div>

        {/* Right info column */}
        <div className="hidden lg:block animate-rise space-y-3 pt-8" style={{ animationDelay: "160ms" }}>
          <div className="rounded-2xl glass-strong border border-border p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Live route</div>
            {mode === "swap" && effOutWei > 0n && effInWei > 0n ? (
              <>
                <div className="text-sm font-medium">
                  {route.hops === 2 ? `${tokenIn.symbol} → wzkLTC → ${tokenOut.symbol}` : `${tokenIn.symbol} → ${tokenOut.symbol}`}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {route.hops === 2 ? "Smart routing engaged" : "Direct pair"}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Enter an amount to preview routing.</div>
            )}
          </div>
          <div className="rounded-2xl glass border border-border p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Tip</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Click the gear icon to fine-tune slippage tolerance and transaction deadline before confirming a trade.
            </p>
          </div>
        </div>
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
  const setPct = (pct: number) => {
    if (!balance || balance === 0n || !onAmountChange) return;
    const v = (balance * BigInt(pct)) / 100n;
    onAmountChange(fmt(v, token.decimals, 18));
  };
  return (
    <div className="bg-surface-2/50 rounded-2xl p-4 border border-border hover:border-primary/40 transition-colors overflow-hidden">
      <div className="flex justify-between text-xs text-muted-foreground mb-2 gap-2">
        <span className="shrink-0">{label}</span>
        <span className="truncate text-right">
          Balance: {fmt(balance, token.decimals)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          placeholder="0.0"
          readOnly={readOnly}
          value={amount}
          onChange={(e) => onAmountChange?.(e.target.value)}
          className="flex-1 min-w-0 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground/40 transition-colors focus:text-primary"
          aria-label={`${label} amount in ${token.symbol}`}
        />
        <TokenSelect value={token} onChange={onTokenChange} exclude={excludeFor} />
      </div>
      {!readOnly && balance !== undefined && balance > 0n && (
        <div className="mt-3 flex gap-1.5">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className="press flex-1 text-[11px] font-semibold py-1.5 rounded-lg bg-surface border border-border hover:border-primary/60 hover:bg-primary/10 hover:text-accent transition"
            >{p === 100 ? "MAX" : `${p}%`}</button>
          ))}
        </div>
      )}
    </div>
  );
}

