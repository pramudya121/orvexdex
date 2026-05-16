import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ADDR, explorerAddr } from "@/lib/chain";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { findToken, TOKENS, type Token } from "@/lib/tokens";
import { fmt } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { usePoolStats, fmtWzk, type PoolMeta } from "@/lib/poolStats";
import { useToast } from "@/components/ui/toaster";
import { PoolGridSkeleton, PoolStatsSkeleton } from "@/components/skeletons";

type SortKey = "tvl" | "supply" | "new" | "vol";
type Filter = "all" | "stable" | "blue" | "high" | "mine";

export const Route = createFileRoute("/pools")({
  component: PoolsPage,
  pendingComponent: () => (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <PoolStatsSkeleton />
      <PoolGridSkeleton count={8} />
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Pools — ORVEX" },
      { name: "description", content: "Explore liquidity pools on ORVEX. Filter by TVL, volume, and LP supply across LitVM AMM markets." },
      { property: "og:title", content: "Pools — ORVEX" },
      { property: "og:description", content: "Explore liquidity pools on ORVEX. Filter by TVL, volume, and LP supply across LitVM AMM markets." },
      { property: "og:url", content: "https://orvexdex12.lovable.app/pools" },
      { name: "twitter:title", content: "Pools — ORVEX" },
      { name: "twitter:description", content: "Explore liquidity pools on ORVEX. Filter by TVL, volume, and LP supply across LitVM AMM markets." },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex12.lovable.app/pools" }],
  }),
});

function PoolsPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("tvl");
  const [filter, setFilter] = useState<Filter>("all");

  const len = useReadContract({ address: ADDR.factory, abi: factoryAbi, functionName: "allPairsLength", query: { refetchInterval: 15000 } });
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
  const pairAddrs = (pairs.data ?? [])
    .map((r) => r.result as `0x${string}` | undefined)
    .filter(Boolean) as `0x${string}`[];

  return (
    <div className="relative max-w-7xl mx-auto px-4 py-10">
      {/* Aurora backdrop */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[520px] overflow-hidden -z-10">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-3xl animate-aurora" style={{ background: "var(--gradient-luxe)" }} />
        <div className="absolute top-10 right-10 h-80 w-80 rounded-full blur-3xl animate-aurora-2" style={{ background: "var(--gradient-gold)" }} />
      </div>

      <div className="mb-6 animate-rise">
        <div className="text-[11px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-2">Atelier · Liquidity</div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gradient-luxe tracking-tight">Pools</h1>
        <p className="text-sm text-muted-foreground mt-1">All liquidity pairs on ORVEX • <span className="text-foreground/80 font-semibold">{total}</span> pools live</p>
      </div>

      <PoolList
        pairAddrs={pairAddrs}
        q={q}
        sort={sort}
        filter={filter}
        setQ={setQ}
        setSort={setSort}
        setFilter={setFilter}
        total={total}
        isLoading={len.isLoading || pairs.isLoading}
      />

      <CreatePairCard />
    </div>
  );
}

function PoolList({
  pairAddrs, q, sort, filter, setQ, setSort, setFilter, total, isLoading,
}: {
  pairAddrs: `0x${string}`[]; q: string; sort: SortKey; filter: Filter;
  setQ: (v: string) => void; setSort: (s: SortKey) => void; setFilter: (f: Filter) => void; total: number;
  isLoading?: boolean;
}) {
  const { address } = useAccount();

  // Fetch metadata for all pairs in batched contract reads
  const calls = useMemo(
    () => pairAddrs.flatMap((p) => [
      { address: p, abi: pairAbi, functionName: "token0" as const },
      { address: p, abi: pairAbi, functionName: "token1" as const },
      { address: p, abi: pairAbi, functionName: "getReserves" as const },
      { address: p, abi: pairAbi, functionName: "totalSupply" as const },
    ]),
    [pairAddrs],
  );
  const meta = useReadContracts({ contracts: calls, query: { enabled: pairAddrs.length > 0, refetchInterval: 15000 } });

  const myCalls = useMemo(
    () => (address ? pairAddrs.map((p) => ({ address: p, abi: pairAbi, functionName: "balanceOf" as const, args: [address] as const })) : []),
    [pairAddrs, address],
  );
  const myBals = useReadContracts({ contracts: myCalls, query: { enabled: !!address && pairAddrs.length > 0, refetchInterval: 15000 } });

  const poolMetas: PoolMeta[] = useMemo(() => {
    return pairAddrs.flatMap((pair, i) => {
      const t0 = meta.data?.[i * 4]?.result as `0x${string}` | undefined;
      const t1 = meta.data?.[i * 4 + 1]?.result as `0x${string}` | undefined;
      const r = meta.data?.[i * 4 + 2]?.result as readonly [bigint, bigint, number] | undefined;
      if (!t0 || !t1 || !r) return [];
      const tk0 = findToken(t0);
      const tk1 = findToken(t1);
      return [{
        pair, token0: t0, token1: t1,
        reserve0: r[0], reserve1: r[1],
        decimals0: tk0?.decimals ?? 18,
        decimals1: tk1?.decimals ?? 18,
      }];
    });
  }, [pairAddrs, meta.data]);
  const stats = usePoolStats(poolMetas);

  const enriched = useMemo(() => {
    return pairAddrs.map((pair, i) => {
      const t0 = meta.data?.[i * 4]?.result as `0x${string}` | undefined;
      const t1 = meta.data?.[i * 4 + 1]?.result as `0x${string}` | undefined;
      const r = meta.data?.[i * 4 + 2]?.result as readonly [bigint, bigint, number] | undefined;
      const ts = meta.data?.[i * 4 + 3]?.result as bigint | undefined;
      const myLp = myBals.data?.[i]?.result as bigint | undefined;
      const tk0 = t0 ? findToken(t0) : undefined;
      const tk1 = t1 ? findToken(t1) : undefined;
      const stat = stats.data?.stats.get(pair.toLowerCase());
      const tvl = stat?.tvlWzk ?? 0n;
      const vol = stat?.vol24Wzk ?? 0n;
      const swaps = stat?.swaps24 ?? 0;
      return { pair, idx: i, t0, t1, tk0, tk1, r, ts, myLp, tvl, vol, swaps };
    });
  }, [pairAddrs, meta.data, myBals.data, stats.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = enriched;
    if (term) {
      out = out.filter((p) =>
        p.pair.toLowerCase().includes(term) ||
        p.tk0?.symbol.toLowerCase().includes(term) ||
        p.tk1?.symbol.toLowerCase().includes(term) ||
        p.tk0?.name.toLowerCase().includes(term) ||
        p.tk1?.name.toLowerCase().includes(term),
      );
    }
    const STABLE = new Set(["USDT", "USDC", "DAI", "wzkLTC"]);
    const BLUE = new Set(["zkLTC", "wzkLTC", "TRX", "XRP", "ADA"]);
    if (filter === "mine") out = out.filter((p) => (p.myLp ?? 0n) > 0n);
    else if (filter === "stable") out = out.filter((p) => STABLE.has(p.tk0?.symbol ?? "") && STABLE.has(p.tk1?.symbol ?? ""));
    else if (filter === "blue") out = out.filter((p) => BLUE.has(p.tk0?.symbol ?? "") || BLUE.has(p.tk1?.symbol ?? ""));
    else if (filter === "high") out = [...out].sort((a, b) => (a.vol < b.vol ? 1 : -1));
    if (sort === "tvl") out = [...out].sort((a, b) => (a.tvl < b.tvl ? 1 : a.tvl > b.tvl ? -1 : 0));
    else if (sort === "vol") out = [...out].sort((a, b) => (a.vol < b.vol ? 1 : a.vol > b.vol ? -1 : 0));
    else if (sort === "supply") out = [...out].sort((a, b) => ((a.ts ?? 0n) < (b.ts ?? 0n) ? 1 : (a.ts ?? 0n) > (b.ts ?? 0n) ? -1 : 0));
    else out = [...out].sort((a, b) => b.idx - a.idx);
    return out;
  }, [enriched, q, sort, filter]);

  // Aggregate totals across visible pools
  const totalTvl = enriched.reduce<bigint>((a, p) => a + p.tvl, 0n);
  const totalVol = enriched.reduce<bigint>((a, p) => a + p.vol, 0n);
  const totalSwaps = enriched.reduce<number>((a, p) => a + p.swaps, 0);
  const totalFees = (totalVol * 3n) / 1000n; // 0.3% fee tier
  const trending = [...enriched].sort((a, b) => (a.vol < b.vol ? 1 : -1)).slice(0, 6);
  const metaLoading = pairAddrs.length > 0 && meta.isLoading && !meta.data;
  const showInitialSkeleton = !!isLoading && pairAddrs.length === 0 && total === 0;

  return (
    <>
      {/* Top stats row */}
      {showInitialSkeleton ? (
        <PoolStatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5 animate-rise">
          <BigStat label="Total Value Locked" value={fmtWzk(totalTvl)} unit="wzkLTC" tone="violet" />
          <BigStat label="Avg Fee Tier" value="0.30%" unit="per swap" tone="cyan" />
          <BigStat label="24h Volume" value={fmtWzk(totalVol)} unit="wzkLTC" tone="cyan" />
          <BigStat label="Total Fees (24h)" value={fmtWzk(totalFees)} unit="wzkLTC" tone="gold" />
          <BigStat label="Total Pools" value={String(total)} unit="live" tone="violet" />
        </div>
      )}

      {/* Filter / Control bar */}
      <div className="glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 animate-rise" style={{ animationDelay: "60ms" }}>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter & Control</div>
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2 border border-border">
          <span className="text-muted-foreground text-sm">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            aria-label="Search pools"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort pools"
            className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs focus:border-primary outline-none"
          >
            <option value="tvl">TVL</option>
            <option value="vol">Volume</option>
            <option value="supply">LP Supply</option>
            <option value="new">Newest</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5 animate-rise" style={{ animationDelay: "90ms" }}>
        {([
          { k: "all", l: "All" },
          { k: "stable", l: "Stable Pairs" },
          { k: "blue", l: "Blue Chip" },
          { k: "high", l: "High Volume" },
          { k: "mine", l: "My Pools" },
        ] as { k: Filter; l: string }[]).map(({ k, l }) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === k
                ? "bg-gradient-luxe text-primary-foreground border-transparent shadow-neon"
                : "bg-surface-2 border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
            }`}
          >{l}</button>
        ))}
      </div>

      {showInitialSkeleton || metaLoading ? (
        <PoolGridSkeleton count={8} />
      ) : pairAddrs.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground mb-8">
          No pools yet. <Link to="/liquidity" className="text-accent hover:underline">Be the first to add liquidity →</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm mb-8">No pools match your filters.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {filtered.map((p, idx) => (
            <PoolCard key={p.pair} p={p} idx={idx} />
          ))}
        </div>
      )}

      {/* Floating Create New Pool CTA */}
      <div className="flex justify-center my-8 animate-rise" style={{ animationDelay: "150ms" }}>
        <Link
          to="/liquidity"
          className="group inline-flex items-center gap-3 px-8 py-4 rounded-full bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:shadow-gold hover:-translate-y-0.5 transition-all"
        >
          <span className="text-2xl">✨</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-lg">Create New Pool</span>
            <span className="text-[11px] opacity-80 font-medium">Add Liquidity → Earn 0.3% fees</span>
          </span>
        </Link>
      </div>

      {/* Trending pools (compact list) */}
      {trending.length > 0 && (
        <div className="glass-strong rounded-3xl p-6 animate-rise" style={{ animationDelay: "180ms" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">🔥 Trending Pools</h2>
            <span className="text-xs text-muted-foreground">Sorted by 24h volume</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {trending.map((p) => (
              <Link
                key={p.pair}
                to="/swap"
                search={{ from: p.t0, to: p.t1 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 border border-border hover:border-primary/40 transition"
              >
                <div className="flex -space-x-2 shrink-0">
                  {p.tk0 && <img src={p.tk0.logo} alt={p.tk0.symbol} className="h-7 w-7 rounded-full ring-2 ring-background" />}
                  {p.tk1 && <img src={p.tk1.logo} alt={p.tk1.symbol} className="h-7 w-7 rounded-full ring-2 ring-background" />}
                </div>
                <div className="font-semibold text-sm flex-1 truncate">{p.tk0?.symbol ?? "?"}-{p.tk1?.symbol ?? "?"}</div>
                <div className="font-mono text-xs text-gradient-gold tabular-nums">{fmtWzk(p.vol)}</div>
                <div className="text-[10px] text-muted-foreground">{p.swaps} sw</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PoolCard({ p, idx }: { p: any; idx: number }) {
        const sharePct = p.myLp && p.ts && p.ts > 0n
          ? Number((p.myLp * 10000n) / p.ts) / 100
          : 0;
        return (
          <div
            className="glass rounded-2xl p-5 card-hover group animate-rise relative overflow-hidden"
            style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
          >
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl opacity-30 group-hover:opacity-60 transition-opacity" style={{ background: "var(--gradient-luxe)" }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border font-mono uppercase tracking-wider text-muted-foreground">
                  {p.tk0?.symbol ?? "?"}-{p.tk1?.symbol ?? "?"}
                </span>
                {sharePct > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">YOURS</span>
                )}
              </div>
              <div className="flex items-center justify-center my-5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-xl opacity-50" style={{ background: "var(--gradient-luxe)" }} />
                  <div className="relative flex -space-x-3">
                    {p.tk0 && <img src={p.tk0.logo} alt={p.tk0.symbol} className="h-14 w-14 rounded-full ring-4 ring-background" />}
                    {p.tk1 && <img src={p.tk1.logo} alt={p.tk1.symbol} className="h-14 w-14 rounded-full ring-4 ring-background" />}
                  </div>
                </div>
              </div>
              <div className="text-center mb-3">
                <div className="font-bold text-lg tracking-tight">{p.tk0?.symbol ?? "?"}–{p.tk1?.symbol ?? "?"}</div>
                <a href={explorerAddr(p.pair)} target="_blank" rel="noreferrer"
                  className="text-[10px] text-muted-foreground font-mono hover:text-accent">
                  {p.pair.slice(0, 8)}…{p.pair.slice(-4)} ↗
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="rounded-lg bg-surface-2/60 p-2">
                  <div className="text-[9px] uppercase text-muted-foreground tracking-wider">TVL</div>
                  <div className="font-mono font-semibold text-gradient-gold tabular-nums">{fmtWzk(p.tvl)}</div>
                </div>
                <div className="rounded-lg bg-surface-2/60 p-2">
                  <div className="text-[9px] uppercase text-muted-foreground tracking-wider">24h Vol</div>
                  <div className="font-mono tabular-nums">{fmtWzk(p.vol)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-3 px-1">
                <span>0.3% Fee</span>
                <span>{p.swaps} swaps</span>
                <span>LP {fmt(p.ts, 18, 1)}</span>
              </div>
              <Link
                to="/liquidity"
                search={{ a: p.t0, b: p.t1 }}
                className="block w-full text-center py-2.5 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-semibold hover:opacity-95 transition shadow-neon"
              >Add Liquidity</Link>
            </div>
          </div>
        );
}

function BigStat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: "violet" | "cyan" | "gold" }) {
  const grad = tone === "gold" ? "text-gradient-gold" : tone === "cyan" ? "text-accent" : "text-gradient-luxe";
  return (
    <div className="glass rounded-2xl p-4 card-hover">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">{label}</div>
      <div className={`font-black text-2xl tabular-nums ${grad}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{unit}</div>
    </div>
  );
}

function CreatePairCard() {
  const toast = useToast();
  const [a, setA] = useState<Token>(TOKENS[0]);
  const [b, setB] = useState<Token>(TOKENS[2]);
  const aAddr = (a.isNative ? ADDR.wzkLTC : a.address) as `0x${string}`;
  const bAddr = (b.isNative ? ADDR.wzkLTC : b.address) as `0x${string}`;
  const sameToken = aAddr.toLowerCase() === bAddr.toLowerCase();
  const existing = useReadContract({
    address: ADDR.factory, abi: factoryAbi, functionName: "getPair",
    args: [aAddr, bAddr],
    query: { enabled: !sameToken, refetchInterval: 10000 },
  });
  const exists = !!existing.data && existing.data !== "0x0000000000000000000000000000000000000000";

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Pair created", type: "success", hash });
      setHash(undefined);
      existing.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const create = async () => {
    try {
      const h = await writeContractAsync({
        address: ADDR.factory, abi: factoryAbi, functionName: "createPair", args: [aAddr, bAddr],
      });
      setHash(h);
      toast.push({ title: "Creating pair…", hash: h });
    } catch (e: any) {
      toast.push({ title: "Failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  return (
    <div className="glass rounded-2xl p-5 mt-8">
      <h2 className="font-bold mb-1">Create New Pair</h2>
      <p className="text-xs text-muted-foreground mb-4">Pre-create an empty pool so others can add liquidity. Creating then adding liquidity in one click is also done automatically by Add Liquidity.</p>
      <div className="flex flex-wrap items-center gap-2">
        <PairTokenPicker value={a} onChange={setA} />
        <span className="text-muted-foreground">/</span>
        <PairTokenPicker value={b} onChange={setB} />
        <button
          onClick={create}
          disabled={sameToken || exists || isPending || !!hash}
          className="ml-auto px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-semibold shadow-neon disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sameToken ? "Pick two different tokens" : exists ? "Pair already exists" : isPending || hash ? "Creating…" : "Create Pair"}
        </button>
      </div>
      {exists && (
        <a href={explorerAddr(existing.data as string)} target="_blank" rel="noreferrer"
           className="block mt-2 text-xs font-mono text-accent hover:underline">
          {(existing.data as string).slice(0, 10)}…{(existing.data as string).slice(-6)} ↗
        </a>
      )}
    </div>
  );
}

function PairTokenPicker({ value, onChange }: { value: Token; onChange: (t: Token) => void }) {
  return (
    <select
      value={value.address + value.symbol}
      onChange={(e) => {
        const t = TOKENS.find((x) => x.address + x.symbol === e.target.value);
        if (t) onChange(t);
      }}
      aria-label="Select pair token"
      className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
    >
      {TOKENS.map((t) => (
        <option key={t.address + t.symbol} value={t.address + t.symbol}>{t.symbol}</option>
      ))}
    </select>
  );
}
