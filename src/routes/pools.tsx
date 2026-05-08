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

type SortKey = "tvl" | "supply" | "new";

export const Route = createFileRoute("/pools")({
  component: PoolsPage,
  head: () => ({ meta: [{ title: "Pools — ORVEX" }] }),
});

function PoolsPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("tvl");
  const [onlyMine, setOnlyMine] = useState(false);

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
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gradient-luxe">Pools</h1>
          <p className="text-sm text-muted-foreground">All liquidity pairs on ORVEX • {total} pools</p>
        </div>
        <Link
          to="/liquidity"
          className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold text-sm shadow-neon hover:opacity-95 transition w-fit"
        >+ Create / Add Liquidity</Link>
      </div>

      <div className="glass rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2 border border-border">
          <span className="text-muted-foreground text-sm">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by token symbol or pair address…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-xl p-1 border border-border">
          {(["tvl", "supply", "new"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${sort === k ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >{k === "tvl" ? "TVL" : k === "supply" ? "LP Supply" : "Newest"}</button>
          ))}
        </div>
        <button
          onClick={() => setOnlyMine((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${onlyMine ? "bg-gradient-brand text-primary-foreground border-transparent" : "bg-surface-2 border-border text-muted-foreground hover:border-primary/60"}`}
        >My pools</button>
      </div>

      <PoolList pairAddrs={pairAddrs} q={q} sort={sort} onlyMine={onlyMine} />

      <CreatePairCard />
    </div>
  );
}

function PoolList({ pairAddrs, q, sort, onlyMine }: { pairAddrs: `0x${string}`[]; q: string; sort: SortKey; onlyMine: boolean }) {
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
    if (onlyMine) out = out.filter((p) => (p.myLp ?? 0n) > 0n);
    if (sort === "tvl") out = [...out].sort((a, b) => (a.tvl < b.tvl ? 1 : a.tvl > b.tvl ? -1 : 0));
    else if (sort === "supply") out = [...out].sort((a, b) => ((a.ts ?? 0n) < (b.ts ?? 0n) ? 1 : (a.ts ?? 0n) > (b.ts ?? 0n) ? -1 : 0));
    else out = [...out].sort((a, b) => b.idx - a.idx);
    return out;
  }, [enriched, q, sort, onlyMine]);

  if (pairAddrs.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
        No pools yet. <Link to="/liquidity" className="text-accent hover:underline">Be the first to add liquidity →</Link>
      </div>
    );
  }
  if (filtered.length === 0) {
    return <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">No pools match your filters.</div>;
  }

  // Aggregate totals across visible pools
  const totalTvl = filtered.reduce<bigint>((a, p) => a + p.tvl, 0n);
  const totalVol = filtered.reduce<bigint>((a, p) => a + p.vol, 0n);
  const totalSwaps = filtered.reduce<number>((a, p) => a + p.swaps, 0);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryStat label="Total TVL" value={`${fmtWzk(totalTvl)} wzkLTC`} />
        <SummaryStat label="24h Volume" value={`${fmtWzk(totalVol)} wzkLTC`} />
        <SummaryStat label="24h Swaps" value={totalSwaps.toString()} />
        <SummaryStat label="Pools shown" value={filtered.length.toString()} />
      </div>
    <div className="space-y-3">
      {filtered.map((p) => {
        const sharePct = p.myLp && p.ts && p.ts > 0n
          ? Number((p.myLp * 10000n) / p.ts) / 100
          : 0;
        return (
          <div key={p.pair} className="glass rounded-2xl p-5 hover:neon-border transition group">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex -space-x-2 shrink-0">
                  {p.tk0 && <img src={p.tk0.logo} alt={p.tk0.symbol} className="h-10 w-10 rounded-full ring-2 ring-background" />}
                  {p.tk1 && <img src={p.tk1.logo} alt={p.tk1.symbol} className="h-10 w-10 rounded-full ring-2 ring-background" />}
                </div>
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2 flex-wrap">
                    {p.tk0?.symbol ?? "?"} / {p.tk1?.symbol ?? "?"}
                    {sharePct > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                        Your share {sharePct < 0.01 ? "<0.01" : sharePct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <a href={explorerAddr(p.pair)} target="_blank" rel="noreferrer"
                    className="text-xs text-muted-foreground font-mono hover:text-accent">
                    {p.pair.slice(0, 10)}…{p.pair.slice(-6)} ↗
                  </a>
                </div>
              </div>
              <div className="flex gap-5 text-sm shrink-0 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">TVL</div>
                  <div className="font-mono font-semibold text-gradient-gold">{fmtWzk(p.tvl)} <span className="text-[10px] text-muted-foreground">wzkLTC</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">24h Vol</div>
                  <div className="font-mono">{fmtWzk(p.vol)} <span className="text-[10px] text-muted-foreground">wzkLTC</span></div>
                  <div className="text-[10px] text-muted-foreground">{p.swaps} swaps</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reserves</div>
                  <div className="font-mono text-xs">{fmt(p.r?.[0], p.tk0?.decimals ?? 18, 2)} {p.tk0?.symbol}</div>
                  <div className="font-mono text-xs">{fmt(p.r?.[1], p.tk1?.decimals ?? 18, 2)} {p.tk1?.symbol}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">LP Supply</div>
                  <div className="font-mono">{fmt(p.ts, 18, 2)}</div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              {p.t0 && p.t1 && (
                <Link
                  to="/swap"
                  search={{ from: p.t0, to: p.t1 }}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-semibold text-center hover:opacity-95 transition"
                >Trade</Link>
              )}
              {p.t0 && p.t1 && (
                <Link
                  to="/liquidity"
                  search={{ a: p.t0, b: p.t1 }}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-surface-2 border border-border text-sm font-semibold text-center hover:border-primary/60 transition"
                >Add Liquidity</Link>
              )}
              {sharePct > 0 && p.t0 && p.t1 && (
                <Link
                  to="/liquidity"
                  search={{ a: p.t0, b: p.t1, tab: "remove" }}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-surface-2 border border-border text-sm font-semibold text-center hover:border-destructive/60 transition"
                >Remove</Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="font-bold text-lg text-gradient-luxe">{value}</div>
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
      className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
    >
      {TOKENS.map((t) => (
        <option key={t.address + t.symbol} value={t.address + t.symbol}>{t.symbol}</option>
      ))}
    </select>
  );
}
