import { useCallback, useSyncExternalStore } from "react";

const KEY = "orvex.recentTokens.v1";
const MAX = 6;

let state: string[] = load();
const listeners = new Set<() => void>();

function load(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as string[]).filter((x) => typeof x === "string") : [];
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
  if (!address) return;
  const a = address.toLowerCase();
  state = [a, ...state.filter((x) => x !== a)].slice(0, MAX);
  persist();
}

export function useRecentTokens(): string[] {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function usePushRecentToken() {
  return useCallback((addr: string) => pushRecentToken(addr), []);
}
