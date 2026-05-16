import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Address } from "viem";
import { SWAP_EVT, type PoolMeta } from "@/lib/poolStats";
import { ADDR } from "@/lib/chain";

// LitVM ~2s block time
const BLOCKS_24H = 43_200n;
const BLOCKS_1H = 1_800n;
const MAX_RANGE = 50_000n;
const WZK = ADDR.wzkLTC.toLowerCase();
const ONE = 10n ** 18n;

function toWzk(amount: bigint, decimals: number, priceWzk?: bigint): bigint {
  if (!priceWzk || amount === 0n) return 0n;
  const norm = decimals === 18 ? amount : decimals < 18
    ? amount * 10n ** BigInt(18 - decimals)
    : amount / 10n ** BigInt(decimals - 18);
  return (norm * priceWzk) / ONE;
}

function buildPriceMap(metas: PoolMeta[]): Map<string, bigint> {
  const px = new Map<string, bigint>();
  px.set(WZK, ONE);
  for (const m of metas) {
    const t0 = m.token0.toLowerCase();
    const t1 = m.token1.toLowerCase();
    if (m.reserve0 === 0n || m.reserve1 === 0n) continue;
    if (t0 === WZK && !px.has(t1)) {
      const num = m.reserve0 * 10n ** BigInt(m.decimals1);
      const den = m.reserve1 * 10n ** BigInt(m.decimals0);
      if (den > 0n) px.set(t1, (num * ONE) / den);
    } else if (t1 === WZK && !px.has(t0)) {
      const num = m.reserve1 * 10n ** BigInt(m.decimals0);
      const den = m.reserve0 * 10n ** BigInt(m.decimals1);
      if (den > 0n) px.set(t0, (num * ONE) / den);
    }
  }
  return px;
}

export type DexStats = {
  pools: number;
  txs24h: number;
  volume24hWzk: bigint;
  uniqueWallets: number; // unique wallets seen in lookback window (~24h)
  activeWallets1h: number; // unique wallets in last ~1h
  tvlWzk: bigint;
};

/**
 * Aggregate DEX-wide stats from on-chain Swap logs across all pairs.
 */
export function useDexStats(metas: PoolMeta[]) {
  const client = usePublicClient();
  const key = metas.map((m) => `${m.pair}:${m.reserve0}:${m.reserve1}`).join("|");
  return useQuery({
    queryKey: ["dex-stats", key, client?.chain?.id],
    enabled: !!client && metas.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<DexStats> => {
      const prices = buildPriceMap(metas);
      // TVL
      let tvlWzk = 0n;
      for (const m of metas) {
        tvlWzk += toWzk(m.reserve0, m.decimals0, prices.get(m.token0.toLowerCase()));
        tvlWzk += toWzk(m.reserve1, m.decimals1, prices.get(m.token1.toLowerCase()));
      }

      const base: DexStats = {
        pools: metas.length,
        txs24h: 0,
        volume24hWzk: 0n,
        uniqueWallets: 0,
        activeWallets1h: 0,
        tvlWzk,
      };
      if (!client) return base;

      try {
        const head = await client.getBlockNumber();
        const lookback = BLOCKS_24H > MAX_RANGE ? MAX_RANGE : BLOCKS_24H;
        const from = head > lookback ? head - lookback : 0n;
        const cutoff1h = head > BLOCKS_1H ? head - BLOCKS_1H : 0n;
        const logs = await client.getLogs({
          event: SWAP_EVT,
          address: metas.map((m) => m.pair as Address),
          fromBlock: from,
          toBlock: head,
        });

        const byPair = new Map<string, PoolMeta>();
        for (const m of metas) byPair.set(m.pair.toLowerCase(), m);

        const uniq = new Set<string>();
        const active1h = new Set<string>();
        let vol = 0n;

        for (const l of logs) {
          const m = byPair.get((l.address as string).toLowerCase());
          if (!m) continue;
          const a0 = (l.args.amount0In as bigint) + (l.args.amount0Out as bigint);
          const a1 = (l.args.amount1In as bigint) + (l.args.amount1Out as bigint);
          vol += (toWzk(a0, m.decimals0, prices.get(m.token0.toLowerCase()))
            + toWzk(a1, m.decimals1, prices.get(m.token1.toLowerCase()))) / 2n;

          const s = (l.args.sender as string | undefined)?.toLowerCase();
          const t = (l.args.to as string | undefined)?.toLowerCase();
          if (s) uniq.add(s);
          if (t) uniq.add(t);
          if (l.blockNumber !== undefined && l.blockNumber >= cutoff1h) {
            if (s) active1h.add(s);
            if (t) active1h.add(t);
          }
        }

        return {
          pools: metas.length,
          txs24h: logs.length,
          volume24hWzk: vol,
          uniqueWallets: uniq.size,
          activeWallets1h: active1h.size,
          tvlWzk,
        };
      } catch {
        return base;
      }
    },
  });
}