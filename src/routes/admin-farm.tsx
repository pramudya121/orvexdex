import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits, isAddress } from "viem";
import { ADDR, explorerAddr, litvm } from "@/lib/chain";
import { farmAbi } from "@/lib/abis/farm";
import { TOKENS } from "@/lib/tokens";
import { useStakingMeta, TokenIcons } from "@/lib/stakingMeta";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/admin-farm")({
  component: AdminFarmPage,
  head: () => ({
    meta: [
      { title: "Farm Admin — ORVEX" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function fmt(n: bigint | undefined, decimals = 18, max = 4) {
  if (n === undefined) return "—";
  const s = formatUnits(n, decimals);
  const [i, d] = s.split(".");
  return d ? `${i}.${d.slice(0, max)}` : i;
}
function shortAddr(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
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

function AdminFarmPage() {
  const { address } = useAccount();
  const owner = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "owner" });
  const rewardToken = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "rewardToken" });
  const rewardPerBlock = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "rewardPerBlock" });
  const startBlock = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "startBlock" });
  const totalAllocPoint = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "totalAllocPoint" });
  const poolLength = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "poolLength" });

  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();
  const count = Number(poolLength.data ?? 0n);
  const pids = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  const refreshGlobal = () => {
    rewardToken.refetch(); rewardPerBlock.refetch(); startBlock.refetch();
    totalAllocPoint.refetch(); poolLength.refetch();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link to="/admin" className="hover:text-primary">Admin</Link>
            <span>/</span>
            <span className="text-foreground">Farm</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Yield Farm Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Owner-only controls for the ORVEX farm contract</p>
        </div>
        <div className={`glass rounded-2xl p-3 text-xs space-y-1 min-w-[280px] border ${isOwner ? "border-accent/40" : "border-destructive/40"}`}>
          <Row label="Farm" value={<a href={explorerAddr(ADDR.farm)} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">{shortAddr(ADDR.farm)}</a>} />
          <Row label="Owner" value={<span className="font-mono">{shortAddr(owner.data as string | undefined)}</span>} />
          <Row label="You" value={<span className="font-mono">{shortAddr(address)}</span>} />
          <div className={`mt-1 font-semibold ${isOwner ? "text-accent" : "text-destructive"}`}>
            {!address ? "Connect wallet" : isOwner ? "✓ Owner access" : "✗ Not owner — actions will revert"}
          </div>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <RewardTokenCard
          current={rewardToken.data as `0x${string}` | undefined}
          disabled={!isOwner}
          onDone={refreshGlobal}
        />
        <RewardPerBlockCard
          current={rewardPerBlock.data as bigint | undefined}
          rewardAddr={rewardToken.data as `0x${string}` | undefined}
          disabled={!isOwner}
          onDone={refreshGlobal}
        />
        <StartBlockCard
          current={startBlock.data as bigint | undefined}
          disabled={!isOwner}
          onDone={refreshGlobal}
        />
        <AddPoolCard disabled={!isOwner} onDone={refreshGlobal} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Pools ({count})</h2>
          <div className="text-xs text-muted-foreground">Total Alloc: <span className="font-mono text-foreground">{String(totalAllocPoint.data ?? 0n)}</span></div>
        </div>
        {count === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
            No pools yet. Add the first one above.
          </div>
        ) : (
          <div className="space-y-3">
            {pids.map((pid) => (
              <AdminPoolRow key={pid} pid={pid} disabled={!isOwner} onDone={refreshGlobal} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function RewardTokenCard({ current, disabled, onDone }: { current?: `0x${string}`; disabled?: boolean; onDone?: () => void }) {
  const [val, setVal] = useState("");
  const { run, isPending, isMining } = useTx("Reward token", onDone);
  const busy = isPending || isMining || disabled;
  const meta = useStakingMeta(current);
  return (
    <Card title="Reward Token" desc="ERC20 emitted as farming reward">
      <div className="flex items-center gap-2 text-sm">
        <TokenIcons meta={meta} size={28} />
        <a href={current ? explorerAddr(current) : "#"} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline truncate">
          {current ?? "—"}
        </a>
      </div>
      <div className="flex flex-wrap gap-1">
        {TOKENS.filter(t => !t.isNative).map(t => (
          <button key={t.address} onClick={() => setVal(t.address)} className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/20 transition flex items-center gap-1">
            <img src={t.logo} alt="" className="w-4 h-4 rounded-full" />{t.symbol}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="0x..."
          className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary font-mono text-xs" />
        <button
          onClick={() => isAddress(val) && run({ address: ADDR.farm, abi: farmAbi, functionName: "setRewardToken", args: [val as `0x${string}`] })}
          disabled={busy || !isAddress(val)}
          className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40 text-sm">
          {isPending || isMining ? "…" : "Set"}
        </button>
      </div>
    </Card>
  );
}

function RewardPerBlockCard({ current, rewardAddr, disabled, onDone }: { current?: bigint; rewardAddr?: `0x${string}`; disabled?: boolean; onDone?: () => void }) {
  const meta = useStakingMeta(rewardAddr);
  const dec = meta?.decimals ?? 18;
  const [val, setVal] = useState("");
  const { run, isPending, isMining } = useTx("Reward/block", onDone);
  const busy = isPending || isMining || disabled;
  return (
    <Card title="Reward per Block" desc={`How many ${meta?.symbol ?? "reward tokens"} emitted each block`}>
      <div className="text-sm">Current: <span className="font-mono font-semibold">{fmt(current, dec, 6)}</span> {meta?.symbol}</div>
      <div className="flex flex-wrap gap-1">
        {["0.01", "0.1", "1", "10"].map(v => (
          <button key={v} onClick={() => setVal(v)} className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/20 transition">{v}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. 1.5" inputMode="decimal"
          className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary font-mono" />
        <button
          onClick={() => {
            try {
              const wei = parseUnits(val || "0", dec);
              run({ address: ADDR.farm, abi: farmAbi, functionName: "setRewardPerBlock", args: [wei] });
            } catch {}
          }}
          disabled={busy || !val}
          className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40 text-sm">
          {isPending || isMining ? "…" : "Update"}
        </button>
      </div>
    </Card>
  );
}

function StartBlockCard({ current, disabled, onDone }: { current?: bigint; disabled?: boolean; onDone?: () => void }) {
  const [val, setVal] = useState("");
  const { run, isPending, isMining } = useTx("Start block", onDone);
  const busy = isPending || isMining || disabled;
  return (
    <Card title="Start Block" desc="Block number at which rewards begin">
      <div className="text-sm">Current: <span className="font-mono font-semibold">{String(current ?? "—")}</span></div>
      <div className="flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="block number" inputMode="numeric"
          className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary font-mono" />
        <button
          onClick={() => run({ address: ADDR.farm, abi: farmAbi, functionName: "setStartBlock", args: [BigInt(val || "0")] })}
          disabled={busy || !val}
          className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40 text-sm">
          {isPending || isMining ? "…" : "Update"}
        </button>
      </div>
    </Card>
  );
}

function AddPoolCard({ disabled, onDone }: { disabled?: boolean; onDone?: () => void }) {
  const [token, setToken] = useState("");
  const [alloc, setAlloc] = useState("100");
  const { run, isPending, isMining } = useTx("Add pool", onDone);
  const busy = isPending || isMining || disabled;
  return (
    <Card title="Add Pool" desc="Add a new staking pool. Use an LP pair address or any ERC20.">
      <div className="flex flex-wrap gap-1">
        {TOKENS.filter(t => !t.isNative).map(t => (
          <button key={t.address} onClick={() => setToken(t.address)} className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/20 transition flex items-center gap-1">
            <img src={t.logo} alt="" className="w-4 h-4 rounded-full" />{t.symbol}
          </button>
        ))}
      </div>
      <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="staking token address (LP or ERC20)"
        className="w-full bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary font-mono text-xs" />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase text-muted-foreground">Alloc points</label>
          <input value={alloc} onChange={(e) => setAlloc(e.target.value)} placeholder="100" inputMode="numeric"
            className="w-full bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary font-mono" />
        </div>
        <button
          onClick={() => isAddress(token) && run({ address: ADDR.farm, abi: farmAbi, functionName: "addPool", args: [token as `0x${string}`, BigInt(alloc || "0")] })}
          disabled={busy || !isAddress(token) || !alloc}
          className="self-end px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40 text-sm">
          {isPending || isMining ? "…" : "+ Add Pool"}
        </button>
      </div>
    </Card>
  );
}

function AdminPoolRow({ pid, disabled, onDone }: { pid: number; disabled?: boolean; onDone?: () => void }) {
  const pool = useReadContract({ address: ADDR.farm, abi: farmAbi, functionName: "poolInfo", args: [BigInt(pid)] });
  const stakingToken = pool.data?.[0] as `0x${string}` | undefined;
  const allocPoint = pool.data?.[1] as bigint | undefined;
  const totalStaked = pool.data?.[4] as bigint | undefined;
  const meta = useStakingMeta(stakingToken);
  const refresh = () => { pool.refetch(); onDone?.(); };
  const allocTx = useTx("Alloc", refresh);
  const updateTx = useTx("Update pool", refresh);
  const [val, setVal] = useState("");

  return (
    <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3 min-w-[200px]">
        <TokenIcons meta={meta} size={36} />
        <div>
          <div className="font-semibold">{meta?.symbol ?? "…"}</div>
          <div className="text-[10px] font-mono text-muted-foreground">PID #{pid}</div>
        </div>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground">Alloc</div>
        <div className="font-mono font-semibold">{String(allocPoint ?? 0n)}</div>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground">TVL</div>
        <div className="font-mono font-semibold">{fmt(totalStaked, meta?.decimals ?? 18)}</div>
      </div>
      <div className="text-xs min-w-[120px]">
        <div className="text-muted-foreground">Token</div>
        <a href={stakingToken ? explorerAddr(stakingToken) : "#"} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">{shortAddr(stakingToken)}</a>
      </div>
      <div className="flex-1 flex gap-2 min-w-[240px] items-end">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="new alloc" inputMode="numeric"
          className="flex-1 bg-surface-2 rounded-lg px-3 py-2 outline-none border border-border focus:border-primary font-mono text-sm" />
        <button
          onClick={() => run_set()}
          disabled={disabled || allocTx.isPending || allocTx.isMining || !val}
          className="px-3 py-2 rounded-lg bg-gradient-brand text-primary-foreground text-xs font-semibold disabled:opacity-40">
          Set Alloc
        </button>
        <button
          onClick={() => updateTx.run({ address: ADDR.farm, abi: farmAbi, functionName: "updatePool", args: [BigInt(pid)] })}
          disabled={disabled || updateTx.isPending || updateTx.isMining}
          className="px-3 py-2 rounded-lg bg-surface-2 hover:bg-primary/20 text-xs font-semibold disabled:opacity-40">
          Sync
        </button>
      </div>
    </div>
  );

  function run_set() {
    allocTx.run({ address: ADDR.farm, abi: farmAbi, functionName: "setAllocPoint", args: [BigInt(pid), BigInt(val || "0")] });
  }
}
