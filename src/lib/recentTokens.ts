import { useCallback, useSyncExternalStore } from "react";
import { isAddress } from "viem";

const KEY = "orvex.recentTokens.v1";
const MAX = 6;

let state: string[] = load();
const listeners = new Set<() => void>();

function load(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 16_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const addresses = parsed
      .filter((value): value is string => typeof value === "string" && isAddress(value))
      .map((address) => address.toLowerCase());
    return [...new Set(addresses)].slice(0, MAX);
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

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function pushRecentToken(address: string) {
  if (!isAddress(address)) return;
  const a = address.toLowerCase();
  state = [a, ...state.filter((x) => x !== a)].slice(0, MAX);
  persist();
}

export function useRecentTokens(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function usePushRecentToken() {
  return useCallback((addr: string) => pushRecentToken(addr), []);
}
