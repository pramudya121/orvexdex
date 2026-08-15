/**
 * Local P&L history store.
 *
 * Every snapshot is derived from live on-chain reads (balances + pool reserves)
 * and persisted per-wallet in localStorage so we can chart performance over time
 * without an indexer.
 */

export type PnlHolding = { symbol: string; value: number };
export type PnlPoint = { t: number; total: number; holdings: PnlHolding[] };

const PREFIX = "orvex.pnl.v2:";
const MAX_POINTS = 500;
const MIN_GAP_MS = 2 * 60 * 1000; // don't store more than one point per 2 minutes

const keyFor = (address: string) => `${PREFIX}${address.toLowerCase()}`;

export function loadHistory(address?: string): PnlPoint[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(keyFor(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PnlPoint[]) : [];
  } catch {
    return [];
  }
}

export function recordSnapshot(
  address: string | undefined,
  total: number,
  holdings: PnlHolding[],
): PnlPoint[] {
  if (typeof window === "undefined" || !address || !Number.isFinite(total)) return [];
  const points = loadHistory(address);
  const now = Date.now();
  const last = points[points.length - 1];
  if (last && now - last.t < MIN_GAP_MS) {
    // Refresh the latest point instead of appending noise.
    last.total = total;
    last.holdings = holdings;
  } else {
    points.push({ t: now, total, holdings });
  }
  const trimmed = points.slice(-MAX_POINTS);
  try {
    localStorage.setItem(keyFor(address), JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent("orvex:pnl-updated"));
  } catch {
    /* quota — ignore */
  }
  return trimmed;
}

export function clearHistory(address?: string) {
  if (typeof window === "undefined" || !address) return;
  try {
    localStorage.removeItem(keyFor(address));
    window.dispatchEvent(new CustomEvent("orvex:pnl-updated"));
  } catch {
    /* noop */
  }
}

export type RangeKey = "24h" | "7d" | "30d" | "all";

export const RANGE_MS: Record<RangeKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: Number.POSITIVE_INFINITY,
};

export function sliceRange(points: PnlPoint[], range: RangeKey): PnlPoint[] {
  if (range === "all") return points;
  const cutoff = Date.now() - RANGE_MS[range];
  const inRange = points.filter((p) => p.t >= cutoff);
  return inRange.length >= 2 ? inRange : points.slice(-2);
}

export type PnlSummary = {
  points: number;
  first: number;
  last: number;
  absChange: number;
  pctChange: number;
  high: number;
  low: number;
  since: number | null;
  best: { symbol: string; pct: number } | null;
  worst: { symbol: string; pct: number } | null;
};

export function summarize(points: PnlPoint[]): PnlSummary | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const totals = points.map((p) => p.total);
  const absChange = last.total - first.total;
  const pctChange = first.total > 0 ? (absChange / first.total) * 100 : 0;

  const firstMap = new Map(first.holdings.map((h) => [h.symbol, h.value]));
  const deltas: { symbol: string; pct: number }[] = [];
  for (const h of last.holdings) {
    const before = firstMap.get(h.symbol);
    if (before === undefined || before <= 0) continue;
    deltas.push({ symbol: h.symbol, pct: ((h.value - before) / before) * 100 });
  }
  deltas.sort((a, b) => b.pct - a.pct);

  return {
    points: points.length,
    first: first.total,
    last: last.total,
    absChange,
    pctChange,
    high: Math.max(...totals),
    low: Math.min(...totals),
    since: first.t,
    best: deltas[0] ?? null,
    worst: deltas.length > 1 ? deltas[deltas.length - 1] : null,
  };
}
