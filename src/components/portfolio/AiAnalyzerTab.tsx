import { useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Sparkles, ShieldAlert, TrendingUp, AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import { ADDR } from "@/lib/chain";
import { TOKENS, findToken } from "@/lib/tokens";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { fmt } from "@/lib/format";
import { fmtWzk } from "@/lib/poolStats";
import { analyzePortfolio, type AnalyzerResult } from "@/lib/aiAnalyzer.functions";

const WZK = ADDR.wzkLTC.toLowerCase();
const ONE = 10n ** 18n;

function priceInWzk(
  reserve0: bigint,
  reserve1: bigint,
  token0: string,
  token1: string,
  dec0: number,
  dec1: number,
): { addr: string; price: bigint } | null {
  if (reserve0 === 0n || reserve1 === 0n) return null;
  const t0 = token0.toLowerCase();
  const t1 = token1.toLowerCase();
  if (t0 === WZK) {
    const num = reserve0 * 10n ** BigInt(dec1);
    const den = reserve1 * 10n ** BigInt(dec0);
    if (den === 0n) return null;
    return { addr: t1, price: (num * ONE) / den };
  }
  if (t1 === WZK) {
    const num = reserve1 * 10n ** BigInt(dec0);
    const den = reserve0 * 10n ** BigInt(dec1);
    if (den === 0n) return null;
    return { addr: t0, price: (num * ONE) / den };
  }
  return null;
}

function toWzk(amount: bigint, decimals: number, price: bigint): bigint {
  if (amount === 0n) return 0n;
  const norm =
    decimals === 18
      ? amount
      : decimals < 18
        ? amount * 10n ** BigInt(18 - decimals)
        : amount / 10n ** BigInt(decimals - 18);
  return (norm * price) / ONE;
}

export function AiAnalyzerTab() {
  const { address, isConnected } = useAccount();
  const native = useBalance({ address, query: { refetchInterval: 15000 } });

  // Token balances
  const nonNative = useMemo(() => TOKENS.filter((t) => !t.isNative), []);
  const balanceCalls = useMemo(
    () =>
      nonNative.map((t) => ({
        address: t.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: address ? ([address] as const) : undefined,
      })),
    [address, nonNative],
  );
  const balances = useReadContracts({
    contracts: balanceCalls as any,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  // Pool discovery for price oracle
  const len = useReadContract({
    address: ADDR.factory,
    abi: factoryAbi,
    functionName: "allPairsLength",
  });
  const total = Number((len.data as bigint | undefined) ?? 0n);
  const pairCalls = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => ({
        address: ADDR.factory as `0x${string}`,
        abi: factoryAbi,
        functionName: "allPairs" as const,
        args: [BigInt(i)] as const,
      })),
    [total],
  );
  const pairs = useReadContracts({ contracts: pairCalls, query: { enabled: total > 0 } });
  const pairAddrs = useMemo(
    () =>
      ((pairs.data ?? [])
        .map((r) => r.result as `0x${string}` | undefined)
        .filter(Boolean) as `0x${string}`[]),
    [pairs.data],
  );

  const detailCalls = useMemo(
    () =>
      pairAddrs.flatMap((p) => [
        { address: p, abi: pairAbi, functionName: "token0" as const },
        { address: p, abi: pairAbi, functionName: "token1" as const },
        { address: p, abi: pairAbi, functionName: "getReserves" as const },
      ]),
    [pairAddrs],
  );
  const details = useReadContracts({
    contracts: detailCalls,
    query: { enabled: pairAddrs.length > 0, refetchInterval: 30000 },
  });

  // Build price map (token address lowercase → wzkLTC price scaled 1e18)
  const priceMap = useMemo(() => {
    const px = new Map<string, bigint>();
    px.set(WZK, ONE);
    if (!details.data) return px;
    for (let i = 0; i < pairAddrs.length; i++) {
      const t0 = details.data[i * 3]?.result as `0x${string}` | undefined;
      const t1 = details.data[i * 3 + 1]?.result as `0x${string}` | undefined;
      const r = details.data[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
      if (!t0 || !t1 || !r) continue;
      const meta0 = findToken(t0);
      const meta1 = findToken(t1);
      const dec0 = meta0?.decimals ?? 18;
      const dec1 = meta1?.decimals ?? 18;
      const entry = priceInWzk(r[0], r[1], t0, t1, dec0, dec1);
      if (entry && !px.has(entry.addr)) px.set(entry.addr, entry.price);
    }
    return px;
  }, [details.data, pairAddrs]);

  // Aggregate holdings valued in wzkLTC
  const snapshot = useMemo(() => {
    if (!address) return null;
    type Row = { symbol: string; amount: bigint; decimals: number; valueWzk: bigint };
    const rows: Row[] = [];

    const nativeAmt = native.data?.value ?? 0n;
    if (nativeAmt > 0n) {
      const priceWzk = priceMap.get(WZK) ?? ONE;
      rows.push({ symbol: "zkLTC", amount: nativeAmt, decimals: 18, valueWzk: toWzk(nativeAmt, 18, priceWzk) });
    }

    nonNative.forEach((t, i) => {
      const amt = (balances.data?.[i]?.result as bigint | undefined) ?? 0n;
      if (amt === 0n) return;
      const price = priceMap.get(t.address.toLowerCase()) ?? 0n;
      rows.push({ symbol: t.symbol, amount: amt, decimals: t.decimals, valueWzk: toWzk(amt, t.decimals, price) });
    });

    const total = rows.reduce((acc, r) => acc + r.valueWzk, 0n);
    return { rows, total };
  }, [address, native.data?.value, balances.data, nonNative, priceMap]);

  // LP + farming counts (lightweight)
  const lpBalCalls = useMemo(
    () =>
      address
        ? pairAddrs.map((p) => ({ address: p, abi: pairAbi, functionName: "balanceOf" as const, args: [address] as const }))
        : [],
    [pairAddrs, address],
  );
  const lpBals = useReadContracts({ contracts: lpBalCalls, query: { enabled: !!address && pairAddrs.length > 0 } });
  const lpCount = (lpBals.data ?? []).filter((r) => ((r?.result as bigint | undefined) ?? 0n) > 0n).length;

  const analyze = useServerFn(analyzePortfolio);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!snapshot || !address) throw new Error("No snapshot");
      const totalNum = Number(snapshot.total) / 1e18 || 1;
      return analyze({
        data: {
          address,
          totalValueWzk: (Number(snapshot.total) / 1e18).toFixed(4),
          holdings: snapshot.rows.map((r) => ({
            symbol: r.symbol,
            amount: fmt(r.amount, r.decimals, 6),
            valueWzk: (Number(r.valueWzk) / 1e18).toFixed(4),
            share: Number(r.valueWzk) / 1e18 / totalNum,
          })),
          lpCount,
          farmingCount: 0,
        },
      });
    },
  });

  if (!isConnected || !address) {
    return <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Connect a wallet to run AI analysis.</div>;
  }

  const loading = balances.isLoading || pairs.isLoading || details.isLoading;
  const empty = snapshot && snapshot.rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Snapshot header */}
      <div className="glass rounded-2xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Portfolio Value</div>
          <div className="text-3xl font-black tabular-nums text-gradient-luxe mt-1">
            {snapshot ? fmtWzk(snapshot.total, 4) : "—"}
            <span className="text-sm text-muted-foreground font-mono ml-2">wzkLTC</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {snapshot?.rows.length ?? 0} assets · {lpCount} LP · priced from live pool reserves
          </div>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={loading || empty || mutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mutation.data ? <RefreshCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {mutation.isPending ? "Analyzing…" : mutation.data ? "Re-analyze" : "Run AI Analysis"}
        </button>
      </div>

      {empty && (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
          No holdings detected yet. Grab test tokens from the Faucet, then run analysis.
        </div>
      )}

      {mutation.error && (
        <div className="glass rounded-2xl p-4 flex items-start gap-3 border border-destructive/40 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-destructive">Analysis failed</div>
            <div className="text-muted-foreground text-xs mt-1">{(mutation.error as Error).message}</div>
          </div>
        </div>
      )}

      {mutation.data && <AnalysisResult data={mutation.data} />}

      {!mutation.data && !mutation.isPending && !empty && (
        <div className="glass rounded-2xl p-6 text-sm text-muted-foreground flex items-start gap-3">
          <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-foreground mb-1">On-chain AI Analyst</div>
            Powered by Lovable AI. We send only your public wallet address, symbols, amounts, and wzkLTC-denominated values — never private keys.
            You'll get a risk score, diversification score, strengths, concerns, and concrete rebalance suggestions.
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisResult({ data }: { data: AnalyzerResult }) {
  return (
    <div className="space-y-4 animate-rise">
      {/* Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ScoreCard label="Risk Score" value={data.riskScore} accent="risk" icon={<ShieldAlert className="h-4 w-4" />} lowerIsBetter />
        <ScoreCard label="Diversification" value={data.diversification} accent="div" icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Summary */}
      <div className="glass rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-2">
          <Brain className="h-3.5 w-3.5" /> Summary
        </div>
        <p className="text-sm leading-relaxed">{data.summary}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <BulletCard title="Strengths" items={data.strengths} tone="pos" />
        <BulletCard title="Concerns" items={data.concerns} tone="neg" />
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" /> Recommendations
        </div>
        <ul className="space-y-2">
          {data.recommendations.map((r, i) => {
            const pair = extractSwapPair(r);
            return (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gradient-luxe shrink-0" />
                <div className="flex-1 flex items-start justify-between gap-3 flex-wrap">
                  <span className="flex-1 min-w-[200px]">{r}</span>
                  {pair && (
                    <Link
                      to="/swap"
                      search={{ from: pair.from, to: pair.to } as any}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-luxe text-primary-foreground text-[11px] font-bold uppercase tracking-wider shadow-neon hover:opacity-90 transition shrink-0"
                    >
                      Swap {pair.from} → {pair.to}
                    </Link>
                  )}
                  {!pair && /stake|farm/i.test(r) && (
                    <Link
                      to="/farm"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg glass hover:bg-surface-2 text-[11px] font-bold uppercase tracking-wider shrink-0"
                    >
                      Open Farm
                    </Link>
                  )}
                  {!pair && /liquidity|lp\b|provide/i.test(r) && (
                    <Link
                      to="/liquidity"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg glass hover:bg-surface-2 text-[11px] font-bold uppercase tracking-wider shrink-0"
                    >
                      Add Liquidity
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  accent,
  icon,
  lowerIsBetter,
}: {
  label: string;
  value: number;
  accent: "risk" | "div";
  icon: React.ReactNode;
  lowerIsBetter?: boolean;
}) {
  const good = lowerIsBetter ? value < 40 : value >= 60;
  const mid = value >= 40 && value < 60;
  const color = good ? "bg-accent" : mid ? "bg-amber-400" : "bg-destructive";
  const textColor = good ? "text-accent" : mid ? "text-amber-300" : "text-destructive";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-black tabular-nums ${textColor}`}>{value}</div>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        {lowerIsBetter ? "Lower = safer" : "Higher = better spread"}
      </div>
    </div>
  );
}

function BulletCard({ title, items, tone }: { title: string; items: string[]; tone: "pos" | "neg" }) {
  const dot = tone === "pos" ? "bg-accent" : "bg-destructive";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">{title}</div>
      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground">—</li>
        ) : (
          items.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className={`mt-1 h-1.5 w-1.5 rounded-full ${dot} shrink-0`} />
              <span>{s}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
