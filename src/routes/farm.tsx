import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
  useBlockNumber,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { ADDR, explorerAddr, litvm } from "@/lib/chain";
import { farmAbi } from "@/lib/abis/farm";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { findToken } from "@/lib/tokens";
import { useStakingMeta, TokenIcons, type StakingMeta } from "@/lib/stakingMeta";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/farm")({
  component: FarmPage,
  head: () => ({
    meta: [
      { title: "Yield Farming — ORVEX" },
      { name: "description", content: "Stake LP & tokens and earn ORVX rewards every block on LitVM LiteForge." },
      { property: "og:title", content: "Yield Farming — ORVEX" },
      { property: "og:description", content: "Stake LP & tokens and earn ORVX rewards every block on LitVM LiteForge." },
      { property: "og:url", content: "https://orvexdex.lovable.app/farm" },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/farm" }],
  }),
});

function fmt(n: bigint | undefined, decimals = 18, max = 4) {
  if (n === undefined) return "—";
  const s = formatUnits(n, decimals);
  const [i, d] = s.split(".");
  return d ? `${i}.${d.slice(0, max)}` : i;
}

function FarmPage() {
  const { address } = useAccount();
  const owner = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "owner" });
  const poolLength = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "poolLength" });
  const rewardPerBlock = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "rewardPerBlock" });
  const totalAllocPoint = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "totalAllocPoint" });
  const rewardToken = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "rewardToken" });
  const startBlock = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "startBlock" });
  const block = useBlockNumber({ watch: true });

  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();

  const count = Number(poolLength.data ?? 0n);
  const pids = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const rewardMeta = useStakingMeta(rewardToken.data as `0x${string}` | undefined);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-gold/30 glass-strong p-8 md:p-12">
        <div className="absolute inset-0 bg-gradient-luxe opacity-10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">ORVEX Farms</div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Stake. Earn. <span className="text-gradient-luxe-anim">Compound.</span>
            </h1>
            <p className="mt-3 text-muted-foreground max-w-xl">
              Stake LP tokens or single assets and earn <strong>{rewardMeta?.symbol ?? "ORVX"}</strong> emitted every block.
              Real on-chain rewards, transparent allocations, no lockups.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/liquidity" className="px-4 py-2 rounded-xl glass border border-gold/30 hover:border-gold text-sm font-medium transition">
                Get LP tokens →
              </Link>
              {isOwner && (
                <Link
                  to="/admin-farm"
                  className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-semibold shadow-neon hover:scale-[1.02] transition"
                >
                  ⚙ Admin Panel
                </Link>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-[260px]">
            <Stat label="Pools" value={String(count)} />
            <Stat label="Reward/block" value={fmt(rewardPerBlock.data as bigint | undefined, rewardMeta?.decimals ?? 18, 4)} />
            <Stat label="Total Alloc" value={String(totalAllocPoint.data ?? 0n)} />
            <Stat label="Start Block" value={String(startBlock.data ?? 0n)} />
          </div>
        </div>
      </section>

      {/* INFO STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Current block: <span className="font-mono text-foreground">{String(block.data ?? "—")}</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={explorerAddr(ADDR.farm)} target="_blank" rel="noreferrer" className="hover:text-primary font-mono">
            Farm: {ADDR.farm.slice(0, 6)}…{ADDR.farm.slice(-4)} ↗
          </a>
          {rewardToken.data && (
            <a href={explorerAddr(rewardToken.data as string)} target="_blank" rel="noreferrer" className="hover:text-primary font-mono">
              Reward: {(rewardToken.data as string).slice(0, 6)}…{(rewardToken.data as string).slice(-4)} ↗
            </a>
          )}
        </div>
      </div>

      {/* POOLS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Live Pools</h2>
          <span className="text-xs text-muted-foreground">{count} pool{count === 1 ? "" : "s"}</span>
        </div>
        {count === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-muted-foreground border border-dashed border-border">
            <div className="text-4xl mb-3">🌾</div>
            <p className="font-medium text-foreground">No farm pools yet</p>
            <p className="text-sm mt-1">The admin hasn&apos;t added any staking pools. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pids.map((pid) => (
              <PoolCard
                key={pid}
                pid={pid}
                totalAllocPoint={totalAllocPoint.data as bigint | undefined}
                rewardPerBlock={rewardPerBlock.data as bigint | undefined}
                rewardMeta={rewardMeta}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl px-3 py-2.5 border border-border">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold text-sm truncate">{value}</div>
    </div>
  );
}

function useEnsureChain() {
  const toast = useToast();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  return async () => {
    if (!address) { toast.push({ title: "Connect wallet first", type: "error" }); return false; }
    if (chainId === litvm.id) return true;
    try { await switchChainAsync({ chainId: litvm.id }); return true; }
    catch (e: any) { toast.push({ title: "Switch network failed", description: e?.shortMessage || e?.message, type: "error" }); return false; }
  };
}

function useTx(label: string, onDone?: () => void) {
  const toast = useToast();
  const ensure = useEnsureChain();
  const { writeContractAsync, isPending, reset } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: `${label} confirmed`, type: "success", hash });
      setHash(undefined); reset(); onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);
  const run = async (args: Parameters<typeof writeContractAsync>[0]) => {
    try {
      if (!(await ensure())) return;
      const h = await writeContractAsync(args);
      setHash(h);
      toast.push({ title: `${label} submitted`, hash: h });
      return h;
    } catch (e: any) {
      toast.push({ title: `${label} failed`, description: e?.shortMessage || e?.message, type: "error" });
    }
  };
  return { run, isPending, isMining: receipt.isLoading };
}

function PoolCard({
  pid,
  totalAllocPoint,
  rewardPerBlock,
  rewardMeta,
}: {
  pid: number;
  totalAllocPoint?: bigint;
  rewardPerBlock?: bigint;
  rewardMeta?: StakingMeta;
}) {
  const { address } = useAccount();
  const pool = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "poolInfo", args: [BigInt(pid)] });
  const stakingToken = pool.data?.[0] as `0x${string}` | undefined;
  const allocPoint = pool.data?.[1] as bigint | undefined;
  const totalStaked = pool.data?.[4] as bigint | undefined;
  const meta = useStakingMeta(stakingToken);

  const user = useReadContract({
    address: ADDR.farm, abi: farmAbi, functionName: "userInfo",
    args: address ? [BigInt(pid), address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });
  const staked = user.data?.[0] as bigint | undefined;
  const pending = useReadContract({
    address: ADDR.farm, abi: farmAbi, functionName: "pendingReward",
    args: address ? [BigInt(pid), address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const balance = useReadContract({
    address: stakingToken, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!stakingToken, refetchInterval: 10000 },
  });
  const allowance = useReadContract({
    address: stakingToken, abi: erc20Abi, functionName: "allowance",
    args: address && stakingToken ? [address, ADDR.farm] : undefined,
    query: { enabled: !!address && !!stakingToken },
  });

  const refresh = () => { user.refetch(); pending.refetch(); balance.refetch(); allowance.refetch(); pool.refetch(); };

  const approveTx = useTx("Approve", refresh);
  const depositTx = useTx("Stake", refresh);
  const withdrawTx = useTx("Unstake", refresh);
  const claimTx = useTx("Claim", refresh);
  const emergencyTx = useTx("Emergency withdraw", refresh);

  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const dec = meta?.decimals ?? 18;
  const rewardDec = rewardMeta?.decimals ?? 18;

  const allocShare = allocPoint && totalAllocPoint && totalAllocPoint > 0n
    ? Number((allocPoint * 10000n) / totalAllocPoint) / 100
    : 0;
  const poolRewardPerBlock = allocPoint && totalAllocPoint && totalAllocPoint > 0n && rewardPerBlock
    ? (rewardPerBlock * allocPoint) / totalAllocPoint
    : 0n;

  const needsApprove = (() => {
    if (!amount || tab !== "stake") return false;
    try {
      const wei = parseUnits(amount, dec);
      return !allowance.data || (allowance.data as bigint) < wei;
    } catch { return false; }
  })();

  const onMax = () => {
    if (tab === "stake" && balance.data !== undefined) setAmount(formatUnits(balance.data as bigint, dec));
    else if (tab === "unstake" && staked !== undefined) setAmount(formatUnits(staked, dec));
  };

  const onSubmit = async () => {
    if (!amount) return;
    let wei: bigint;
    try { wei = parseUnits(amount, dec); } catch { return; }
    if (wei <= 0n) return;
    if (tab === "stake") {
      if (needsApprove) {
        await approveTx.run({ address: stakingToken!, abi: erc20Abi, functionName: "approve", args: [ADDR.farm, wei] });
        return;
      }
      await depositTx.run({ address: ADDR.farm, abi: farmAbi, functionName: "deposit", args: [BigInt(pid), wei] });
      setAmount("");
    } else {
      await withdrawTx.run({ address: ADDR.farm, abi: farmAbi, functionName: "withdraw", args: [BigInt(pid), wei] });
      setAmount("");
    }
  };

  const busy = approveTx.isPending || approveTx.isMining || depositTx.isPending || depositTx.isMining
    || withdrawTx.isPending || withdrawTx.isMining;

  return (
    <div className="group relative glass-strong rounded-2xl border border-border hover:border-gold/40 transition overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-luxe opacity-60" />
      <div className="p-5 space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <TokenIcons meta={meta} size={40} />
            <div>
              <div className="font-bold text-lg leading-tight">{meta?.symbol ?? "…"}</div>
              <div className="text-[11px] text-muted-foreground font-mono">PID #{pid}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Alloc</div>
            <div className="font-mono font-semibold text-accent">{allocShare.toFixed(2)}%</div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-surface-2/50 px-3 py-2">
            <div className="text-muted-foreground text-[10px] uppercase">TVL (staked)</div>
            <div className="font-mono font-semibold">{fmt(totalStaked, dec)} {meta?.isLP ? "LP" : meta?.symbol}</div>
          </div>
          <div className="rounded-lg bg-surface-2/50 px-3 py-2">
            <div className="text-muted-foreground text-[10px] uppercase">Emission</div>
            <div className="font-mono font-semibold">{fmt(poolRewardPerBlock, rewardDec, 6)} /blk</div>
          </div>
        </div>

        {/* Pending reward */}
        <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-primary/10 to-accent/5 p-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending {rewardMeta?.symbol ?? "reward"}</div>
            <div className="font-mono font-bold text-lg text-gradient-luxe-anim">
              {fmt(pending.data as bigint | undefined, rewardDec, 6)}
            </div>
          </div>
          <button
            disabled={!address || claimTx.isPending || claimTx.isMining || !((pending.data as bigint | undefined) ?? 0n)}
            onClick={() => claimTx.run({ address: ADDR.farm, abi: farmAbi, functionName: "claimReward", args: [BigInt(pid)] })}
            className="px-4 py-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:scale-[1.02] transition"
          >
            {claimTx.isPending || claimTx.isMining ? "…" : "Harvest"}
          </button>
        </div>

        {/* Your stake */}
        <div className="text-xs flex justify-between text-muted-foreground">
          <span>Your stake</span>
          <span className="font-mono text-foreground">{fmt(staked, dec)}</span>
        </div>

        {/* Stake/unstake tabs */}
        <div className="flex rounded-lg bg-surface-2 p-1 text-xs font-medium">
          <button onClick={() => { setTab("stake"); setAmount(""); }}
            className={`flex-1 py-1.5 rounded-md transition ${tab === "stake" ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"}`}>
            Stake
          </button>
          <button onClick={() => { setTab("unstake"); setAmount(""); }}
            className={`flex-1 py-1.5 rounded-md transition ${tab === "unstake" ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"}`}>
            Unstake
          </button>
        </div>

        <div className="relative">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            className="w-full bg-surface-2 rounded-xl px-3 py-2.5 pr-16 outline-none border border-border focus:border-primary font-mono"
          />
          <button onClick={onMax} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-1 rounded bg-primary/20 text-primary font-bold hover:bg-primary/30 transition">
            MAX
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground flex justify-between">
          <span>Balance: <span className="font-mono">{fmt(balance.data as bigint | undefined, dec)}</span></span>
          {tab === "stake" && allowance.data !== undefined && (
            <span>Allow: <span className="font-mono">{((allowance.data as bigint) > 10n ** 30n) ? "∞" : fmt(allowance.data as bigint, dec)}</span></span>
          )}
        </div>

        <button
          onClick={onSubmit}
          disabled={!address || busy || !amount}
          className="w-full py-2.5 rounded-xl bg-gradient-brand text-primary-foreground font-semibold shadow-neon disabled:opacity-40 hover:scale-[1.01] transition"
        >
          {!address ? "Connect wallet"
            : busy ? "Processing…"
            : tab === "stake" ? (needsApprove ? `Approve ${meta?.symbol ?? "token"}` : "Stake")
            : "Unstake"}
        </button>

        {!!staked && staked > 0n && (
          <button
            onClick={() => {
              if (confirm("Emergency withdraw forfeits pending rewards. Continue?")) {
                emergencyTx.run({ address: ADDR.farm, abi: farmAbi, functionName: "emergencyWithdraw", args: [BigInt(pid)] });
              }
            }}
            disabled={emergencyTx.isPending || emergencyTx.isMining}
            className="w-full text-[11px] text-destructive hover:underline disabled:opacity-40"
          >
            Emergency withdraw (forfeit rewards)
          </button>
        )}
      </div>
    </div>
  );
}
