import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { ADDR } from "@/lib/chain";

export const SWAP_EVT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);

// LitVM block time ~2s → 24h ≈ 43,200 blocks. We cap to 50k to stay safe with RPC limits.
const LOOKBACK_24H = 43_200n;
const MAX_LOOKBACK = 50_000n;

export type PoolMeta = {
  pair: Address;
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
  decimals0: number;
  decimals1: number;
};

export type PoolStat = {
  tvlWzk: bigint; // value in wzkLTC (18d)
  vol24Wzk: bigint; // 24h volume in wzkLTC (18d)
  swaps24: number;
};

const WZK = ADDR.wzkLTC.toLowerCase();
const ONE = 10n ** 18n;

/**
 * Build a price map: token (lowercase address) -> price in wzkLTC, scaled to 1e18.
 * Derived from current reserves of every token's wzkLTC pool.
 */
function buildPriceMap(metas: PoolMeta[]): Map<string, bigint> {
  const px = new Map<string, bigint>();
  px.set(WZK, ONE);
  for (const m of metas) {
    const t0 = m.token0.toLowerCase();
    const t1 = m.token1.toLowerCase();
    if (m.reserve0 === 0n || m.reserve1 === 0n) continue;
    if (t0 === WZK && !px.has(t1)) {
      // price of t1 in wzkLTC = reserve0 / reserve1 (decimals-normalized)
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

/** Convert a raw token amount (with `decimals`) to a wzkLTC-equivalent (18d). */
function toWzk(amount: bigint, decimals: number, priceWzk?: bigint): bigint {
  if (!priceWzk || amount === 0n) return 0n;
  const norm = decimals === 18 ? amount : decimals < 18
    ? amount * 10n ** BigInt(18 - decimals)
    : amount / 10n ** BigInt(decimals - 18);
  return (norm * priceWzk) / ONE;
}

export function usePoolStats(metas: PoolMeta[]) {
  const client = usePublicClient();
  const key = metas.map((m) => `${m.pair}:${m.reserve0}:${m.reserve1}`).join("|");
  return useQuery({
    queryKey: ["pool-stats", key, client?.chain?.id],
    enabled: !!client && metas.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const out = new Map<string, PoolStat>();
      const prices = buildPriceMap(metas);

      // TVL — instantaneous, no logs needed
      for (const m of metas) {
        const t0 = m.token0.toLowerCase();
        const t1 = m.token1.toLowerCase();
        const v0 = toWzk(m.reserve0, m.decimals0, prices.get(t0));
        const v1 = toWzk(m.reserve1, m.decimals1, prices.get(t1));
        out.set(m.pair.toLowerCase(), { tvlWzk: v0 + v1, vol24Wzk: 0n, swaps24: 0 });
      }

      // Volume — single getLogs over all pairs in the 24h window
      if (client && metas.length > 0) {
        try {
          const head = await client.getBlockNumber();
          const lookback = LOOKBACK_24H > MAX_LOOKBACK ? MAX_LOOKBACK : LOOKBACK_24H;
          const from = head > lookback ? head - lookback : 0n;
          const logs = await client.getLogs({
            event: SWAP_EVT,
            address: metas.map((m) => m.pair),
            fromBlock: from,
            toBlock: head,
          });
          const byPair = new Map<string, PoolMeta>();
          for (const m of metas) byPair.set(m.pair.toLowerCase(), m);
          for (const l of logs) {
            const key = (l.address as string).toLowerCase();
            const m = byPair.get(key);
            const stat = out.get(key);
            if (!m || !stat) continue;
            const a0 = (l.args.amount0In as bigint) + (l.args.amount0Out as bigint);
            const a1 = (l.args.amount1In as bigint) + (l.args.amount1Out as bigint);
            // Sum both sides in wzkLTC then halve to avoid double counting (input+output).
            const v = (toWzk(a0, m.decimals0, prices.get(m.token0.toLowerCase()))
              + toWzk(a1, m.decimals1, prices.get(m.token1.toLowerCase()))) / 2n;
            stat.vol24Wzk += v;
            stat.swaps24 += 1;
          }
        } catch {
          /* RPC range limit — skip volumes silently */
        }
      }

      return { stats: out, prices };
    },
  });
}

/** Pretty-print wzkLTC-denominated value with a small unit. */
export function fmtWzk(v?: bigint, frac = 2): string {
  if (v === undefined || v === 0n) return "—";
  const whole = v / ONE;
  const remainder = v % ONE;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1e6).toFixed(2)}M`;
  if (whole >= 1_000n) return `${(Number(whole) / 1e3).toFixed(2)}K`;
  const dec = Number(remainder) / 1e18;
  return (Number(whole) + dec).toFixed(frac);
}