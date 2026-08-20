import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { DEXES, explorerAddr } from "@/lib/chain";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { routerAbi } from "@/lib/abis/router";
import { TOKENS } from "@/lib/tokens";
import { useTokenMeta, type TokenMeta } from "@/lib/tokenMeta";
import { TokenIcon } from "@/components/TokenIcon";
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
  const [dexId, setDexId] = useState<string>(DEXES[0].id);
  const dex = DEXES.find((d) => d.id === dexId) ?? DEXES[0];
  const factoryAddr = dex.factory;

  const len = useReadContract({ address: factoryAddr, abi: factoryAbi, functionName: "allPairsLength", query: { refetchInterval: 30000 } });
  const total = Number((len.data as bigint | undefined) ?? 0n);

  const pairCalls = useMemo(() => Array.from({ length: total }, (_, i) => ({
    address: factoryAddr as `0x${string}`, abi: factoryAbi,
    functionName: "allPairs" as const, args: [BigInt(i)] as const,
  })), [total, factoryAddr]);
  const pairsQ = useReadContracts({ contracts: pairCalls, query: { enabled: total > 0 } });
  const pairAddrs = (pairsQ.data ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[];

  const calls = useMemo(() => pairAddrs.flatMap((p) => [
    { address: p, abi: pairAbi, functionName: "token0" as const },
    { address: p, abi: pairAbi, functionName: "token1" as const },
    { address: p, abi: pairAbi, functionName: "getReserves" as const },
  ]), [pairAddrs]);
  const meta = useReadContracts({ contracts: calls, query: { enabled: pairAddrs.length > 0, refetchInterval: 30000 } });

  const raw = useMemo(() => pairAddrs.flatMap((pair, i) => {
    const t0 = meta.data?.[i * 3]?.result as `0x${string}` | undefined;
    const t1 = meta.data?.[i * 3 + 1]?.result as `0x${string}` | undefined;
    const r = meta.data?.[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
    if (!t0 || !t1 || !r) return [];
    return [{ pair, token0: t0, token1: t1, reserve0: r[0], reserve1: r[1] }];
  }), [pairAddrs, meta.data]);

  const tokenList = useMemo(() => raw.flatMap((p) => [p.token0, p.token1]), [raw]);
  const tokenMap = useTokenMeta(tokenList);

  const metas: PoolMeta[] = useMemo(() => raw.map((p) => ({
    ...p,
    decimals0: tokenMap.get(p.token0.toLowerCase())?.decimals ?? 18,
    decimals1: tokenMap.get(p.token1.toLowerCase())?.decimals ?? 18,
  })), [raw, tokenMap]);
  const stats = usePoolStats(metas);

  const enriched = useMemo(() => metas.map((m) => {
    const s = stats.data?.stats.get(m.pair.toLowerCase());
    return {
      pair: m.pair,
      tk0: tokenMap.get(m.token0.toLowerCase()),
      tk1: tokenMap.get(m.token1.toLowerCase()),
      tvl: s?.tvlWzk ?? 0n,
      vol: s?.vol24Wzk ?? 0n,
      swaps: s?.swaps24 ?? 0,
    };
  }), [metas, stats.data, tokenMap]);


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
        <p className="text-sm text-muted-foreground mt-1">Live protocol metrics on LitVM · {total} pools on {dex.name}</p>
      </div>

      {/* Multi-DEX selector */}
      <div className="glass rounded-2xl p-2 mb-5 inline-flex gap-1 animate-rise">
        {DEXES.map((d) => (
          <button
            key={d.id}
            onClick={() => setDexId(d.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.15em] transition ${
              dexId === d.id ? "bg-gradient-luxe text-primary-foreground shadow-neon" : "text-muted-foreground hover:text-foreground"
            }`}
            style={dexId === d.id ? undefined : { boxShadow: `inset 0 0 0 1px ${d.color}22` }}
          >
            <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ background: d.color }} />
            {d.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground mb-6">
        <a href={explorerAddr(dex.factory)} target="_blank" rel="noreferrer" className="glass rounded-xl px-3 py-1.5 hover:text-accent font-mono">
          Factory {dex.factory.slice(0, 8)}…{dex.factory.slice(-4)}
        </a>
        {dex.router && (
          <a href={explorerAddr(dex.router)} target="_blank" rel="noreferrer" className="glass rounded-xl px-3 py-1.5 hover:text-accent font-mono">
            Router {dex.router.slice(0, 8)}…{dex.router.slice(-4)}
          </a>
        )}
      </div>

      <RouterCompare />




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
                        <TokenIcon meta={p.tk0} size={24} />
                        <TokenIcon meta={p.tk1} size={24} />
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
  rows: { pair: string; tk0?: TokenMeta; tk1?: TokenMeta; tvl: bigint; vol: bigint }[];
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
                      <TokenIcon meta={p.tk0} size={20} />
                      <TokenIcon meta={p.tk1} size={20} />

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
const QUOTE_TOKENS = TOKENS.filter((t) => !t.isNative);

/** Compare execution price of the same trade across every registered DEX router. */
function RouterCompare() {
  const [inAddr, setInAddr] = useState(QUOTE_TOKENS[0].address);
  const [outAddr, setOutAddr] = useState(QUOTE_TOKENS[1]?.address ?? QUOTE_TOKENS[0].address);
  const [amount, setAmount] = useState("1");

  const tIn = QUOTE_TOKENS.find((t) => t.address === inAddr)!;
  const tOut = QUOTE_TOKENS.find((t) => t.address === outAddr)!;
  const wzk = QUOTE_TOKENS.find((t) => t.isWrapped)!;

  let amountIn = 0n;
  try { amountIn = parseUnits(amount || "0", tIn.decimals); } catch { amountIn = 0n; }

  const routers = DEXES.filter((d) => !!d.router);
  const direct = [tIn.address, tOut.address] as `0x${string}`[];
  const hop = [tIn.address, wzk.address, tOut.address] as `0x${string}`[];
  const useHop = tIn.address !== wzk.address && tOut.address !== wzk.address;

  const contracts = useMemo(() => routers.flatMap((d) => {
    const base = { address: d.router as `0x${string}`, abi: routerAbi, functionName: "getAmountsOut" as const };
    return [
      { ...base, args: [amountIn, direct] as const },
      { ...base, args: [amountIn, useHop ? hop : direct] as const },
    ];
  }), [routers.length, amountIn, inAddr, outAddr, useHop]);

  const q = useReadContracts({
    contracts,
    query: { enabled: amountIn > 0n && inAddr !== outAddr, refetchInterval: 20000 },
  });

  const results = routers.map((d, i) => {
    const a = q.data?.[i * 2]?.result as readonly bigint[] | undefined;
    const b = q.data?.[i * 2 + 1]?.result as readonly bigint[] | undefined;
    const va = a ? a[a.length - 1] : 0n;
    const vb = b ? b[b.length - 1] : 0n;
    const best = va > vb ? va : vb;
    return { dex: d, out: best, viaHop: vb > va && useHop };
  });
  const bestOut = results.reduce<bigint>((m, r) => (r.out > m ? r.out : m), 0n);

  return (
    <div className="glass-strong rounded-3xl p-6 mb-6 animate-rise">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Cross-DEX Router Quotes</h2>
          <p className="text-xs text-muted-foreground">Live getAmountsOut from every registered router.</p>
        </div>
        <Link to="/swap" className="text-xs text-accent hover:underline">Trade on Swap →</Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 mb-4">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Amount"
          className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-accent/50"
        />
        <select value={inAddr} onChange={(e) => setInAddr(e.target.value as `0x${string}`)} className="rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none">
          {QUOTE_TOKENS.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
        <select value={outAddr} onChange={(e) => setOutAddr(e.target.value as `0x${string}`)} className="rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none">
          {QUOTE_TOKENS.map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {results.map((r) => {
          const isBest = r.out > 0n && r.out === bestOut;
          return (
            <div key={r.dex.id} className={`flex items-center justify-between rounded-2xl px-4 py-3 transition ${isBest ? "bg-surface-2 shadow-neon" : "bg-surface-2/40"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.dex.color }} />
                {r.dex.name}
                {r.viaHop && <span className="text-[10px] uppercase tracking-widest text-muted-foreground">via {wzk.symbol}</span>}
                {isBest && <span className="text-[10px] uppercase tracking-widest text-gradient-gold">best</span>}
              </div>
              <div className="font-mono tabular-nums text-sm">
                {r.out > 0n ? `${Number(formatUnits(r.out, tOut.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tOut.symbol}` : "—"}
              </div>
            </div>
          );
        })}
      </div>
      {inAddr === outAddr && <div className="text-xs text-muted-foreground mt-3">Pick two different tokens.</div>}
    </div>
  );
}
