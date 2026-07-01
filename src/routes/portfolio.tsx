import { createFileRoute } from "@tanstack/react-router";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import { TOKENS } from "@/lib/tokens";
import { ADDR, explorerAddr } from "@/lib/chain";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { fmt } from "@/lib/format";
import { lazy, Suspense, useMemo, useState } from "react";
import { usePoolStats, fmtWzk, type PoolMeta } from "@/lib/poolStats";
import { findToken } from "@/lib/tokens";
import {
  ActivityFeedSkeleton,
  LPositionsSkeleton,
  PortfolioTokensSkeleton,
} from "@/components/skeletons";
import { SendTokenDialog } from "@/components/portfolio/SendTokenDialog";
import { FarmingPositions } from "@/components/portfolio/FarmingPositions";
import { Coins, Layers, Sprout, Activity, Send } from "lucide-react";

const ActivityFeed = lazy(() =>
  import("@/components/ActivityFeed").then((m) => ({ default: m.ActivityFeed })),
);


export const Route = createFileRoute("/portfolio")({
  component: PortfolioPage,
  pendingComponent: () => (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
      <PortfolioTokensSkeleton count={4} />
      <LPositionsSkeleton count={2} />
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Portfolio — ORVEX" },
      { name: "description", content: "Track your token balances, LP positions, and on-chain activity on ORVEX, valued live in wzkLTC." },
      { property: "og:title", content: "Portfolio — ORVEX" },
      { property: "og:description", content: "Track your token balances, LP positions, and on-chain activity on ORVEX, valued live in wzkLTC." },
      { property: "og:url", content: "https://orvexdex.lovable.app/portfolio" },
      { name: "twitter:title", content: "Portfolio — ORVEX" },
      { name: "twitter:description", content: "Track your token balances, LP positions, and on-chain activity on ORVEX, valued live in wzkLTC." },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/portfolio" }],
  }),
});

type PortfolioTab = "tokens" | "lp" | "farming";

function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const native = useBalance({ address, query: { refetchInterval: 10000 } });
  const [tab, setTab] = useState<PortfolioTab>("tokens");

  const balanceCalls = useMemo(
    () => TOKENS.filter((t) => !t.isNative).map((t) => ({
      address: t.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address] as const : undefined,
    })),
    [address],
  );

  const balances = useReadContracts({ contracts: balanceCalls as any, query: { enabled: !!address, refetchInterval: 10000 } });

  return (
    <div className="relative max-w-4xl mx-auto px-4 py-12">
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[360px] overflow-hidden -z-10">
        <div className="absolute top-0 left-10 h-72 w-72 rounded-full blur-3xl animate-aurora" style={{ background: "var(--gradient-luxe)" }} />
        <div className="absolute -top-10 right-0 h-72 w-72 rounded-full blur-3xl animate-aurora-2" style={{ background: "var(--gradient-gold)" }} />
      </div>
      <div className="animate-rise">
        <div className="text-[11px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-2">Atelier · Holdings</div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gradient-luxe">Your Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6 font-mono">
          {address ? `${address.slice(0, 10)}…${address.slice(-6)}` : "Connect wallet to view"}
        </p>
      </div>

      {isConnected && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 animate-rise" style={{ animationDelay: "60ms" }}>
          <KpiCard label="Native zkLTC" value={fmt(native.data?.value, 18, 4)} accent="luxe" />
          <KpiCard
            label="Token assets"
            value={String(
              (balances.data ?? []).filter((r) => ((r?.result as bigint | undefined) ?? 0n) > 0n).length
              + (((native.data?.value ?? 0n) > 0n) ? 1 : 0)
            )}
            accent="brand"
          />
          <KpiCard label="Network" value="LitVM" accent="gold" />
          <KpiCard label="Status" value="Live" accent="brand" pulse />
        </div>
      )}

      {!isConnected && (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Connect a wallet to see your balances, LP positions, and farming rewards.</div>
      )}

      {isConnected && (
        <>
          {/* Sub-header nav — Tokens / LP / Farming */}
          <div className="glass rounded-2xl p-1.5 flex items-center gap-1 mb-6 animate-rise">
            <TabButton active={tab === "tokens"} onClick={() => setTab("tokens")} icon={<Coins className="h-4 w-4" />} label="Tokens" />
            <TabButton active={tab === "lp"} onClick={() => setTab("lp")} icon={<Layers className="h-4 w-4" />} label="LP Positions" />
            <TabButton active={tab === "farming"} onClick={() => setTab("farming")} icon={<Sprout className="h-4 w-4" />} label="Farming" />
          </div>

          {tab === "tokens" && (
            <>
              <SectionHeader title="Tokens" subtitle="Live balances · tap Send to transfer" />
              {balances.isLoading && !balances.data ? (
                <PortfolioTokensSkeleton count={6} />
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  <TokenCard logo={TOKENS[0].logo} symbol="zkLTC" name="Native" balance={native.data?.value} decimals={18} />
                  {TOKENS.filter((t) => !t.isNative).map((t, i) => {
                    const b = balances.data?.[i]?.result as bigint | undefined;
                    return <TokenCard key={t.address + t.symbol} logo={t.logo} symbol={t.symbol} name={t.name} balance={b} decimals={t.decimals} address={t.address} />;
                  })}
                </div>
              )}
            </>
          )}

          {tab === "lp" && (
            <>
              <SectionHeader title="LP Positions" subtitle="Underlying assets · live" />
              <LPositions owner={address!} />
            </>
          )}

          {tab === "farming" && (
            <>
              <SectionHeader title="Farming" subtitle="Active staking positions · pending ORVX" />
              <FarmingPositions owner={address!} />
            </>
          )}

          <SectionHeader title="Recent Activity" subtitle="Streamed from LitVM logs" className="mt-10" />
          <Suspense fallback={<ActivityFeedSkeleton rows={5} />}>
            <ActivityFeed owner={address!} />
          </Suspense>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition ${
        active
          ? "bg-gradient-luxe text-primary-foreground shadow-neon"
          : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}


function SectionHeader({ title, subtitle, className = "" }: { title: string; subtitle?: string; className?: string }) {
  return (
    <div className={`flex items-end justify-between mb-3 ${className}`}>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {subtitle && <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

function KpiCard({ label, value, accent = "brand", pulse }: { label: string; value: string; accent?: "brand" | "luxe" | "gold"; pulse?: boolean }) {
  const grad = accent === "luxe" ? "text-gradient-luxe" : accent === "gold" ? "text-gradient-gold" : "text-gradient-brand";
  return (
    <div className="glass rounded-2xl p-4 card-hover relative overflow-hidden">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-2">
        {label}
        {pulse && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
      </div>
      <div className={`text-2xl font-black tabular-nums ${grad}`}>{value}</div>
    </div>
  );
}

function TokenCard({ logo, symbol, name, balance, decimals, address }: { logo: string; symbol: string; name: string; balance?: bigint; decimals: number; address?: string }) {
  return (
    <div className="glass rounded-2xl p-4 flex items-center justify-between card-hover animate-rise">
      <div className="flex items-center gap-3">
        <img src={logo} alt={`${symbol} token logo`} className="h-10 w-10 rounded-full ring-2 ring-white/5" />
        <div>
          <div className="font-semibold">{symbol}</div>
          <div className="text-xs text-muted-foreground">{name}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono font-semibold">{fmt(balance, decimals)}</div>
        {address && (
          <a href={explorerAddr(address)} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">contract ↗</a>
        )}
      </div>
    </div>
  );
}

function LPositions({ owner }: { owner: `0x${string}` }) {
  const len = useReadContract({ address: ADDR.factory, abi: factoryAbi, functionName: "allPairsLength", query: { refetchInterval: 20000 } });
  const total = Number((len.data as bigint | undefined) ?? 0n);

  const pairCalls = useMemo(
    () => Array.from({ length: total }, (_, i) => ({
      address: ADDR.factory as `0x${string}`,
      abi: factoryAbi,
      functionName: "allPairs" as const,
      args: [BigInt(i)] as const,
    })),
    [total],
  );
  const pairs = useReadContracts({ contracts: pairCalls, query: { enabled: total > 0 } });
  const pairAddrs = (pairs.data ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[];

  const balCalls = useMemo(
    () => pairAddrs.map((p) => ({ address: p, abi: pairAbi, functionName: "balanceOf" as const, args: [owner] as const })),
    [pairAddrs, owner],
  );
  const bals = useReadContracts({ contracts: balCalls, query: { enabled: pairAddrs.length > 0, refetchInterval: 12000 } });
  const heldPairs = pairAddrs.filter((_p, i) => {
    const b = bals.data?.[i]?.result as bigint | undefined;
    return b && b > 0n;
  });

  // Fetch metadata only for held pairs to power TVL pricing
  const metaCalls = useMemo(
    () => heldPairs.flatMap((p) => [
      { address: p, abi: pairAbi, functionName: "token0" as const },
      { address: p, abi: pairAbi, functionName: "token1" as const },
      { address: p, abi: pairAbi, functionName: "getReserves" as const },
      { address: p, abi: pairAbi, functionName: "totalSupply" as const },
    ]),
    [heldPairs],
  );
  const meta = useReadContracts({ contracts: metaCalls, query: { enabled: heldPairs.length > 0, refetchInterval: 15000 } });

  // Build PoolMeta list — must include ALL pairs so prices can be derived from wzkLTC pools.
  const allMetaCalls = useMemo(
    () => pairAddrs.flatMap((p) => [
      { address: p, abi: pairAbi, functionName: "token0" as const },
      { address: p, abi: pairAbi, functionName: "token1" as const },
      { address: p, abi: pairAbi, functionName: "getReserves" as const },
    ]),
    [pairAddrs],
  );
  const allMeta = useReadContracts({ contracts: allMetaCalls, query: { enabled: pairAddrs.length > 0, refetchInterval: 30000 } });
  const poolMetas: PoolMeta[] = useMemo(() => pairAddrs.flatMap((pair, i) => {
    const t0 = allMeta.data?.[i * 3]?.result as `0x${string}` | undefined;
    const t1 = allMeta.data?.[i * 3 + 1]?.result as `0x${string}` | undefined;
    const r = allMeta.data?.[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
    if (!t0 || !t1 || !r) return [];
    return [{
      pair, token0: t0, token1: t1,
      reserve0: r[0], reserve1: r[1],
      decimals0: findToken(t0)?.decimals ?? 18,
      decimals1: findToken(t1)?.decimals ?? 18,
    }];
  }), [pairAddrs, allMeta.data]);
  const stats = usePoolStats(poolMetas);

  const positions = heldPairs.map((p, i) => {
    const t0 = meta.data?.[i * 4]?.result as `0x${string}` | undefined;
    const t1 = meta.data?.[i * 4 + 1]?.result as `0x${string}` | undefined;
    const r = meta.data?.[i * 4 + 2]?.result as readonly [bigint, bigint, number] | undefined;
    const ts = meta.data?.[i * 4 + 3]?.result as bigint | undefined;
    const bal = bals.data?.[pairAddrs.indexOf(p)]?.result as bigint | undefined;
    const stat = stats.data?.stats.get(p.toLowerCase());
    const sharePct = bal && ts && ts > 0n ? Number((bal * 10000n) / ts) / 100 : 0;
    const valueWzk = bal && ts && ts > 0n && stat ? (stat.tvlWzk * bal) / ts : 0n;
    const underlying0 = bal && ts && ts > 0n && r ? (r[0] * bal) / ts : 0n;
    const underlying1 = bal && ts && ts > 0n && r ? (r[1] * bal) / ts : 0n;
    return { pair: p, bal: bal!, t0, t1, r, ts, valueWzk, sharePct,
      vol24Wzk: stat?.vol24Wzk ?? 0n, swaps24: stat?.swaps24 ?? 0,
      underlying0, underlying1 };
  });

  if (positions.length === 0) {
    if (pairs.isLoading || (pairAddrs.length > 0 && bals.isLoading)) {
      return <LPositionsSkeleton count={2} />;
    }
    return <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">No LP positions yet.</div>;
  }

  const totalValue = positions.reduce<bigint>((a, p) => a + p.valueWzk, 0n);

  return (
    <>
      <div className="glass-strong rounded-2xl p-4 mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total LP value</div>
          <div className="font-bold text-2xl text-gradient-gold">{fmtWzk(totalValue, 4)} <span className="text-sm text-muted-foreground">wzkLTC</span></div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Positions</div>
          <div className="font-bold text-2xl">{positions.length}</div>
        </div>
      </div>
      <div className="space-y-2">
        {positions.map((p) => (
          <LPRow
            key={p.pair}
            pair={p.pair}
            balance={p.bal}
            t0={p.t0} t1={p.t1}
            valueWzk={p.valueWzk}
            sharePct={p.sharePct}
            vol24Wzk={p.vol24Wzk}
            swaps24={p.swaps24}
            underlying0={p.underlying0}
            underlying1={p.underlying1}
          />
        ))}
      </div>
    </>
  );
}

function LPRow({ pair, balance, t0, t1, valueWzk, sharePct, vol24Wzk, swaps24, underlying0, underlying1 }: {
  pair: `0x${string}`;
  balance: bigint;
  t0?: `0x${string}`;
  t1?: `0x${string}`;
  valueWzk: bigint;
  sharePct: number;
  vol24Wzk: bigint;
  swaps24: number;
  underlying0: bigint;
  underlying1: bigint;
}) {
  const tk0 = t0 ? TOKENS.find((x) => x.address.toLowerCase() === t0.toLowerCase()) : undefined;
  const tk1 = t1 ? TOKENS.find((x) => x.address.toLowerCase() === t1.toLowerCase()) : undefined;
  return (
    <a href={explorerAddr(pair)} target="_blank" rel="noreferrer" className="glass rounded-2xl p-4 block card-hover animate-rise">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2 shrink-0">
            {tk0 && <img src={tk0.logo} alt={`${tk0.symbol} token logo`} className="h-9 w-9 rounded-full ring-2 ring-background" />}
            {tk1 && <img src={tk1.logo} alt={`${tk1.symbol} token logo`} className="h-9 w-9 rounded-full ring-2 ring-background" />}
          </div>
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              {tk0?.symbol ?? "?"} / {tk1?.symbol ?? "?"}
              {sharePct > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">{sharePct < 0.01 ? "<0.01" : sharePct.toFixed(2)}%</span>}
            </div>
            <div className="text-xs text-muted-foreground font-mono">{pair.slice(0, 8)}…{pair.slice(-4)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Position value</div>
          <div className="font-mono font-semibold text-gradient-gold">{fmtWzk(valueWzk, 4)} <span className="text-[10px] text-muted-foreground">wzkLTC</span></div>
          <div className="text-[10px] text-muted-foreground font-mono">{fmt(balance, 18, 4)} LP</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-border/60">
        <UnderlyingCell amount={underlying0} symbol={tk0?.symbol} decimals={tk0?.decimals ?? 18} logo={tk0?.logo} />
        <UnderlyingCell amount={underlying1} symbol={tk1?.symbol} decimals={tk1?.decimals ?? 18} logo={tk1?.logo} />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pool 24h vol</div>
          <div className="font-mono text-sm">{fmtWzk(vol24Wzk)} <span className="text-[10px] text-muted-foreground">wzkLTC</span></div>
          <div className="text-[10px] text-muted-foreground">{swaps24} swaps</div>
        </div>
      </div>
    </a>
  );
}

function UnderlyingCell({ amount, symbol, decimals, logo }: { amount: bigint; symbol?: string; decimals: number; logo?: string }) {
  const sym = symbol ?? "Token";
  const tooltip =
    `Your share of ${sym} held in the pool.\n` +
    `Formula: reserve × (your LP / totalSupply)\n` +
    `Updates live with reserves; uses ${decimals} decimals.`;
  return (
    <div className="group/cell relative" title={tooltip}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        Underlying {sym}
        <span
          role="img"
          aria-label={`More info about underlying ${sym}`}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[8px] text-muted-foreground/80"
        >i</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        {logo && <img src={logo} alt="" className="h-4 w-4 rounded-full" />}
        <span className="font-mono text-sm tabular-nums">{fmt(amount, decimals, 4)}</span>
        <span className="text-[10px] text-muted-foreground">{sym}</span>
      </div>
    </div>
  );
}
