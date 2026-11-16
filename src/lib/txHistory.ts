import { useSyncExternalStore } from "react";
import { isAddress } from "viem";

export type TxStatus = "pending" | "success" | "failed";
export type TxRecord = {
  hash: string;
  title: string;
  account: string;
  ts: number;
  status: TxStatus;
};

const KEY = "orvex.txhistory.v1";
const MAX = 50;

let state: TxRecord[] = load();
const listeners = new Set<() => void>();
const TX_HASH_PATTERN = /^0x[a-f\d]{64}$/i;

function isTxRecord(value: unknown): value is TxRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.hash === "string" &&
    TX_HASH_PATTERN.test(record.hash) &&
    typeof record.title === "string" &&
    record.title.trim().length > 0 &&
    record.title.length <= 120 &&
    typeof record.account === "string" &&
    isAddress(record.account) &&
    typeof record.ts === "number" &&
    Number.isFinite(record.ts) &&
    record.ts > 0 &&
    (record.status === "pending" || record.status === "success" || record.status === "failed")
  );
}

function load(): TxRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 64_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((item): item is TxRecord => {
        if (!isTxRecord(item)) return false;
        const hash = item.hash.toLowerCase();
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
      })
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.slice(0, MAX)));
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l());
}

export function addTx(rec: { hash: string; title: string; account: string }) {
  if (
    !TX_HASH_PATTERN.test(rec.hash) ||
    !rec.title.trim() ||
    rec.title.length > 120 ||
    !isAddress(rec.account)
  )
    return;
  state = [
    { ...rec, ts: Date.now(), status: "pending" as TxStatus },
    ...state.filter((x) => x.hash.toLowerCase() !== rec.hash.toLowerCase()),
  ].slice(0, MAX);
  persist();
}

export function setTxStatus(hash: string, status: TxStatus) {
  let changed = false;
  state = state.map((x) => {
    if (x.hash.toLowerCase() === hash.toLowerCase() && x.status !== status) {
      changed = true;
      return { ...x, status };
    }
    return x;
  });
  if (changed) persist();
}

export function clearTxHistory(account?: string) {
  state = account ? state.filter((x) => x.account.toLowerCase() !== account.toLowerCase()) : [];
  persist();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTxHistory(account?: string): TxRecord[] {
  const all = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  if (!account) return [];
  const a = account.toLowerCase();
  return all.filter((x) => x.account.toLowerCase() === a);
}
