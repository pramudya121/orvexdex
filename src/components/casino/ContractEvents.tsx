import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { ADDR, explorerTx } from "@/lib/chain";
import { casinoAbi, mockVrfAbi } from "@/lib/abis/casino";
import { Button } from "@/components/ui/button";

const WINDOW = 9_000n;
const short = (v: unknown) => (typeof v === "string" && v.startsWith("0x") ? `${v.slice(0, 6)}…${v.slice(-4)}` : String(v));

function describe(name: string, a: Record<string, unknown>) {
  const z = (v: unknown) => `${Number(formatEther((v as bigint) ?? 0n)).toFixed(4)} zkLTC`;
  switch (name) {
    case "BetPlaced": return `${short(a.player)} bet ${z(a.amount)} · game ${a.game} · choice ${a.choice} · #${a.requestId}`;
    case "BetSettled": return `#${a.requestId} ${a.won ? "won" : "lost"} · payout ${z(a.payout)}`;
    case "PayoutSent": return `${z(a.amount)} paid to ${short(a.player)}`;
    case "HouseEdgeUpdated": return `House edge → ${a.newEdge}%`;
    case "LimitsUpdated": return `Limits → ${z(a.minBet)} – ${z(a.maxBet)}`;
    case "LiquidityDeposited": return `${short(a.provider)} deposited ${z(a.amount)}`;
    case "LiquidityWithdrawn": return `${z(a.amount)} withdrawn to ${short(a.to)}`;
    case "OwnershipTransferred": return `${short(a.previousOwner)} → ${short(a.newOwner)}`;
    case "Paused": return `Paused by ${short(a.account)}`;
    case "Unpaused": return `Reopened by ${short(a.account)}`;
    case "RandomnessRequested": return `Randomness #${a.requestId} for ${short(a.requester)}`;
    default: return name;
  }
}

/** Every event emitted by FinalCasinoNoOZ + MockVRF in the recent block window. */
export function ContractEvents() {
  const client = usePublicClient();
  const q = useQuery({
    queryKey: ["casino-events"],
    enabled: !!client,
    refetchInterval: 30_000,
    queryFn: async () => {
      const to = await client!.getBlockNumber();
      const from = to > WINDOW ? to - WINDOW : 0n;
      const [c, v] = await Promise.all([
        client!.getContractEvents({ address: ADDR.casino as `0x${string}`, abi: casinoAbi, fromBlock: from, toBlock: to }),
        client!.getContractEvents({ address: ADDR.mockVrf as `0x${string}`, abi: mockVrfAbi, fromBlock: from, toBlock: to }),
      ]);
      return [...c, ...v]
        .map((l) => ({ key: `${l.transactionHash}-${l.logIndex}`, hash: l.transactionHash, block: l.blockNumber, name: l.eventName as string, args: (l.args ?? {}) as Record<string, unknown> }))
        .sort((x, y) => Number((y.block ?? 0n) - (x.block ?? 0n)));
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Last ~{WINDOW.toString()} blocks · {q.data?.length ?? 0} events</span>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Loading…" : "Refresh"}</Button>
      </div>
      {q.error && <p className="text-xs text-destructive">Could not read contract events.</p>}
      {q.data?.length === 0 && <p className="text-xs text-muted-foreground">No contract activity in this window yet.</p>}
      <ul className="max-h-80 space-y-1.5 overflow-auto">
        {q.data?.map((e) => (
          <li key={e.key} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-xs">
            <span><strong className="mr-2">{e.name}</strong>{describe(e.name, e.args)}</span>
            {e.hash && <a href={explorerTx(e.hash)} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">tx ↗</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
