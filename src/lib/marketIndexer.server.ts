/**
 * On-chain market indexer (server-only).
 * Incrementally scans Swap events on LitVM, stores pools/tokens/swaps in the
 * cloud database, then refreshes token_stats via SQL aggregation.
 * Runs on-demand (lease-protected) — no cron required.
 */
import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  encodeFunctionData,
  toHex,
  type Address,
} from "viem";
import { litvm, ADDR, DEXES } from "./chain";

const SWAP_TOPIC0 =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

const swapEventAbi = [
  parseAbiItem(
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  ),
];

const poolAbi = [
  parseAbiItem("function token0() view returns (address)"),
  parseAbiItem("function token1() view returns (address)"),
  parseAbiItem("function getReserves() view returns (uint112, uint112, uint32)"),
];

const tokenAbi = [
  parseAbiItem("function symbol() view returns (string)"),
  parseAbiItem("function name() view returns (string)"),
  parseAbiItem("function decimals() view returns (uint8)"),
];

// Multicall3 aggregate3((address target, bool allowFailure, bytes callData)[])
const aggregate3Abi = [
  parseAbiItem(
    "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
  ),
];

const CHUNK = 5_000n;
const CHUNKS_PER_RUN = 4; // ≈ 20k blocks (~11h of chain) per run
const FIRST_RUN_LOOKBACK = 400_000n; // ~9 days of history on first run
const ZERO = "0x0000000000000000000000000000000000000000" as const;

export type IndexerResult = {
  ok: boolean;
  skipped?: string;
  fromBlock?: number;
  toBlock?: number;
  poolsFound?: number;
  newPools?: number;
  swapsIndexed?: number;
  tokensTracked?: number;
  zklbtcUsd?: number | null;
};

function getPublicClient() {
  return createPublicClient({
    chain: litvm,
    transport: http(litvm.rpcUrls.default.http[0], { timeout: 20_000, batch: false }),
  });
}

async function aggregate(calls: { target: string; callData: string }[]) {
  const client = getPublicClient();
  const out: { success: boolean; returnData: `0x${string}` }[] = [];
  for (let i = 0; i < calls.length; i += 200) {
    const slice = calls.slice(i, i + 200);
    try {
      const res = (await client.readContract({
        address: ADDR.multicall as Address,
        abi: aggregate3Abi,
        functionName: "aggregate3",
        args: [slice.map((c) => ({ target: c.target as Address, allowFailure: true, callData: c.callData as `0x${string}` }))],
      })) as { success: boolean; returnData: `0x${string}` }[];
      out.push(...res);
    } catch {
      for (let j = 0; j < slice.length; j++) out.push({ success: false, returnData: "0x" as `0x${string}` });
    }
  }
  return out;
}

function decodeString(data: `0x${string}`): string | null {
  try {
    if (!data || data === "0x" || data.length < 138) return null;
    const [offset, len] = [BigInt(data.slice(10, 74)), BigInt(data.slice(74, 138))];
    const n = Number(len);
    return Buffer.from(data.slice(138 + Number(offset) * 2, 138 + Number(offset) * 2 + n * 2).replace(/0+$/, "").slice(0, n * 2) || "", "hex").toString("utf8").replace(/\0/g, "");
  } catch {
    return null;
  }
}

function decodeUint(data: `0x${string}`): bigint | null {
  try {
    if (!data || data === "0x" || data.length < 66) return null;
    return BigInt(data.slice(0, 66));
  } catch {
    return null;
  }
}

async function fetchZklUsd(): Promise<number | null> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd",
      { signal: AbortSignal.timeout(6000) },
    );
    const j = (await r.json()) as { litecoin?: { usd?: number } };
    return typeof j?.litecoin?.usd === "number" ? j.litecoin.usd : null;
  } catch {
    return null;
  }
}

export async function runIndexerOnce(): Promise<IndexerResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Acquire lease — only one indexer run at a time.
  const nowIso = new Date().toISOString();
  const leased = await supabaseAdmin
    .from("indexer_state")
    .update({ lease_until: new Date(Date.now() + 180_000).toISOString() })
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .eq("id", "default")
    .select("last_block, zklbtc_usd")
    .maybeSingle();

  if (!leased.data) {
    return { ok: true, skipped: "busy" };
  }

  const startBlock = BigInt((leased.data.last_block as number | string) ?? 0);
  const client = getPublicClient();

  try {
    const head = await client.getBlockNumber();
    let from = startBlock > 0n ? startBlock + 1n : 0n;
    if (from === 0n || from === 1n) {
      from = head > FIRST_RUN_LOOKBACK ? head - FIRST_RUN_LOOKBACK : 0n;
    }
    if (from > head) {
      await supabaseAdmin.from("indexer_state").update({ lease_until: null }).eq("id", "default");
      return { ok: true, fromBlock: Number(from), toBlock: Number(head), swapsIndexed: 0 };
    }

    // Timestamp anchors for linear interpolation (2 RPC calls total).
    const [bFrom, bHead] = await Promise.all([
      client.getBlock({ blockNumber: from }),
      client.getBlock({ blockNumber: head }),
    ]);
    const span = Number(head - from) || 1;
    const tFrom = Number(bFrom.timestamp);
    const tHead = Number(bHead.timestamp);
    const timeAt = (block: bigint) =>
      block >= head ? tHead : tFrom + ((Number(block - from) * (tHead - tFrom)) / span);

    const swapRows: Record<string, unknown>[] = [];
    const touchedPools = new Set<string>();
    let to = from;
    let chunk = CHUNK;

    for (let i = 0; i < 64 && from <= head && i < CHUNKS_PER_RUN * 8; i++) {
      const end = from + chunk - 1n > head ? head : from + chunk - 1n;
      let logs: { address: string; blockNumber: bigint; logIndex: number; data: `0x${string}`; topics: `0x${string}`[]; transactionHash?: string }[] = [];
      try {
        const raw = (await client.request({
          method: "eth_getLogs",
          params: [{ fromBlock: toHex(from), toBlock: toHex(end), topics: [SWAP_TOPIC0] }],
        })) as typeof logs;
        logs = raw;
      } catch {
        if (chunk > 500n) {
          chunk = chunk / 2n;
          continue; // retry smaller
        }
        from = end + 1n;
        continue;
      }

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({ abi: swapEventAbi, data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
          const pool = log.address.toLowerCase();
          touchedPools.add(pool);
          swapRows.push({
            pool,
            tx_hash: (log.transactionHash ?? "").toLowerCase(),
            log_index: log.logIndex,
            block_number: Number(log.blockNumber),
            block_time: new Date(timeAt(log.blockNumber) * 1000).toISOString(),
            amount0: (decoded.args.amount0In as bigint) + (decoded.args.amount0Out as bigint),
            amount1: (decoded.args.amount1In as bigint) + (decoded.args.amount1Out as bigint),
            sender: (decoded.args.sender as string).toLowerCase(),
            recipient: (decoded.args.to as string).toLowerCase(),
          });
        } catch {
          /* skip unparsable log */
        }
      }

      to = end;
      from = end + 1n;
      if (end === head) break;
    }

    if (to < from - 1n) to = from - 1n;
    const scannedUpTo = to > startBlock ? to : startBlock;

    // ---- Pool metadata: new pools (token0/token1) + reserves for all touched
    const known = new Set<string>();
    {
      let page = 0;
      for (;;) {
        const { data } = await supabaseAdmin
          .from("pools")
          .select("address")
          .range(page * 1000, page * 1000 + 999);
        if (!data || data.length === 0) break;
        for (const r of data) known.add(r.address.toLowerCase());
        if (data.length < 1000) break;
        page++;
      }
    }

    const newPools = [...touchedPools].filter((p) => !known.has(p));
    const metaCalls: { target: string; callData: string }[] = [];
    for (const p of newPools) {
      metaCalls.push({ target: p, callData: encodeFunctionData({ abi: poolAbi, functionName: "token0" }) });
      metaCalls.push({ target: p, callData: encodeFunctionData({ abi: poolAbi, functionName: "token1" }) });
    }
    for (const p of touchedPools) {
      metaCalls.push({ target: p, callData: encodeFunctionData({ abi: poolAbi, functionName: "getReserves" }) });
    }
    const metaRes = await aggregate(metaCalls);
    const resAt = (idx: number) => metaRes[newPools.length * 2 + idx];

    const poolRows: Record<string, unknown>[] = [];
    for (let i = 0; i < newPools.length; i++) {
      const t0 = decodeUint(metaRes[i * 2]?.returnData ?? "0x");
      const t1 = decodeUint(metaRes[i * 2 + 1]?.returnData ?? "0x");
      if (!t0 || !t1 || t0 === 0n || t1 === 0n) continue;
      poolRows.push({
        address: newPools[i],
        token0: `0x${t0.toString(16).padStart(40, "0")}`,
        token1: `0x${t1.toString(16).padStart(40, "0")}`,
        factory: DEXES[0]?.factory.toLowerCase() ?? null,
      });
    }
    const reserves = new Map<string, { r0: string; r1: string }>();
    [...touchedPools].forEach((p, i) => {
      const data = resAt(i)?.returnData ?? "0x";
      // getReserves returns (uint112,uint112,uint32) — first two 32-byte words
      if (data.length >= 194) {
        reserves.set(p, { r0: BigInt(data.slice(2, 66)).toString(), r1: BigInt(data.slice(66, 130)).toString() });
      }
    });

    // ---- Token metadata for unseen tokens
    const seenTokens = new Set<string>();
    for (const p of poolRows) {
      seenTokens.add((p.token0 as string).toLowerCase());
      seenTokens.add((p.token1 as string).toLowerCase());
    }
    const tokenCalls: { target: string; callData: string }[] = [];
    for (const t of seenTokens) {
      if (t === ZERO) continue;
      tokenCalls.push({ target: t, callData: encodeFunctionData({ abi: tokenAbi, functionName: "symbol" }) });
      tokenCalls.push({ target: t, callData: encodeFunctionData({ abi: tokenAbi, functionName: "name" }) });
      tokenCalls.push({ target: t, callData: encodeFunctionData({ abi: tokenAbi, functionName: "decimals" }) });
    }
    const tokenRes = await aggregate(tokenCalls);
    const tokenRows: Record<string, unknown>[] = [];
    [...seenTokens].forEach((t, i) => {
      if (t === ZERO) return;
      const symbol = decodeString(tokenRes[i * 3]?.returnData ?? "0x") ?? "";
      const name = decodeString(tokenRes[i * 3 + 1]?.returnData ?? "0x") ?? "";
      const dec = decodeUint(tokenRes[i * 3 + 2]?.returnData ?? "0x");
      tokenRows.push({ address: t, symbol, name, decimals: dec !== null ? Number(dec) : 18 });
    });

    // ---- Writes (chunked)
    const chunkWrite = async <T>(
      table: string,
      rows: T[],
      size: number,
      opts?: Record<string, unknown>,
    ) => {
      for (let i = 0; i < rows.length; i += size) {
        const slice = rows.slice(i, i + size);
        const q = (supabaseAdmin as any).from(table).upsert(slice, opts);
        const { error } = await q;
        if (error) console.error(`[indexer] ${table} write error`, error.message);
      }
    };

    await chunkWrite("pools", poolRows, 200, { onConflict: "address", ignoreDuplicates: false });
    await chunkWrite("tokens", tokenRows, 200, { onConflict: "address", ignoreDuplicates: false });

    // reserves upsert: touch existing pools only
    const reserveRows = poolRows.length > 0
      ? []
      : [];
    void reserveRows;
    await chunkWrite(
      "pools",
      [...reserves.entries()].map(([address, r]) => ({ address, reserve0: r.r0, reserve1: r.r1 })),
      200,
      { onConflict: "address" },
    );

    let swapsIndexed = 0;
    for (let i = 0; i < swapRows.length; i += 400) {
      const slice = swapRows.slice(i, i + 400).map((r) => ({ ...r, amount0: String(r.amount0), amount1: String(r.amount1) })) as any;
      const { error } = await supabaseAdmin
        .from("swaps_history")
        .upsert(slice, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
      if (error) console.error("[indexer] swaps write error", error.message);
      else swapsIndexed += slice.length;
    }

    // ---- USD price of zkLTC (CoinGecko), then refresh aggregate stats
    const usd = await fetchZklUsd();
    const { data: stateRow } = await supabaseAdmin
      .from("indexer_state")
      .select("zklbtc_usd")
      .eq("id", "default")
      .maybeSingle();
    const effectiveUsd = usd ?? (stateRow?.zklbtc_usd as number | null) ?? null;

    await supabaseAdmin
      .from("indexer_state")
      .update({
        last_block: Number(scannedUpTo),
        lease_until: null,
        updated_at: new Date().toISOString(),
        ...(effectiveUsd !== null ? { zklbtc_usd: effectiveUsd } : {}),
      })
      .eq("id", "default");

    const { error: rpcErr } = await supabaseAdmin.rpc("refresh_token_stats", {
      p_zklbtc_usd: effectiveUsd ?? undefined,
    });
    if (rpcErr) console.error("[indexer] refresh_token_stats error", rpcErr.message);

    return {
      ok: true,
      fromBlock: Number(from - 1n),
      toBlock: Number(to),
      poolsFound: touchedPools.size,
      newPools: poolRows.length,
      swapsIndexed,
      tokensTracked: tokenRows.length,
      zklbtcUsd: effectiveUsd,
    };
  } catch (e) {
    await supabaseAdmin.from("indexer_state").update({ lease_until: null }).eq("id", "default");
    console.error("[indexer] run failed", e);
    return { ok: false, skipped: "error" };
  }
}
