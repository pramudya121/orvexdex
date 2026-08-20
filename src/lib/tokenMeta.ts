import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "viem";
import { findToken, type Token } from "@/lib/tokens";

export type TokenMeta = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  logo?: string;
};

const cache = new Map<string, TokenMeta>();

/**
 * Resolve metadata for arbitrary token addresses (any DEX, not just the ORVEX registry).
 * Known tokens come from the static list; unknown ones are read on-chain (symbol/decimals).
 */
export function useTokenMeta(addresses: string[]) {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: `0x${string}`[] = [];
    for (const a of addresses) {
      const l = a?.toLowerCase();
      if (!l || seen.has(l)) continue;
      seen.add(l);
      out.push(a as `0x${string}`);
    }
    return out;
  }, [addresses.join(",")]);

  const unknown = useMemo(
    () => unique.filter((a) => !findToken(a) && !cache.has(a.toLowerCase())),
    [unique],
  );

  const calls = useMemo(
    () =>
      unknown.flatMap((a) => [
        { address: a, abi: erc20Abi, functionName: "symbol" as const },
        { address: a, abi: erc20Abi, functionName: "decimals" as const },
      ]),
    [unknown],
  );

  const q = useReadContracts({ contracts: calls, query: { enabled: calls.length > 0, staleTime: 300_000 } });

  return useMemo(() => {
    const map = new Map<string, TokenMeta>();
    for (const a of unique) {
      const l = a.toLowerCase();
      const known: Token | undefined = findToken(a);
      if (known) {
        map.set(l, { address: a, symbol: known.symbol, decimals: known.decimals, logo: known.logo });
        continue;
      }
      if (cache.has(l)) {
        map.set(l, cache.get(l)!);
        continue;
      }
      const i = unknown.findIndex((u) => u.toLowerCase() === l);
      const sym = i >= 0 ? (q.data?.[i * 2]?.result as string | undefined) : undefined;
      const dec = i >= 0 ? (q.data?.[i * 2 + 1]?.result as number | undefined) : undefined;
      const meta: TokenMeta = {
        address: a,
        symbol: sym || `${a.slice(2, 6).toUpperCase()}`,
        decimals: typeof dec === "number" ? dec : 18,
      };
      if (sym) cache.set(l, meta);
      map.set(l, meta);
    }
    return map;
  }, [unique, unknown, q.data]);
}

/** Deterministic accent color for tokens without a logo. */
export function tokenColor(addr: string) {
  let h = 0;
  for (let i = 2; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) % 360;
  return `oklch(0.65 0.18 ${h})`;
}
