import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContracts } from "wagmi";
import { pairAbi } from "@/lib/abis/pair";
import { TOKENS } from "@/lib/tokens";
import { explorerTx } from "@/lib/chain";
import { fmt } from "@/lib/format";
import { parseAbiItem, type Address, type Log } from "viem";
import { useMemo } from "react";

const SWAP_EVT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"
);
const MINT_EVT = parseAbiItem("event Mint(address indexed sender, uint256 amount0, uint256 amount1)");
const BURN_EVT = parseAbiItem(
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)"
);

type Activity = {
  hash: `0x${string}`;
  block: bigint;
  pair: Address;
  kind: "Swap" | "Add" | "Remove";
  a0In: bigint; a1In: bigint; a0Out: bigint; a1Out: bigint;
};

const LOOKBACK = 50_000n;

export function ActivityFeed({ owner }: { owner: Address }) {
  const client = usePublicClient();

  const q = useQuery({
    queryKey: ["activity", owner, client?.chain?.id],
    enabled: !!client && !!owner,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Activity[]> => {
      if (!client) return [];
      const head = await client.getBlockNumber();
      const from = head > LOOKBACK ? head - LOOKBACK : 0n;
      const [swaps, mints, burns] = await Promise.all([
        client.getLogs({ event: SWAP_EVT, args: { to: owner }, fromBlock: from, toBlock: head }).catch(() => [] as Log[]),
        client.getLogs({ event: MINT_EVT, args: { sender: owner }, fromBlock: from, toBlock: head }).catch(() => [] as Log[]),
        client.getLogs({ event: BURN_EVT, args: { to: owner }, fromBlock: from, toBlock: head }).catch(() => [] as Log[]),
      ]);
      const out: Activity[] = [];
      for (const l of swaps as any[]) {
        out.push({ hash: l.transactionHash, block: l.blockNumber, pair: l.address, kind: "Swap",
          a0In: l.args.amount0In, a1In: l.args.amount1In, a0Out: l.args.amount0Out, a1Out: l.args.amount1Out });
      }
      for (const l of mints as any[]) {
        out.push({ hash: l.transactionHash, block: l.blockNumber, pair: l.address, kind: "Add",
          a0In: l.args.amount0, a1In: l.args.amount1, a0Out: 0n, a1Out: 0n });
      }
      for (const l of burns as any[]) {
        out.push({ hash: l.transactionHash, block: l.blockNumber, pair: l.address, kind: "Remove",
          a0In: 0n, a1In: 0n, a0Out: l.args.amount0, a1Out: l.args.amount1 });
      }
      return out.sort((a, b) => Number(b.block - a.block)).slice(0, 25);
    },
  });

  const items = q.data ?? [];
  const uniquePairs = useMemo(() => Array.from(new Set(items.map((i) => i.pair))), [items]);
  const meta = useReadContracts({
    contracts: uniquePairs.flatMap((p) => [
      { address: p, abi: pairAbi, functionName: "token0" as const },
      { address: p, abi: pairAbi, functionName: "token1" as const },
    ]),
    query: { enabled: uniquePairs.length > 0 },
  });
  const pairTokens = useMemo(() => {
    const m = new Map<Address, { t0?: Address; t1?: Address }>();
    uniquePairs.forEach((p, i) => {
      m.set(p, {
        t0: meta.data?.[i * 2]?.result as Address | undefined,
        t1: meta.data?.[i * 2 + 1]?.result as Address | undefined,
      });
    });
    return m;
  }, [uniquePairs, meta.data]);

  if (q.isLoading) return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground text-center">Loading activity…</div>;
  if (items.length === 0) return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground text-center">No recent activity in the last {Number(LOOKBACK).toLocaleString()} blocks.</div>;

  return (
    <div className="space-y-2">
      {items.map((it, idx) => {
        const pt = pairTokens.get(it.pair);
        const tk0 = pt?.t0 ? TOKENS.find((t) => t.address.toLowerCase() === pt.t0!.toLowerCase()) : undefined;
        const tk1 = pt?.t1 ? TOKENS.find((t) => t.address.toLowerCase() === pt.t1!.toLowerCase()) : undefined;
        const d0 = tk0?.decimals ?? 18;
        const d1 = tk1?.decimals ?? 18;
        let label = "";
        if (it.kind === "Swap") {
          const inSym = it.a0In > 0n ? tk0?.symbol : tk1?.symbol;
          const outSym = it.a0Out > 0n ? tk0?.symbol : tk1?.symbol;
          const inAmt = it.a0In > 0n ? fmt(it.a0In, d0) : fmt(it.a1In, d1);
          const outAmt = it.a0Out > 0n ? fmt(it.a0Out, d0) : fmt(it.a1Out, d1);
          label = `${inAmt} ${inSym ?? "?"} → ${outAmt} ${outSym ?? "?"}`;
        } else if (it.kind === "Add") {
          label = `+${fmt(it.a0In, d0)} ${tk0?.symbol ?? "?"} & +${fmt(it.a1In, d1)} ${tk1?.symbol ?? "?"}`;
        } else {
          label = `−${fmt(it.a0Out, d0)} ${tk0?.symbol ?? "?"} & −${fmt(it.a1Out, d1)} ${tk1?.symbol ?? "?"}`;
        }
        const kindClass =
          it.kind === "Swap" ? "bg-primary/15 text-primary"
          : it.kind === "Add" ? "bg-emerald-500/15 text-emerald-400"
          : "bg-amber-500/15 text-amber-400";
        return (
          <a key={`${it.hash}-${idx}`} href={explorerTx(it.hash)} target="_blank" rel="noreferrer"
             className="glass rounded-xl px-4 py-3 flex items-center justify-between hover:neon-border transition">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${kindClass}`}>{it.kind}</span>
              <div className="flex -space-x-2">
                {tk0 && <img src={tk0.logo} alt={`${tk0.symbol} token logo`} className="h-7 w-7 rounded-full ring-2 ring-background" />}
                {tk1 && <img src={tk1.logo} alt={`${tk1.symbol} token logo`} className="h-7 w-7 rounded-full ring-2 ring-background" />}
              </div>
              <span className="text-sm truncate">{label}</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono shrink-0 ml-3">#{it.block.toString()} ↗</span>
          </a>
        );
      })}
    </div>
  );
}