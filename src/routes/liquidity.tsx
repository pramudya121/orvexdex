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
import { formatUnits } from "viem";
import { useToast } from "@/components/ui/toaster";

type LiqSearch = { a?: string; b?: string; tab?: "add" | "remove" };

export const Route = createFileRoute("/liquidity")({
  component: LiquidityPage,
  head: () => ({
    meta: [
      { title: "Liquidity — ORVEX" },
      { name: "description", content: "Add or remove liquidity on ORVEX AMM pools. Earn LP fees from every swap on LitVM LiteForge." },
      { property: "og:title", content: "Liquidity — ORVEX" },
      { property: "og:description", content: "Add or remove liquidity on ORVEX AMM pools. Earn LP fees from every swap on LitVM LiteForge." },
      { property: "og:url", content: "https://orvexdex12.lovable.app/liquidity" },
      { name: "twitter:title", content: "Liquidity — ORVEX" },
      { name: "twitter:description", content: "Add or remove liquidity on ORVEX AMM pools. Earn LP fees from every swap on LitVM LiteForge." },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex12.lovable.app/liquidity" }],
  }),
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
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 right-1/4 h-[520px] w-[520px] rounded-full bg-[oklch(0.55_0.28_295)/0.25] blur-3xl animate-aurora" />
        <div className="absolute top-32 left-10 h-[420px] w-[420px] rounded-full bg-[oklch(0.65_0.22_220)/0.18] blur-3xl animate-aurora-2" />
        <div className="absolute bottom-0 right-10 h-[360px] w-[360px] rounded-full bg-[oklch(0.75_0.18_85)/0.18] blur-3xl animate-aurora" />
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 grid lg:grid-cols-[1fr_minmax(420px,460px)_1fr] gap-8 items-start">
        <div className="hidden lg:block animate-rise space-y-6 pt-8">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2/70 border border-border text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /> ORVEX · Liquidity
          </span>
          <h2 className="text-5xl font-bold leading-[1.05]">
            Provide liquidity.<br/>
            <span className="text-gradient-brand">Earn fees</span> on every swap.
          </h2>
          <p className="text-muted-foreground max-w-sm">
            Deposit a token pair, mint LP tokens, and collect 0.30% from every trade routed through your pool.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-accent">◆</span> Constant-product AMM (UniV2-style)</li>
            <li className="flex gap-2"><span className="text-accent">◆</span> Auto-zaps via WzkLTC for native zkLTC</li>
            <li className="flex gap-2"><span className="text-accent">◆</span> Withdraw anytime — no lockup</li>
          </ul>
        </div>

        <div className="animated-border rounded-3xl mx-auto w-full max-w-md animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="glass-strong rounded-3xl p-6 shadow-neon">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Liquidity</h1>
            <div className="text-[11px] text-muted-foreground mt-0.5">Mint or redeem LP positions</div>
          </div>
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

        <div className="hidden lg:block animate-rise space-y-3 pt-8" style={{ animationDelay: "160ms" }}>
          <div className="rounded-2xl glass-strong border border-border p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Fee tier</div>
            <div className="text-3xl font-bold text-gradient-brand">0.30%</div>
            <div className="text-[11px] text-muted-foreground mt-1">Pro-rata share to LP holders</div>
          </div>
          <div className="rounded-2xl glass border border-border p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Heads up</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Adding to a non-existent pair will create one and set the initial price from your deposit ratio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddLiquidity({ prefillA, prefillB }: { prefillA?: string; prefillB?: string }) {
  const { address } = useAccount();
  const toast = useToast();
  const [tokenA, setTokenA] = useState<Token>(() => findTokenByAddr(prefillA) ?? NATIVE);
  const [tokenB, setTokenB] = useState<Token>(() => findTokenByAddr(prefillB) ?? TOKENS.find((t) => t.symbol === "ORVX")!);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [lastEdited, setLastEdited] = useState<"A" | "B">("A");
  const [slipBps, setSlipBps] = useState(100);
  // When user clicks submit, keep going through approveA → approveB → add
  // automatically as each on-chain step confirms and allowance refetches.
  const [autoContinue, setAutoContinue] = useState(false);
  useEffect(() => {
    const a = findTokenByAddr(prefillA); const b = findTokenByAddr(prefillB);
    if (a) setTokenA(a); if (b) setTokenB(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillA, prefillB]);

  const amtAWei = safeParse(amountA, tokenA.decimals);
  const amtBWei = safeParse(amountB, tokenB.decimals);

  const nativeBal = useBalance({ address, query: { refetchInterval: 8000 } });
  const aBal = useTokenBalance(tokenA.isNative ? undefined : (tokenA.address as `0x${string}`), address);
  const bBal = useTokenBalance(tokenB.isNative ? undefined : (tokenB.address as `0x${string}`), address);
  const balA = tokenA.isNative ? nativeBal.data?.value : (aBal.data as bigint | undefined);
  const balB = tokenB.isNative ? nativeBal.data?.value : (bBal.data as bigint | undefined);

  const allowA = useAllowance(!tokenA.isNative ? (tokenA.address as `0x${string}`) : undefined, address);
  const allowB = useAllowance(!tokenB.isNative ? (tokenB.address as `0x${string}`) : undefined, address);

  const allowAVal = (allowA.data as bigint | undefined) ?? 0n;
  const allowBVal = (allowB.data as bigint | undefined) ?? 0n;
  const needA = !tokenA.isNative && allowAVal < amtAWei && amtAWei > 0n;
  const needB = !tokenB.isNative && allowBVal < amtBWei && amtBWei > 0n;
  const allowanceLoading =
    (!tokenA.isNative && (allowA.isLoading || allowA.isFetching)) ||
    (!tokenB.isNative && (allowB.isLoading || allowB.isFetching));

  // Pool / AMM lookup
  const aAddr = (tokenA.isNative ? ADDR.wzkLTC : tokenA.address) as `0x${string}`;
  const bAddr = (tokenB.isNative ? ADDR.wzkLTC : tokenB.address) as `0x${string}`;
  const pair = useGetPair(aAddr, bAddr);
  const pairAddr = pair.data as `0x${string}` | undefined;
  const pairExists = !!pairAddr && pairAddr !== "0x0000000000000000000000000000000000000000";
  const reservesQ = usePairReserves(pairExists ? pairAddr : undefined);
  const totalSupplyQ = useReadContract({
    address: pairExists ? pairAddr : undefined,
    abi: pairAbi, functionName: "totalSupply",
    query: { enabled: pairExists, refetchInterval: 8000 },
  });

  const { reserveA, reserveB } = useMemo(() => {
    if (!reservesQ.data || !pairExists) return { reserveA: 0n, reserveB: 0n };
    const reserves = reservesQ.data[0]?.result as readonly [bigint, bigint, number] | undefined;
    const t0 = reservesQ.data[1]?.result as `0x${string}` | undefined;
    if (!reserves || !t0) return { reserveA: 0n, reserveB: 0n };
    const isAToken0 = t0.toLowerCase() === aAddr.toLowerCase();
    return {
      reserveA: isAToken0 ? reserves[0] : reserves[1],
      reserveB: isAToken0 ? reserves[1] : reserves[0],
    };
  }, [reservesQ.data, pairExists, aAddr]);

  // Auto-quote the opposite side using the pool ratio
  useEffect(() => {
    if (!pairExists || reserveA === 0n || reserveB === 0n) return;
    if (lastEdited === "A" && amtAWei > 0n) {
      const out = (amtAWei * reserveB) / reserveA;
      setAmountB(formatUnits(out, tokenB.decimals));
    } else if (lastEdited === "B" && amtBWei > 0n) {
      const out = (amtBWei * reserveA) / reserveB;
      setAmountA(formatUnits(out, tokenA.decimals));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amtAWei, amtBWei, reserveA, reserveB, lastEdited, pairExists]);

  const totalSupply = (totalSupplyQ.data as bigint | undefined) ?? 0n;
  // share-of-pool estimate: lpMinted ≈ amtA * totalSupply / reserveA (when pool exists)
  const lpEstimated = pairExists && reserveA > 0n && totalSupply > 0n && amtAWei > 0n
    ? (amtAWei * totalSupply) / reserveA
    : 0n;
  const shareBps = pairExists && totalSupply > 0n && lpEstimated > 0n
    ? Number((lpEstimated * 10000n) / (totalSupply + lpEstimated))
    : 0;
  const priceAB = reserveA > 0n
    ? Number(formatUnits(reserveB, tokenB.decimals)) / Number(formatUnits(reserveA, tokenA.decimals))
    : 0;

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [pendingKind, setPendingKind] = useState<"approveA" | "approveB" | "add" | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Confirmed", type: "success", hash });
      const wasAdd = pendingKind === "add";
      setHash(undefined);
      setPendingKind(undefined);
      allowA.refetch(); allowB.refetch(); aBal.refetch(); bBal.refetch(); nativeBal.refetch();
      if (wasAdd) setAutoContinue(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  // Reset auto-continue when the user changes inputs/tokens (avoid surprise tx)
  useEffect(() => {
    setAutoContinue(false);
  }, [tokenA.address, tokenB.address]);

  // MINIMUM_LIQUIDITY = 1000 (UniV2). For first-mint, sqrt(amtA*amtB) must
  // exceed this or `addLiquidity` reverts with "INSUFFICIENT_LIQUIDITY_MINTED".
  const sqrtBig = (n: bigint): bigint => {
    if (n <= 0n) return 0n;
    let x = n, y = (n + 1n) / 2n;
    while (y < x) { x = y; y = (n / y + y) / 2n; }
    return x;
  };
  const initialMintEst = !pairExists && amtAWei > 0n && amtBWei > 0n
    ? sqrtBig(amtAWei * amtBWei)
    : 0n;
  const belowMinLiquidity = !pairExists && amtAWei > 0n && amtBWei > 0n && initialMintEst <= 1000n;

  // Off-chain ratio validation: when a pool exists, the deposit ratio MUST
  // be close to the current reserve ratio or the router will refund/revert.
  const ratioOffBps = useMemo(() => {
    if (!pairExists || reserveA === 0n || reserveB === 0n) return 0;
    if (amtAWei <= 0n || amtBWei <= 0n) return 0;
    const expectedB = (amtAWei * reserveB) / reserveA;
    if (expectedB === 0n) return 10000;
    const diff = amtBWei > expectedB ? amtBWei - expectedB : expectedB - amtBWei;
    return Number((diff * 10000n) / expectedB);
  }, [pairExists, reserveA, reserveB, amtAWei, amtBWei]);
  const ratioOff = ratioOffBps > slipBps;

  const submit = async () => {
    if (!address || amtAWei <= 0n || amtBWei <= 0n) return;
    // Decimal sanity: token metadata must be in valid ERC20 range.
    if (tokenA.decimals < 0 || tokenA.decimals > 36 || tokenB.decimals < 0 || tokenB.decimals > 36) {
      toast.push({ title: "Token decimals tidak valid", type: "error" });
      return;
    }
    // Guard: native balance must leave room for gas
    if (tokenA.isNative && balA !== undefined && amtAWei >= balA) {
      toast.push({ title: "Sisakan zkLTC untuk gas", description: "Kurangi sedikit jumlah zkLTC (klik MAX kemudian kurangi ~0.01).", type: "error" });
      return;
    }
    if (tokenB.isNative && balB !== undefined && amtBWei >= balB) {
      toast.push({ title: "Sisakan zkLTC untuk gas", description: "Kurangi sedikit jumlah zkLTC (klik MAX kemudian kurangi ~0.01).", type: "error" });
      return;
    }
    // Guard: balance must cover deposit on each side
    if (balA !== undefined && amtAWei > balA) {
      toast.push({ title: `Saldo ${tokenA.symbol} tidak cukup`, type: "error" });
      return;
    }
    if (balB !== undefined && amtBWei > balB) {
      toast.push({ title: `Saldo ${tokenB.symbol} tidak cukup`, type: "error" });
      return;
    }
    // Guard: deposit ratio must match pool ratio within slippage tolerance.
    if (pairExists && ratioOff) {
      toast.push({
        title: "Rasio tidak sesuai pool",
        description: `Selisih ${(ratioOffBps / 100).toFixed(2)}% > slippage ${(slipBps / 100).toFixed(2)}%. Edit salah satu sisi untuk auto-quote ulang, atau naikkan slippage.`,
        type: "error",
      });
      return;
    }
    // Guard: first-mint must clear MINIMUM_LIQUIDITY (1000 LP units).
    if (belowMinLiquidity) {
      toast.push({
        title: "Initial liquidity terlalu kecil",
        description: "Pool baru butuh sqrt(amountA × amountB) > 1000 wei. Naikkan jumlah deposit.",
        type: "error",
      });
      return;
    }
    // Guard: allowance still loading — avoid sending an addLiquidity that would revert on transferFrom
    if (allowanceLoading) {
      toast.push({ title: "Mengecek allowance…", description: "Coba lagi sebentar.", type: "info" as any });
      return;
    }
    try {
      if (needA) {
        const h = await writeContractAsync({ address: tokenA.address as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ADDR.router, MAX_UINT256] });
        setHash(h); setPendingKind("approveA"); toast.push({ title: `Approving ${tokenA.symbol}…`, hash: h });
        return;
      }
      if (needB) {
        const h = await writeContractAsync({ address: tokenB.address as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ADDR.router, MAX_UINT256] });
        setHash(h); setPendingKind("approveB"); toast.push({ title: `Approving ${tokenB.symbol}…`, hash: h });
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
          args: [tok.address as `0x${string}`, tokAmt, slippageMin(tokAmt, slipBps), slippageMin(ethAmt, slipBps), address, dl],
          value: ethAmt,
        });
      } else {
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "addLiquidity",
          args: [tokenA.address as `0x${string}`, tokenB.address as `0x${string}`, amtAWei, amtBWei, slippageMin(amtAWei, slipBps), slippageMin(amtBWei, slipBps), address, dl],
        });
      }
      setHash(h); setPendingKind("add"); toast.push({ title: "Adding liquidity…", hash: h });
    } catch (e: any) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || "Transaction reverted";
      toast.push({ title: "Failed", description: msg, type: "error" });
      setPendingKind(undefined);
      setAutoContinue(false);
    }
  };

  // Auto-continue: once an approve confirms and allowance is fresh, fire the
  // next required tx (second approve or addLiquidity) without user re-clicking.
  useEffect(() => {
    if (!autoContinue) return;
    if (isPending || hash) return;            // a tx is in-flight
    if (allowanceLoading) return;              // wait for fresh allowance
    if (amtAWei <= 0n || amtBWei <= 0n) return;
    if (pairExists && ratioOff) return;        // user must fix ratio first
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinue, isPending, hash, allowanceLoading, allowAVal, allowBVal]);

  const label = allowanceLoading
    ? "Checking allowance…"
    : ratioOff ? "Rasio tidak sesuai pool"
    : belowMinLiquidity ? "Initial liquidity terlalu kecil"
    : needA ? `Approve ${tokenA.symbol}` : needB ? `Approve ${tokenB.symbol}`
    : autoContinue ? "Continuing…"
    : "Add Liquidity";

  return (
    <>
      <Field label="Token A" token={tokenA} onChange={setTokenA} amount={amountA}
        setAmount={(v: string) => { setAmountA(v); setLastEdited("A"); }}
        balance={balA} exclude={tokenB} />
      <div className="text-center text-2xl text-muted-foreground my-2">+</div>
      <Field label="Token B" token={tokenB} onChange={setTokenB} amount={amountB}
        setAmount={(v: string) => { setAmountB(v); setLastEdited("B"); }}
        balance={balB} exclude={tokenA} />

      {/* AMM info panel */}
      <div className="mt-4 rounded-2xl bg-surface-2/40 border border-border p-4 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pool</span>
          <span className="font-mono">
            {pairExists ? <span className="text-accent">● Active</span> : <span className="text-amber-400">◇ Will be created</span>}
          </span>
        </div>
        {pairExists && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-mono">1 {tokenA.symbol} = {priceAB > 0 ? priceAB.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"} {tokenB.symbol}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Reserves</span>
              <span className="font-mono">{fmt(reserveA, tokenA.decimals, 2)} {tokenA.symbol} · {fmt(reserveB, tokenB.decimals, 2)} {tokenB.symbol}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Share of pool</span>
              <span className="font-mono">{shareBps > 0 ? `${(shareBps / 100).toFixed(shareBps < 100 ? 4 : 2)}%` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">LP minted (est.)</span>
              <span className="font-mono">{lpEstimated > 0n ? fmt(lpEstimated, 18, 6) : "—"}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-border/60 mt-2">
          <span className="text-muted-foreground">Slippage</span>
          <div className="flex gap-1">
            {[10, 50, 100, 300].map((bps) => (
              <button key={bps} onClick={() => setSlipBps(bps)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${slipBps === bps ? "bg-gradient-brand text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Min received</span>
          <span className="font-mono">{fmt(slippageMin(amtAWei, slipBps), tokenA.decimals, 4)} {tokenA.symbol} / {fmt(slippageMin(amtBWei, slipBps), tokenB.decimals, 4)} {tokenB.symbol}</span>
        </div>
      </div>

      <button
        onClick={() => { setAutoContinue(true); submit(); }}
        disabled={!address || amtAWei <= 0n || amtBWei <= 0n || isPending || !!hash || ratioOff || belowMinLiquidity}
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
            <button
              onClick={() => {
                // For native zkLTC keep ~0.01 for gas to avoid reverts
                if (token.isNative) {
                  const reserve = 10_000_000_000_000_000n; // 0.01
                  const usable = balance > reserve ? balance - reserve : 0n;
                  setAmount(fmt(usable, token.decimals, 18));
                } else {
                  setAmount(fmt(balance, token.decimals, 18));
                }
              }}
              className="text-accent hover:underline ml-1"
            >MAX</button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)}
          aria-label={`${label} amount in ${token.symbol}`}
          className="flex-1 min-w-0 w-full bg-transparent text-2xl font-bold outline-none" />
        <TokenSelect value={token} onChange={onChange} exclude={exclude} />
      </div>
    </div>
  );
}


function RemoveLiquidity({ prefillA, prefillB }: { prefillA?: string; prefillB?: string }) {
  const { address } = useAccount();
  const toast = useToast();
  const [tokenA, setTokenA] = useState<Token>(() => findTokenByAddr(prefillA) ?? WZKLTC);
  const [tokenB, setTokenB] = useState<Token>(() => findTokenByAddr(prefillB) ?? TOKENS.find((t) => t.symbol === "ORVX")!);
  const [pct, setPct] = useState(50);
  const [slipBps, setSlipBps] = useState(50);
  useEffect(() => {
    const a = findTokenByAddr(prefillA); const b = findTokenByAddr(prefillB);
    if (a) setTokenA(a); if (b) setTokenB(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillA, prefillB]);

  const a = (tokenA.isNative ? ADDR.wzkLTC : tokenA.address) as `0x${string}`;
  const b = (tokenB.isNative ? ADDR.wzkLTC : tokenB.address) as `0x${string}`;

  const pair = useGetPair(a, b);
  const pairAddr = pair.data as `0x${string}` | undefined;
  const pairExists = !!pairAddr && pairAddr !== "0x0000000000000000000000000000000000000000";
  const reservesQ = usePairReserves(pairExists ? pairAddr : undefined);
  const totalSupplyQ = useReadContract({
    address: pairExists ? pairAddr : undefined,
    abi: pairAbi, functionName: "totalSupply",
    query: { enabled: pairExists, refetchInterval: 8000 },
  });

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

  const totalSupply = (totalSupplyQ.data as bigint | undefined) ?? 0n;
  const { reserveA, reserveB } = useMemo(() => {
    if (!reservesQ.data || !pairExists) return { reserveA: 0n, reserveB: 0n };
    const reserves = reservesQ.data[0]?.result as readonly [bigint, bigint, number] | undefined;
    const t0 = reservesQ.data[1]?.result as `0x${string}` | undefined;
    if (!reserves || !t0) return { reserveA: 0n, reserveB: 0n };
    const isAToken0 = t0.toLowerCase() === a.toLowerCase();
    return {
      reserveA: isAToken0 ? reserves[0] : reserves[1],
      reserveB: isAToken0 ? reserves[1] : reserves[0],
    };
  }, [reservesQ.data, pairExists, a]);

  const expectedA = totalSupply > 0n ? (liquidity * reserveA) / totalSupply : 0n;
  const expectedB = totalSupply > 0n ? (liquidity * reserveB) / totalSupply : 0n;
  const userShareBps = totalSupply > 0n && balance > 0n ? Number((balance * 10000n) / totalSupply) : 0;

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
        const tokExpected = tokenA.isNative ? expectedB : expectedA;
        const ethExpected = tokenA.isNative ? expectedA : expectedB;
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "removeLiquidityETH",
          args: [tok.address as `0x${string}`, liquidity, slippageMin(tokExpected, slipBps), slippageMin(ethExpected, slipBps), address, dl],
        });
      } else {
        h = await writeContractAsync({
          address: ADDR.router, abi: routerAbi, functionName: "removeLiquidity",
          args: [a, b, liquidity, slippageMin(expectedA, slipBps), slippageMin(expectedB, slipBps), address, dl],
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
          aria-label="Percentage of LP tokens to remove"
          className="w-full accent-[oklch(0.65_0.27_295)]" />
        <div className="flex gap-2 mt-3">
          {[25, 50, 75, 100].map((v) => (
            <button key={v} onClick={() => setPct(v)} className="flex-1 py-1.5 rounded-lg bg-surface-2 text-xs hover:border-primary/60 border border-border">{v}%</button>
          ))}
        </div>
      </div>

      {/* AMM expected output */}
      <div className="mt-4 rounded-2xl bg-surface-2/40 border border-border p-4 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">You receive</span>
          <span className="font-mono text-gradient-brand font-semibold">
            {fmt(expectedA, tokenA.decimals, 6)} {tokenA.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">+</span>
          <span className="font-mono text-gradient-brand font-semibold">
            {fmt(expectedB, tokenB.decimals, 6)} {tokenB.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <span className="text-muted-foreground">Your pool share</span>
          <span className="font-mono">{userShareBps > 0 ? `${(userShareBps / 100).toFixed(userShareBps < 100 ? 4 : 2)}%` : "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Burning LP</span>
          <span className="font-mono">{fmt(liquidity, 18, 6)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="text-muted-foreground">Slippage</span>
          <div className="flex gap-1">
            {[10, 50, 100, 300].map((bps) => (
              <button key={bps} onClick={() => setSlipBps(bps)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${slipBps === bps ? "bg-gradient-brand text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {bps / 100}%
              </button>
            ))}
          </div>
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
