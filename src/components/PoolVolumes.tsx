import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { fmt } from "@/lib/format";

const SWAP_EVT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"
);

const LOOKBACK = 30_000n; // recent window (~24h depending on block time)

export type PoolVolume = { a0: bigint; a1: bigint; swaps: number };

export function usePoolVolumes(pairs: Address[]) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["pool-volumes", pairs.length, client?.chain?.id],
    enabled: !!client && pairs.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!client) return new Map<string, PoolVolume>();
      const head = await client.getBlockNumber();
      const from = head > LOOKBACK ? head - LOOKBACK : 0n;
      const logs = await client.getLogs({ event: SWAP_EVT, address: pairs, fromBlock: from, toBlock: head }).catch(() => []);
      const m = new Map<string, PoolVolume>();
      for (const l of logs as any[]) {
        const key = (l.address as string).toLowerCase();
        const cur = m.get(key) ?? { a0: 0n, a1: 0n, swaps: 0 };
        cur.a0 += (l.args.amount0In as bigint) + (l.args.amount0Out as bigint);
        cur.a1 += (l.args.amount1In as bigint) + (l.args.amount1Out as bigint);
        cur.swaps += 1;
        m.set(key, cur);
      }
      return m;
    },
  });
}

export function VolumeBadge({ vol, sym0, sym1, d0, d1 }: { vol?: PoolVolume; sym0?: string; sym1?: string; d0: number; d1: number }) {
  if (!vol) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="font-mono text-foreground" title={`${vol.swaps} swaps`}>
      {fmt(vol.a0, d0, 2)} {sym0} · {fmt(vol.a1, d1, 2)} {sym1}
    </span>
  );
}