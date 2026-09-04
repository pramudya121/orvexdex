import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatEther, isAddress, parseEther } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ArrowLeft, CircleDollarSign, ExternalLink, Pause, Play, Settings2, ShieldCheck, WalletCards } from "lucide-react";
import { casinoAbi } from "@/lib/abis/casino";
import { ADDR, explorerAddr, litvm } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/admin-casino")({
  component: AdminCasinoPage,
  head: () => ({
    meta: [
      { title: "Casino Admin — ORVEX" },
      { name: "description", content: "Owner controls for the ORVEX on-chain casino." },
      { property: "og:title", content: "Casino Admin — ORVEX" },
      { property: "og:description", content: "Owner controls for the ORVEX on-chain casino." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const contract = { address: ADDR.casino, abi: casinoAbi } as const;
const short = (value?: string) => value ? `${value.slice(0, 7)}…${value.slice(-5)}` : "—";
const eth = (value?: bigint) => value === undefined ? "—" : Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 5 });

function AdminCasinoPage() {
  const { address } = useAccount();
  const owner = useReadContract({ ...contract, functionName: "owner", query: { refetchInterval: 15_000 } });
  const paused = useReadContract({ ...contract, functionName: "paused", query: { refetchInterval: 10_000 } });
  const balance = useReadContract({ ...contract, functionName: "getContractBalance", query: { refetchInterval: 10_000 } });
  const minBet = useReadContract({ ...contract, functionName: "minBet" });
  const maxBet = useReadContract({ ...contract, functionName: "maxBet" });
  const edge = useReadContract({ ...contract, functionName: "houseEdge" });
  const vrf = useReadContract({ ...contract, functionName: "vrfCoordinator" });
  const isOwner = !!address && !!owner.data && address.toLowerCase() === owner.data.toLowerCase();
  const refresh = () => { owner.refetch(); paused.refetch(); balance.refetch(); minBet.refetch(); maxBet.refetch(); edge.refetch(); vrf.refetch(); };

  return (
    <main className="casino-admin-shell min-h-[calc(100vh-4rem)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border/70 pb-7">
          <div className="space-y-3">
            <Link to="/casino" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to casino floor</Link>
            <div><p className="casino-kicker">The house office</p><h1 className="text-3xl font-black sm:text-5xl">Casino Control Room</h1></div>
            <p className="max-w-2xl text-sm text-muted-foreground">Manage bankroll, limits, house edge, VRF coordinator, emergency pause, and ownership directly on-chain.</p>
          </div>
          <Button asChild variant="outline"><a href={explorerAddr(ADDR.casino)} target="_blank" rel="noreferrer">Contract <ExternalLink /></a></Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<CircleDollarSign />} label="Bankroll" value={`${eth(balance.data)} zkLTC`} />
          <Metric icon={<Settings2 />} label="Bet range" value={`${eth(minBet.data)} – ${eth(maxBet.data)}`} />
          <Metric icon={<ShieldCheck />} label="House edge" value={edge.data === undefined ? "—" : `${Number(edge.data) / 100}%`} />
          <Metric icon={paused.data ? <Pause /> : <Play />} label="Tables" value={paused.data ? "Paused" : "Open"} />
        </section>

        <section className={`casino-admin-access ${isOwner ? "casino-admin-access-ok" : "casino-admin-access-warn"}`}>
          <div><span>Connected</span><strong>{short(address)}</strong></div>
          <div><span>Contract owner</span><strong>{short(owner.data)}</strong></div>
          <div className="ml-auto font-bold">{!address ? "Connect the owner wallet" : isOwner ? "Owner access verified" : "Read-only mode — not owner"}</div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <LimitsCard disabled={!isOwner} currentMin={minBet.data} currentMax={maxBet.data} onDone={refresh} />
          <EdgeCard disabled={!isOwner} current={edge.data} onDone={refresh} />
          <BankrollCard disabled={!isOwner} current={balance.data} onDone={refresh} />
          <VrfCard disabled={!isOwner} current={vrf.data} onDone={refresh} />
          <EmergencyCard disabled={!isOwner} paused={paused.data ?? false} onDone={refresh} />
          <OwnershipCard disabled={!isOwner} current={owner.data} onDone={refresh} />
        </div>
      </div>
    </main>
  );
}

function useCasinoTx(label: string, onDone: () => void) {
  const toast = useToast();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (!receipt.isSuccess || !hash) return;
    toast.push({ title: `${label} confirmed`, type: "success", hash });
    setHash(undefined);
    onDone();
  }, [receipt.isSuccess, hash, label, onDone, toast]);
  const run = async (request: Parameters<typeof writeContractAsync>[0]) => {
    if (!address) return toast.push({ title: "Connect the owner wallet", type: "error" });
    try {
      if (chainId !== litvm.id) await switchChainAsync({ chainId: litvm.id });
      const nextHash = await writeContractAsync(request);
      setHash(nextHash);
      toast.push({ title: `${label} submitted`, hash: nextHash });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction rejected";
      toast.push({ title: `${label} failed`, description: message, type: "error" });
    }
  };
  return { run, busy: isPending || receipt.isLoading };
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="casino-admin-panel"><div><h2>{title}</h2><p>{note}</p></div>{children}</section>;
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="casino-admin-metric"><span>{icon}</span><div><p>{label}</p><strong>{value}</strong></div></div>;
}
const Field = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className="casino-admin-input" />;

function LimitsCard({ disabled, currentMin, currentMax, onDone }: { disabled: boolean; currentMin?: bigint; currentMax?: bigint; onDone: () => void }) {
  const [min, setMin] = useState(""); const [max, setMax] = useState(""); const tx = useCasinoTx("Bet limits", onDone);
  let valid = false; let parsedMin = 0n; let parsedMax = 0n;
  try { parsedMin = parseEther(min); parsedMax = parseEther(max); valid = parsedMin > 0n && parsedMax >= parsedMin; } catch { valid = false; }
  return <Panel title="Bet limits" note={`Current ${eth(currentMin)} – ${eth(currentMax)} zkLTC`}><div className="grid grid-cols-2 gap-2"><Field value={min} onChange={(e) => setMin(e.target.value)} placeholder="Minimum" inputMode="decimal" /><Field value={max} onChange={(e) => setMax(e.target.value)} placeholder="Maximum" inputMode="decimal" /></div><Button disabled={disabled || tx.busy || !valid} onClick={() => tx.run({ ...contract, functionName: "setBetLimits", args: [parsedMin, parsedMax] })}>{tx.busy ? "Confirming…" : "Update limits"}</Button></Panel>;
}
function EdgeCard({ disabled, current, onDone }: { disabled: boolean; current?: bigint; onDone: () => void }) {
  const [value, setValue] = useState(""); const tx = useCasinoTx("House edge", onDone); const bps = Number(value) * 100; const valid = Number.isFinite(bps) && bps >= 0 && Number.isInteger(bps);
  return <Panel title="House edge" note={`Current ${current === undefined ? "—" : Number(current) / 100}% · stored in basis points`}><Field value={value} onChange={(e) => setValue(e.target.value)} placeholder="Percent, e.g. 2.5" inputMode="decimal" /><Button disabled={disabled || tx.busy || !valid || !value} onClick={() => tx.run({ ...contract, functionName: "setHouseEdge", args: [BigInt(bps)] })}>{tx.busy ? "Confirming…" : "Update edge"}</Button></Panel>;
}
function BankrollCard({ disabled, current, onDone }: { disabled: boolean; current?: bigint; onDone: () => void }) {
  const [deposit, setDeposit] = useState(""); const [withdraw, setWithdraw] = useState(""); const add = useCasinoTx("Liquidity deposit", onDone); const take = useCasinoTx("Liquidity withdrawal", onDone);
  const parse = (v: string) => { try { return parseEther(v); } catch { return 0n; } };
  return <Panel title="Casino bankroll" note={`Available ${eth(current)} zkLTC`}><div className="flex gap-2"><Field value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Deposit zkLTC" inputMode="decimal" /><Button disabled={disabled || add.busy || parse(deposit) <= 0n} onClick={() => add.run({ ...contract, functionName: "depositLiquidity", value: parse(deposit) })}>Deposit</Button></div><div className="flex gap-2"><Field value={withdraw} onChange={(e) => setWithdraw(e.target.value)} placeholder="Withdraw zkLTC" inputMode="decimal" /><Button variant="outline" disabled={disabled || take.busy || parse(withdraw) <= 0n} onClick={() => take.run({ ...contract, functionName: "withdrawLiquidity", args: [parse(withdraw)] })}>Withdraw</Button></div><Button variant="destructive" disabled={disabled || take.busy || !current || current <= 0n} onClick={() => take.run({ ...contract, functionName: "withdrawAll" })}>Withdraw all liquidity</Button></Panel>;
}
function VrfCard({ disabled, current, onDone }: { disabled: boolean; current?: string; onDone: () => void }) {
  const [value, setValue] = useState(ADDR.mockVrf); const tx = useCasinoTx("VRF coordinator", onDone);
  return <Panel title="Randomness coordinator" note={`Current ${short(current)}`}><Field value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x…" /><Button disabled={disabled || tx.busy || !isAddress(value)} onClick={() => tx.run({ ...contract, functionName: "setVRF", args: [value as `0x${string}`] })}>{tx.busy ? "Confirming…" : "Set VRF"}</Button></Panel>;
}
function EmergencyCard({ disabled, paused, onDone }: { disabled: boolean; paused: boolean; onDone: () => void }) {
  const tx = useCasinoTx(paused ? "Casino unpause" : "Casino pause", onDone);
  return <Panel title="Emergency control" note={paused ? "Betting is currently stopped." : "All five game tables are accepting bets."}><Button variant={paused ? "default" : "destructive"} disabled={disabled || tx.busy} onClick={() => tx.run({ ...contract, functionName: paused ? "unpause" : "pause" })}>{paused ? <><Play /> Reopen tables</> : <><Pause /> Pause all betting</>}</Button></Panel>;
}
function OwnershipCard({ disabled, current, onDone }: { disabled: boolean; current?: string; onDone: () => void }) {
  const [value, setValue] = useState(""); const tx = useCasinoTx("Ownership transfer", onDone);
  return <Panel title="Transfer ownership" note={`Current owner ${short(current)} · irreversible`}><Field value={value} onChange={(e) => setValue(e.target.value)} placeholder="New owner address" /><Button variant="destructive" disabled={disabled || tx.busy || !isAddress(value)} onClick={() => tx.run({ ...contract, functionName: "transferOwnership", args: [value as `0x${string}`] })}><WalletCards /> Transfer ownership</Button></Panel>;
}