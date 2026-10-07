import { useState } from "react";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { Search } from "lucide-react";
import { ADDR } from "@/lib/chain";
import { casinoAbi } from "@/lib/abis/casino";
import { Button } from "@/components/ui/button";

const GAMES = ["Coin Flip", "Dice", "Roulette", "Rock Paper Scissors", "High / Low"];
const STATUS = ["Pending", "Won", "Lost", "Refunded"];

/** Look up any bet on-chain by its request ID (casino.getBet). */
export function BetLookup() {
  const [input, setInput] = useState("");
  const [id, setId] = useState<bigint>();
  const bet = useReadContract({
    address: ADDR.casino as `0x${string}`,
    abi: casinoAbi,
    functionName: "getBet",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined },
  });
  const b = bet.data as
    | { player: string; amount: bigint; game: number; choice: number; requestId: bigint; status: number; payout: bigint; timestamp: bigint }
    | undefined;
  const empty = b && b.player === "0x0000000000000000000000000000000000000000";

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d+$/.test(input)) setId(BigInt(input));
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          placeholder="Bet ID, e.g. 1"
          inputMode="numeric"
          aria-label="Bet ID"
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <Button type="submit" disabled={!input}>
          <Search className="h-4 w-4" /> Look up
        </Button>
      </form>
      {bet.isFetching && <p className="text-xs text-muted-foreground">Reading from the blockchain…</p>}
      {bet.error && <p className="text-xs text-destructive">Could not read this bet.</p>}
      {empty && <p className="text-xs text-muted-foreground">No bet found with this ID.</p>}
      {b && !empty && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["Player", `${b.player.slice(0, 6)}…${b.player.slice(-4)}`],
            ["Game", GAMES[b.game] ?? `#${b.game}`],
            ["Choice", String(b.choice)],
            ["Stake", `${Number(formatEther(b.amount)).toFixed(4)} zkLTC`],
            ["Status", STATUS[b.status] ?? `#${b.status}`],
            ["Payout", `${Number(formatEther(b.payout)).toFixed(4)} zkLTC`],
            ["Time", b.timestamp > 0n ? new Date(Number(b.timestamp) * 1000).toLocaleString() : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
