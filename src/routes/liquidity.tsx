import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { TokenSelect } from "@/components/TokenSelect";
import { NATIVE, TOKENS, WZKLTC, type Token } from "@/lib/tokens";
import { ADDR } from "@/lib/chain";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { routerAbi } from "@/lib/abis/router";
import { pairAbi } from "@/lib/abis/pair";
import { useAllowance, useGetPair, usePairReserves, useTokenBalance, MAX_UINT256 } from "@/lib/hooks";
import { deadline, fmt, safeParse, slippageMin } from "@/lib/format";
import { useToast } from "@/components/ui/toaster";

type LiqSearch = { a?: string; b?: string; tab?: "add" | "remove" };

export const Route = createFileRoute("/liquidity")({
  component: LiquidityPage,
  head: () => ({ meta: [{ title: "Liquidity — ORVEX" }] }),
  validateSearch: (s: Record<string, unknown>): LiqSearch => ({
    a: typeof s.a === "string" ? s.a : undefined,
    b: typeof s.b === "string" ? s.b : undefined,
    tab: s.tab === "remove" ? "remove" : s.tab === "add" ? "add" : undefined,
  }),
});

function findTokenByAddr(addr?: string): Token | undefined {
  if (!addr) return undefined;
  const a = addr.toLowerCase();
  return TOKENS.find((t) => t.address.toLowerCase() === a);
}

function LiquidityPage() {
  const sp = Route.useSearch();
  const [tab, setTab] = useState<"add" | "remove">(sp.tab ?? "add");
  useEffect(() => { if (sp.tab) setTab(sp.tab); }, [sp.tab]);
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="glass-strong rounded-3xl p-6 shadow-neon">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold">Liquidity</h1>
          <div className="flex gap-1 bg-surface-2 rounded-xl p-1">
            <button
              onClick={() => setTab("add")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === "add" ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"}`}
            >Add</button>
            <button
              onClick={() => setTab("remove")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === "remove" ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"}`}
            >Remove</button>
          </div>
        </div>
        {tab === "add" ? <AddLiquidity prefillA={sp.a} prefillB={sp.b} /> : <RemoveLiquidity prefillA={sp.a} prefillB={sp.b} />}
      </div>
    </div>
  );
}

function AddLiquidity() {
  const { address } = useAccount();
  const toast = useToast();
  const [tokenA, setTokenA] = useState<Token>(NATIVE);
  const [tokenB, setTokenB] = useState<Token>(TOKENS.find((t) => t.symbol === "ORVX")!);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");

  const amtAWei = safeParse(amountA, tokenA.decimals);
  const amtBWei = safeParse(amountB, tokenB.decimals);

  const nativeBal = useBalance({ address, query: { refetchInterval: 8000 } });
  const aBal = useTokenBalance(tokenA.isNative ? undefined : (tokenA.address as `0x${string}`), address);
  const bBal = useTokenBalance(tokenB.isNative ? undefined : (tokenB.address as `0x${string}`), address);
  const balA = tokenA.isNative ? nativeBal.data?.value : (aBal.data as bigint | undefined);
  const balB = tokenB.isNative ? nativeBal.data?.value : (bBal.data as bigint | undefined);

  const allowA = useAllowance(!tokenA.isNative ? (tokenA.address as `0x${string}`) : undefined, address);
  const allowB = useAllowance(!tokenB.isNative ? (tokenB.address as `0x${string}`) : undefined, address);

  const needA = !tokenA.isNative && (allowA.data as bigint | undefined ?? 0n) < amtAWei && amtAWei > 0n;
  const needB = !tokenB.isNative && (allowB.data as bigint | undefined ?? 0n) < amtBWei && amtBWei > 0n;

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Confirmed", type: "success", hash });
      setHash(undefined);
      allowA.refetch(); allowB.refetch(); aBal.refetch(); bBal.refetch(); nativeBal.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const submit = async () => {
    if (!address || amtAWei <= 0n || amtBWei <= 0n) return;
    try {
      if (needA) {
        const h = await writeContractAsync({ address: tokenA.address as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ADDR.router, MAX_UINT256] });
        setHash(h); toast.push({ title: `Approving ${tokenA.symbol}…`, hash: h });
        return;
      }
      if (needB) {
        const h = await writeContractAsync({ address: tokenB.address as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ADDR.router, MAX_UINT256] });
        setHash(h); toast.push({ title: `Approving ${tokenB.symbol}…`, hash: h });
        return;
      }
      const dl = deadline(20);
      let h: `0x${string}`;
      if (tokenA.isNative || tokenB.isNative) {
        const tok = tokenA.isNative ? tokenB : tokenA;
        const tokAmt = tokenA.isNative ? amtBWei : amtAWei;
        const ethAmt = tokenA.isNative ? amtAWei : amtBWei;
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "addLiquidityETH",
          args: [tok.address as `0x${string}`, tokAmt, slippageMin(tokAmt), slippageMin(ethAmt), address, dl],
          value: ethAmt,
        });
      } else {
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "addLiquidity",
          args: [tokenA.address as `0x${string}`, tokenB.address as `0x${string}`, amtAWei, amtBWei, slippageMin(amtAWei), slippageMin(amtBWei), address, dl],
        });
      }
      setHash(h); toast.push({ title: "Adding liquidity…", hash: h });
    } catch (e: any) {
      toast.push({ title: "Failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const label = needA ? `Approve ${tokenA.symbol}` : needB ? `Approve ${tokenB.symbol}` : "Add Liquidity";

  return (
    <>
      <Field label="Token A" token={tokenA} onChange={setTokenA} amount={amountA} setAmount={setAmountA} balance={balA} exclude={tokenB} />
      <div className="text-center text-2xl text-muted-foreground my-2">+</div>
      <Field label="Token B" token={tokenB} onChange={setTokenB} amount={amountB} setAmount={setAmountB} balance={balB} exclude={tokenA} />
      <button
        onClick={submit}
        disabled={!address || amtAWei <= 0n || amtBWei <= 0n || isPending || !!hash}
        className="mt-5 w-full py-4 rounded-xl bg-gradient-brand text-primary-foreground font-bold text-lg shadow-neon disabled:opacity-40"
      >
        {!address ? "Connect wallet" : isPending || hash ? "Confirming…" : label}
      </button>
    </>
  );
}

function Field({ label, token, onChange, amount, setAmount, balance, exclude }: any) {
  return (
    <div className="bg-surface-2/50 rounded-2xl p-4 border border-border overflow-hidden">
      <div className="flex justify-between text-xs text-muted-foreground mb-2 gap-2">
        <span className="shrink-0">{label}</span>
        <span className="truncate text-right">
          Balance: {fmt(balance, token.decimals)}{" "}
          {balance !== undefined && balance > 0n && (
            <button onClick={() => setAmount(fmt(balance, token.decimals, 18))} className="text-accent hover:underline ml-1">MAX</button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="flex-1 min-w-0 w-full bg-transparent text-2xl font-bold outline-none" />
        <TokenSelect value={token} onChange={onChange} exclude={exclude} />
      </div>
    </div>
  );
}


function RemoveLiquidity() {
  const { address } = useAccount();
  const toast = useToast();
  const [tokenA, setTokenA] = useState<Token>(WZKLTC);
  const [tokenB, setTokenB] = useState<Token>(TOKENS.find((t) => t.symbol === "ORVX")!);
  const [pct, setPct] = useState(50);

  const a = (tokenA.isNative ? ADDR.wzkLTC : tokenA.address) as `0x${string}`;
  const b = (tokenB.isNative ? ADDR.wzkLTC : tokenB.address) as `0x${string}`;

  const pair = useGetPair(a, b);
  const pairAddr = pair.data as `0x${string}` | undefined;

  const lpBal = useReadContract({
    address: pairAddr,
    abi: pairAbi,
    functionName: "balanceOf",
    args: address && pairAddr ? [address] : undefined,
    query: { enabled: !!address && !!pairAddr && pairAddr !== "0x0000000000000000000000000000000000000000", refetchInterval: 8000 },
  });

  const lpAllow = useReadContract({
    address: pairAddr,
    abi: pairAbi,
    functionName: "allowance",
    args: address && pairAddr ? [address, ADDR.router] : undefined,
    query: { enabled: !!address && !!pairAddr, refetchInterval: 6000 },
  });

  const balance = (lpBal.data as bigint | undefined) ?? 0n;
  const liquidity = (balance * BigInt(pct)) / 100n;
  const needsApprove = (lpAllow.data as bigint | undefined ?? 0n) < liquidity && liquidity > 0n;

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Confirmed", type: "success", hash });
      setHash(undefined); lpBal.refetch(); lpAllow.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const submit = async () => {
    if (!address || liquidity <= 0n || !pairAddr) return;
    try {
      if (needsApprove) {
        const h = await writeContractAsync({ address: pairAddr, abi: pairAbi, functionName: "approve", args: [ADDR.router, MAX_UINT256] });
        setHash(h); toast.push({ title: "Approving LP…", hash: h });
        return;
      }
      const dl = deadline(20);
      let h: `0x${string}`;
      if (tokenA.isNative || tokenB.isNative) {
        const tok = tokenA.isNative ? tokenB : tokenA;
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "removeLiquidityETH",
          args: [tok.address as `0x${string}`, liquidity, 0n, 0n, address, dl],
        });
      } else {
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "removeLiquidity",
          args: [a, b, liquidity, 0n, 0n, address, dl],
        });
      }
      setHash(h); toast.push({ title: "Removing liquidity…", hash: h });
    } catch (e: any) {
      toast.push({ title: "Failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2/50 rounded-2xl p-3 border border-border">
          <div className="text-xs text-muted-foreground mb-2">Token A</div>
          <TokenSelect value={tokenA} onChange={setTokenA} exclude={tokenB} />
        </div>
        <div className="bg-surface-2/50 rounded-2xl p-3 border border-border">
          <div className="text-xs text-muted-foreground mb-2">Token B</div>
          <TokenSelect value={tokenB} onChange={setTokenB} exclude={tokenA} />
        </div>
      </div>

      <div className="mt-4 bg-surface-2/50 rounded-2xl p-4 border border-border">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>LP balance</span><span>{fmt(balance, 18)}</span>
        </div>
        <div className="text-4xl font-bold mb-3 text-gradient-brand">{pct}%</div>
        <input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(+e.target.value)}
          className="w-full accent-[oklch(0.65_0.27_295)]" />
        <div className="flex gap-2 mt-3">
          {[25, 50, 75, 100].map((v) => (
            <button key={v} onClick={() => setPct(v)} className="flex-1 py-1.5 rounded-lg bg-surface-2 text-xs hover:border-primary/60 border border-border">{v}%</button>
          ))}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!address || liquidity <= 0n || isPending || !!hash || !pairAddr || pairAddr === "0x0000000000000000000000000000000000000000"}
        className="mt-5 w-full py-4 rounded-xl bg-gradient-brand text-primary-foreground font-bold text-lg shadow-neon disabled:opacity-40"
      >
        {!address ? "Connect wallet" : isPending || hash ? "Confirming…" : !pairAddr || pairAddr === "0x0000000000000000000000000000000000000000" ? "No pair exists" : needsApprove ? "Approve LP Token" : "Remove Liquidity"}
      </button>
    </>
  );
}
