import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ADDR, explorerAddr } from "@/lib/chain";
import { farmAbi } from "@/lib/abis/farm";
import { pairAbi } from "@/lib/abis/pair";
import { findToken, TOKENS } from "@/lib/tokens";
import { fmt } from "@/lib/format";
import { Sprout } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Pool = {
  pid: number;
  staking: `0x${string}`;
  totalStaked: bigint;
  userAmount: bigint;
  pending: bigint;
  isLP: boolean;
  t0?: `0x${string}`;
  t1?: `0x${string}`;
};

export function FarmingPositions({ owner }: { owner: `0x${string}` }) {
  const poolLength = useReadContract({
    address: ADDR.farm,
    abi: farmAbi,
    functionName: "poolLength",
    query: { refetchInterval: 20000 },
  });
  const count = Number((poolLength.data as bigint | undefined) ?? 0n);
  const pids = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  const poolCalls = useMemo(
    () => pids.flatMap((pid) => [
      { address: ADDR.farm, abi: farmAbi, functionName: "poolInfo" as const, args: [BigInt(pid)] as const },
      { address: ADDR.farm, abi: farmAbi, functionName: "userInfo" as const, args: [BigInt(pid), owner] as const },
      { address: ADDR.farm, abi: farmAbi, functionName: "pendingReward" as const, args: [BigInt(pid), owner] as const },
    ]),
    [pids, owner],
  );
  const data = useReadContracts({ contracts: poolCalls, query: { enabled: count > 0, refetchInterval: 12000 } });

  const stakingAddrs = pids.map((pid) => data.data?.[pid * 3]?.result as readonly [`0x${string}`, bigint, bigint, bigint, bigint] | undefined)
    .map((r) => r?.[0]).filter(Boolean) as `0x${string}`[];

  // Try to detect LP tokens by calling token0/token1 on each staking address.
  const lpCalls = useMemo(
    () => stakingAddrs.flatMap((a) => [
      { address: a, abi: pairAbi, functionName: "token0" as const },
      { address: a, abi: pairAbi, functionName: "token1" as const },
    ]),
    [stakingAddrs],
  );
  const lpMeta = useReadContracts({ contracts: lpCalls, query: { enabled: stakingAddrs.length > 0 } });

  const pools: Pool[] = pids.map((pid, i) => {
    const info = data.data?.[pid * 3]?.result as readonly [`0x${string}`, bigint, bigint, bigint, bigint] | undefined;
    const user = data.data?.[pid * 3 + 1]?.result as readonly [bigint, bigint] | undefined;
    const pending = data.data?.[pid * 3 + 2]?.result as bigint | undefined;
    const t0 = lpMeta.data?.[i * 2]?.result as `0x${string}` | undefined;
    const t1 = lpMeta.data?.[i * 2 + 1]?.result as `0x${string}` | undefined;
    return {
      pid,
      staking: info?.[0] ?? ("0x0" as `0x${string}`),
      totalStaked: info?.[4] ?? 0n,
      userAmount: user?.[0] ?? 0n,
      pending: pending ?? 0n,
      isLP: !!(t0 && t1),
      t0, t1,
    };
  }).filter((p) => p.userAmount > 0n || p.pending > 0n);

  if (poolLength.isLoading) {
    return <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">Loading farms…</div>;
  }
  if (pools.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
        <Sprout className="h-6 w-6 mx-auto mb-2 opacity-60" />
        No active farming positions.{" "}
        <Link to="/farm" className="text-accent hover:underline">Explore farms →</Link>
      </div>
    );
  }

  const totalPending = pools.reduce<bigint>((a, p) => a + p.pending, 0n);

  return (
    <>
      <div className="glass-strong rounded-2xl p-4 mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Positions</div>
          <div className="font-bold text-2xl">{pools.length}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total pending ORVX</div>
          <div className="font-bold text-2xl text-gradient-gold">{fmt(totalPending, 18, 4)}</div>
        </div>
      </div>
      <div className="space-y-2">
        {pools.map((p) => <FarmRow key={p.pid} pool={p} />)}
      </div>
    </>
  );
}

function FarmRow({ pool }: { pool: Pool }) {
  const tk0 = pool.t0 ? findToken(pool.t0) : undefined;
  const tk1 = pool.t1 ? findToken(pool.t1) : undefined;
  const singleToken = !pool.isLP ? TOKENS.find((t) => t.address.toLowerCase() === pool.staking.toLowerCase()) : undefined;
  const label = pool.isLP
    ? `${tk0?.symbol ?? "?"} / ${tk1?.symbol ?? "?"} LP`
    : (singleToken?.symbol ?? "Unknown");

  return (
    <Link to="/farm" className="glass rounded-2xl p-4 block card-hover animate-rise">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2 shrink-0">
            {pool.isLP ? (
              <>
                {tk0 && <img src={tk0.logo} alt="" className="h-9 w-9 rounded-full ring-2 ring-background" />}
                {tk1 && <img src={tk1.logo} alt="" className="h-9 w-9 rounded-full ring-2 ring-background" />}
              </>
            ) : (
              singleToken && <img src={singleToken.logo} alt="" className="h-9 w-9 rounded-full ring-2 ring-background" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              {label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">PID #{pool.pid}</span>
            </div>
            <a
              href={explorerAddr(pool.staking)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground font-mono hover:text-accent"
            >
              {pool.staking.slice(0, 8)}…{pool.staking.slice(-4)}
            </a>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Staked</div>
          <div className="font-mono font-semibold">{fmt(pool.userAmount, 18, 4)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/60">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending ORVX</div>
          <div className="font-mono text-sm text-gradient-gold">{fmt(pool.pending, 18, 6)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pool total</div>
          <div className="font-mono text-sm">{fmt(pool.totalStaked, 18, 2)}</div>
        </div>
      </div>
    </Link>
  );
}
