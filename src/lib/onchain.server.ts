import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { litvm, ADDR } from "@/lib/chain";

/** Server-side on-chain readers used by ORVEX Copilot tool-calling. */

const factoryAbi = parseAbi([
  "function allPairsLength() view returns (uint256)",
  "function allPairs(uint256) view returns (address)",
  "function getPair(address,address) view returns (address)",
]);

const pairAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
]);

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
]);

const ONE = 10n ** 18n;
const WZK = ADDR.wzkLTC.toLowerCase();

/** Symbol → address map (native zkLTC routes through wzkLTC). */
export const SYMBOLS: Record<string, Address> = {
  zkltc: ADDR.wzkLTC as Address,
  wzkltc: ADDR.wzkLTC as Address,
  trx: ADDR.TRX as Address,
  xrp: ADDR.XRP as Address,
  ada: ADDR.ADA as Address,
  zec: ADDR.ZEC as Address,
  xmr: ADDR.XMR as Address,
  orvx: ADDR.ORVX as Address,
};

export function resolveToken(input: string): Address | null {
  const s = input.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(s)) return s as Address;
  return SYMBOLS[s.toLowerCase().replace(/^\$/, "")] ?? null;
}

function client() {
  return createPublicClient({ chain: litvm, transport: http(litvm.rpcUrls.default.http[0]) });
}

export type PoolInfo = {
  pair: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  reserve0: string;
  reserve1: string;
  price: string; // token1 priced in token0
  tvlWzk: number;
};

type CacheEntry = { at: number; pools: PoolInfo[] };
let poolCache: CacheEntry | null = null;

export async function loadPools(force = false): Promise<PoolInfo[]> {
  if (!force && poolCache && Date.now() - poolCache.at < 30_000) return poolCache.pools;
  const c = client();

  const len = (await c.readContract({
    address: ADDR.factory as Address,
    abi: factoryAbi,
    functionName: "allPairsLength",
  })) as bigint;
  const total = Number(len);
  if (total === 0) return [];

  const pairAddrs = (await c.multicall({
    contracts: Array.from({ length: total }, (_, i) => ({
      address: ADDR.factory as Address,
      abi: factoryAbi,
      functionName: "allPairs" as const,
      args: [BigInt(i)] as const,
    })),
    allowFailure: true,
  })) as { status: string; result?: Address }[];

  const pairs = pairAddrs.map((r) => r.result).filter(Boolean) as Address[];

  const details = (await c.multicall({
    contracts: pairs.flatMap((p) => [
      { address: p, abi: pairAbi, functionName: "token0" as const },
      { address: p, abi: pairAbi, functionName: "token1" as const },
      { address: p, abi: pairAbi, functionName: "getReserves" as const },
    ]),
    allowFailure: true,
  })) as { status: string; result?: unknown }[];

  const tokenSet = new Set<string>();
  for (let i = 0; i < pairs.length; i++) {
    const t0 = details[i * 3]?.result as Address | undefined;
    const t1 = details[i * 3 + 1]?.result as Address | undefined;
    if (t0) tokenSet.add(t0.toLowerCase());
    if (t1) tokenSet.add(t1.toLowerCase());
  }
  const tokenList = [...tokenSet] as Address[];
  const meta = (await c.multicall({
    contracts: tokenList.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: "symbol" as const },
      { address: t, abi: erc20Abi, functionName: "decimals" as const },
    ]),
    allowFailure: true,
  })) as { status: string; result?: unknown }[];

  const info = new Map<string, { symbol: string; decimals: number }>();
  tokenList.forEach((t, i) => {
    info.set(t.toLowerCase(), {
      symbol: (meta[i * 2]?.result as string) ?? t.slice(0, 6),
      decimals: Number(meta[i * 2 + 1]?.result ?? 18),
    });
  });

  // price map: token → wzkLTC value scaled 1e18
  const px = new Map<string, bigint>([[WZK, ONE]]);
  const raw: {
    pair: Address;
    t0: Address;
    t1: Address;
    r0: bigint;
    r1: bigint;
    d0: number;
    d1: number;
  }[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const t0 = details[i * 3]?.result as Address | undefined;
    const t1 = details[i * 3 + 1]?.result as Address | undefined;
    const r = details[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
    if (!t0 || !t1 || !r) continue;
    const d0 = info.get(t0.toLowerCase())?.decimals ?? 18;
    const d1 = info.get(t1.toLowerCase())?.decimals ?? 18;
    raw.push({ pair: pairs[i], t0, t1, r0: r[0], r1: r[1], d0, d1 });
    if (r[0] === 0n || r[1] === 0n) continue;
    const a = t0.toLowerCase();
    const b = t1.toLowerCase();
    if (a === WZK && !px.has(b)) px.set(b, (r[0] * 10n ** BigInt(d1) * ONE) / (r[1] * 10n ** BigInt(d0)));
    else if (b === WZK && !px.has(a)) px.set(a, (r[1] * 10n ** BigInt(d0) * ONE) / (r[0] * 10n ** BigInt(d1)));
  }

  const toWzk = (amount: bigint, decimals: number, price?: bigint) => {
    if (!price || amount === 0n) return 0n;
    const norm =
      decimals === 18
        ? amount
        : decimals < 18
          ? amount * 10n ** BigInt(18 - decimals)
          : amount / 10n ** BigInt(decimals - 18);
    return (norm * price) / ONE;
  };

  const pools: PoolInfo[] = raw.map((p) => {
    const s0 = info.get(p.t0.toLowerCase())?.symbol ?? "?";
    const s1 = info.get(p.t1.toLowerCase())?.symbol ?? "?";
    const tvl =
      toWzk(p.r0, p.d0, px.get(p.t0.toLowerCase())) + toWzk(p.r1, p.d1, px.get(p.t1.toLowerCase()));
    const a0 = Number(formatUnits(p.r0, p.d0));
    const a1 = Number(formatUnits(p.r1, p.d1));
    return {
      pair: p.pair,
      token0: p.t0,
      token1: p.t1,
      symbol0: s0,
      symbol1: s1,
      reserve0: a0.toFixed(6),
      reserve1: a1.toFixed(6),
      price: a1 > 0 ? (a0 / a1).toFixed(8) : "0",
      tvlWzk: Number(formatUnits(tvl, 18)),
    };
  });

  pools.sort((a, b) => b.tvlWzk - a.tvlWzk);
  poolCache = { at: Date.now(), pools };
  return pools;
}

export async function getProtocolStats() {
  const pools = await loadPools();
  const tvl = pools.reduce((acc, p) => acc + p.tvlWzk, 0);
  return {
    chain: "LitVM LiteForge (4441)",
    pools: pools.length,
    tvlWzk: tvl.toFixed(4),
    topPools: pools.slice(0, 5).map((p) => ({
      pair: `${p.symbol0}/${p.symbol1}`,
      tvlWzk: p.tvlWzk.toFixed(4),
    })),
  };
}

export async function getTokenPrice(symbolOrAddress: string) {
  const addr = resolveToken(symbolOrAddress);
  if (!addr) return { error: `Unknown token "${symbolOrAddress}"` };
  const pools = await loadPools();
  const a = addr.toLowerCase();
  if (a === WZK) return { token: "wzkLTC", priceWzk: "1", source: "base asset" };
  const pool = pools.find(
    (p) =>
      (p.token0.toLowerCase() === a && p.token1.toLowerCase() === WZK) ||
      (p.token1.toLowerCase() === a && p.token0.toLowerCase() === WZK),
  );
  if (!pool) return { error: "No direct wzkLTC pool for this token" };
  const isT0 = pool.token0.toLowerCase() === a;
  const r0 = Number(pool.reserve0);
  const r1 = Number(pool.reserve1);
  const price = isT0 ? r1 / r0 : r0 / r1;
  return {
    token: isT0 ? pool.symbol0 : pool.symbol1,
    priceWzk: price.toFixed(8),
    poolTvlWzk: pool.tvlWzk.toFixed(4),
    pair: `${pool.symbol0}/${pool.symbol1}`,
  };
}

export async function quoteSwap(from: string, to: string, amount: string) {
  const a = resolveToken(from);
  const b = resolveToken(to);
  if (!a || !b) return { error: "Unknown token symbol" };
  if (a.toLowerCase() === b.toLowerCase()) return { error: "from and to must differ" };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { error: "Invalid amount" };

  const c = client();
  const amountIn = BigInt(Math.round(amt * 1e6)) * 10n ** 12n; // 18 decimals across all listed tokens
  const paths: Address[][] =
    a.toLowerCase() === WZK || b.toLowerCase() === WZK
      ? [[a, b]]
      : [
          [a, b],
          [a, ADDR.wzkLTC as Address, b],
        ];

  let best: { path: Address[]; out: bigint } | null = null;
  for (const path of paths) {
    try {
      const amounts = (await c.readContract({
        address: ADDR.router as Address,
        abi: routerAbi,
        functionName: "getAmountsOut",
        args: [amountIn, path],
      })) as readonly bigint[];
      const out = amounts[amounts.length - 1];
      if (!best || out > best.out) best = { path: [...path], out };
    } catch {
      /* path has no liquidity */
    }
  }
  if (!best) return { error: "No route with liquidity for this pair" };

  const pools = await loadPools();
  const label = (addr: Address) =>
    pools.find((p) => p.token0.toLowerCase() === addr.toLowerCase())?.symbol0 ??
    pools.find((p) => p.token1.toLowerCase() === addr.toLowerCase())?.symbol1 ??
    addr.slice(0, 6);

  const outNum = Number(formatUnits(best.out, 18));
  return {
    amountIn: amt.toString(),
    amountOut: outNum.toFixed(6),
    rate: (outNum / amt).toFixed(8),
    hops: best.path.length - 1,
    route: best.path.map(label).join(" → "),
    swapUrl: `/swap?from=${label(best.path[0])}&to=${label(best.path[best.path.length - 1])}`,
  };
}

export async function getPool(tokenA: string, tokenB: string) {
  const a = resolveToken(tokenA);
  const b = resolveToken(tokenB);
  if (!a || !b) return { error: "Unknown token symbol" };
  const pools = await loadPools();
  const found = pools.find(
    (p) =>
      (p.token0.toLowerCase() === a.toLowerCase() && p.token1.toLowerCase() === b.toLowerCase()) ||
      (p.token1.toLowerCase() === a.toLowerCase() && p.token0.toLowerCase() === b.toLowerCase()),
  );
  if (!found) return { error: "Pool does not exist yet — it can be created on /liquidity" };
  return {
    pair: `${found.symbol0}/${found.symbol1}`,
    address: found.pair,
    reserves: { [found.symbol0]: found.reserve0, [found.symbol1]: found.reserve1 },
    price: `1 ${found.symbol1} = ${found.price} ${found.symbol0}`,
    tvlWzk: found.tvlWzk.toFixed(4),
    liquidityUrl: `/liquidity?from=${found.symbol0}&to=${found.symbol1}`,
  };
}
