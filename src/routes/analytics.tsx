import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ADDR, explorerAddr } from "@/lib/chain";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { findToken } from "@/lib/tokens";
import { fmtWzk, usePoolStats, type PoolMeta } from "@/lib/poolStats";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
  head: () => ({
    meta: [
      { title: "Analytics — ORVEX" },
      { name: "description", content: "Global ORVEX stats: TVL, 24h volume, top pools, and liquidity distribution across LitVM AMM markets." },
      { property: "og:title", content: "Analytics — ORVEX" },
      { property: "og:description", content: "Global ORVEX stats: TVL, 24h volume, top pools, and liquidity distribution across LitVM AMM markets." },
      { property: "og:url", content: "https://orvexdex.lovable.app/analytics" },
      { name: "twitter:title", content: "Analytics — ORVEX" },
      { name: "twitter:description", content: "Global ORVEX stats: TVL, 24h volume, top pools, and liquidity distribution across LitVM AMM markets." },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/analytics" }],
  }),
});

function AnalyticsPage() {
  const len = useReadContract({ address: ADDR.factory, abi: factoryAbi, functionName: "allPairsLength", query: { refetchInterval: 30000 } });
  const total = Number((len.data as bigint | undefined) ?? 0n);

  const pairCalls = useMemo(() => Array.from({ length: total }, (_, i) => ({
    address: ADDR.factory as `0x${string}`, abi: factoryAbi,
    functionName: "allPairs" as const, args: [BigInt(i)] as const,
  })), [total]);
  const pairsQ = useReadContracts({ contracts: pairCalls, query: { enabled: total > 0 } });
  const pairAddrs = (pairsQ.data ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[];

  const calls = useMemo(() => pairAddrs.flatMap((p) => [
    { address: p, abi: pairAbi, functionName: "token0" as const },
    { address: p, abi: pairAbi, functionName: "token1" as const },
    { address: p, abi: pairAbi, functionName: "getReserves" as const },
  ]), [pairAddrs]);
  const meta = useReadContracts({ contracts: calls, query: { enabled: pairAddrs.length > 0, refetchInterval: 30000 } });

  const metas: PoolMeta[] = useMemo(() => pairAddrs.flatMap((pair, i) => {
    const t0 = meta.data?.[i * 3]?.result as `0x${string}` | undefined;
    const t1 = meta.data?.[i * 3 + 1]?.result as `0x${string}` | undefined;
    const r = meta.data?.[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
    if (!t0 || !t1 || !r) return [];
    return [{
      pair, token0: t0, token1: t1, reserve0: r[0], reserve1: r[1],
      decimals0: findToken(t0)?.decimals ?? 18,
      decimals1: findToken(t1)?.decimals ?? 18,
    }];
  }), [pairAddrs, meta.data]);
  const stats = usePoolStats(metas);

  const enriched = useMemo(() => metas.map((m) => {
    const s = stats.data?.stats.get(m.pair.toLowerCase());
    const tk0 = findToken(m.token0);
    const tk1 = findToken(m.token1);
    return {
      pair: m.pair, tk0, tk1,
      tvl: s?.tvlWzk ?? 0n,
      vol: s?.vol24Wzk ?? 0n,
      swaps: s?.swaps24 ?? 0,
    };
  }), [metas, stats.data]);

  const totalTvl = enriched.reduce<bigint>((a, p) => a + p.tvl, 0n);
  const totalVol = enriched.reduce<bigint>((a, p) => a + p.vol, 0n);
  const totalSwaps = enriched.reduce((a, p) => a + p.swaps, 0);
  const totalFees = (totalVol * 3n) / 1000n;
  const topByTvl = [...enriched].sort((a, b) => (a.tvl < b.tvl ? 1 : -1)).slice(0, 8);
  const topByVol = [...enriched].sort((a, b) => (a.vol < b.vol ? 1 : -1)).slice(0, 8);
  const maxTvl = topByTvl[0]?.tvl ?? 1n;
  const maxVol = topByVol[0]?.vol ?? 1n;

  return (
    <div className="relative max-w-6xl mx-auto px-4 py-12">
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[420px] overflow-hidden -z-10">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-3xl animate-aurora" style={{ background: "var(--gradient-luxe)" }} />
        <div className="absolute top-10 right-10 h-80 w-80 rounded-full blur-3xl animate-aurora-2" style={{ background: "var(--gradient-gold)" }} />
      </div>

      <div className="animate-rise mb-6">
        <div className="text-[11px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-2">Atelier · Insight</div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gradient-luxe tracking-tight">DEX Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Live protocol metrics on LitVM · {total} pools</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 animate-rise">
        <Stat label="TVL" value={fmtWzk(totalTvl)} unit="wzkLTC" tone="luxe" />
        <Stat label="24h Volume" value={fmtWzk(totalVol)} unit="wzkLTC" tone="brand" />
        <Stat label="24h Fees" value={fmtWzk(totalFees)} unit="wzkLTC" tone="gold" />
        <Stat label="24h Swaps" value={totalSwaps.toLocaleString()} unit="trades" tone="brand" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Top Pools by TVL" rows={topByTvl} max={maxTvl} field="tvl" tone="luxe" />
        <ChartCard title="Top Pools by 24h Volume" rows={topByVol} max={maxVol} field="vol" tone="gold" />
      </div>

      <div className="glass-strong rounded-3xl p-6 mt-6 animate-rise">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold tracking-tight">All pools</h2>
          <Link to="/pools" className="text-xs text-accent hover:underline">Open Pools page →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
                <th className="text-left py-2 pr-2">Pair</th>
                <th className="text-right py-2 px-2">TVL</th>
                <th className="text-right py-2 px-2">24h Vol</th>
                <th className="text-right py-2 px-2">24h Fees</th>
                <th className="text-right py-2 pl-2">Swaps</th>
              </tr>
            </thead>
            <tbody>
              {[...enriched].sort((a, b) => (a.tvl < b.tvl ? 1 : -1)).map((p) => (
                <tr key={p.pair} className="border-b border-border/50 hover:bg-surface-2/40 transition">
                  <td className="py-2.5 pr-2">
                    <a href={explorerAddr(p.pair)} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-accent">
                      <div className="flex -space-x-2">
                        {p.tk0 && <img src={p.tk0.logo} alt={`${p.tk0.symbol} token logo`} className="h-6 w-6 rounded-full ring-2 ring-background" />}
                        {p.tk1 && <img src={p.tk1.logo} alt={`${p.tk1.symbol} token logo`} className="h-6 w-6 rounded-full ring-2 ring-background" />}
                      </div>
                      <span className="font-semibold">{p.tk0?.symbol ?? "?"}–{p.tk1?.symbol ?? "?"}</span>
                    </a>
                  </td>
                  <td className="text-right font-mono px-2 text-gradient-gold">{fmtWzk(p.tvl)}</td>
                  <td className="text-right font-mono px-2">{fmtWzk(p.vol)}</td>
                  <td className="text-right font-mono px-2">{fmtWzk((p.vol * 3n) / 1000n)}</td>
                  <td className="text-right font-mono pl-2 text-muted-foreground">{p.swaps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {enriched.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">No pool data yet.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: "brand" | "luxe" | "gold" }) {
  const grad = tone === "luxe" ? "text-gradient-luxe" : tone === "gold" ? "text-gradient-gold" : "text-gradient-brand";
  return (
    <div className="glass rounded-2xl p-4 card-hover">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${grad}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{unit}</div>
    </div>
  );
}

function ChartCard({ title, rows, max, field, tone }: {
  title: string;
  rows: { pair: string; tk0?: any; tk1?: any; tvl: bigint; vol: bigint }[];
  max: bigint;
  field: "tvl" | "vol";
  tone: "luxe" | "gold";
}) {
  const bar = tone === "luxe" ? "bg-gradient-luxe" : "bg-gradient-gold";
  return (
    <div className="glass-strong rounded-3xl p-6 animate-rise">
      <h2 className="text-lg font-bold tracking-tight mb-4">{title}</h2>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">No data.</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((p) => {
            const v = p[field];
            const pct = max > 0n ? Number((v * 100n) / (max === 0n ? 1n : max)) : 0;
            return (
              <div key={p.pair} className="group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex -space-x-1.5 shrink-0">
                      {p.tk0 && <img src={p.tk0.logo} alt={`${p.tk0.symbol} token logo`} className="h-5 w-5 rounded-full ring-2 ring-background" />}
                      {p.tk1 && <img src={p.tk1.logo} alt={`${p.tk1.symbol} token logo`} className="h-5 w-5 rounded-full ring-2 ring-background" />}
                    </div>
                    <span className="font-semibold truncate">{p.tk0?.symbol ?? "?"}–{p.tk1?.symbol ?? "?"}</span>
                  </div>
                  <span className="font-mono text-muted-foreground tabular-nums">{fmtWzk(v)}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className={`h-full ${bar} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}