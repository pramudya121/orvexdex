import { useEffect, useState, useCallback } from "react";
import { isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { TOKENS, type Token } from "@/lib/tokens";

const KEY = "orvex.customTokens.v1";
const FALLBACK_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%237A5CFF'/><stop offset='1' stop-color='%2300E5FF'/></linearGradient></defs><circle cx='32' cy='32' r='32' fill='url(%23g)'/><text x='32' y='40' font-family='Inter,system-ui,sans-serif' font-size='22' font-weight='700' text-anchor='middle' fill='white'>?</text></svg>`,
  );

function read(): Token[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const arr = JSON.parse(raw) as Token[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: Token[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* noop */ }
}

export function useCustomTokens() {
  const [list, setList] = useState<Token[]>([]);
  useEffect(() => { setList(read()); }, []);

  const add = useCallback((t: Token) => {
    setList((prev) => {
      if (prev.some((x) => x.address.toLowerCase() === t.address.toLowerCase())) return prev;
      const next = [...prev, t];
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((addr: string) => {
    setList((prev) => {
      const next = prev.filter((x) => x.address.toLowerCase() !== addr.toLowerCase());
      write(next);
      return next;
    });
  }, []);

  return { list, add, remove };
}

export function useAllTokens(): Token[] {
  const { list } = useCustomTokens();
  // Merge, avoiding dupes with built-ins
  const known = new Set(TOKENS.map((t) => t.address.toLowerCase()));
  return [...TOKENS, ...list.filter((t) => !known.has(t.address.toLowerCase()))];
}

/** Fetches name/symbol/decimals for an arbitrary ERC20 address. */
export function useImportToken(addr?: string) {
  const valid = !!addr && isAddress(addr);
  const known = valid && TOKENS.some((t) => t.address.toLowerCase() === addr!.toLowerCase());
  const a = valid && !known ? (addr as `0x${string}`) : undefined;
  const r = useReadContracts({
    contracts: a
      ? [
          { address: a, abi: erc20Abi, functionName: "name" as const },
          { address: a, abi: erc20Abi, functionName: "symbol" as const },
          { address: a, abi: erc20Abi, functionName: "decimals" as const },
        ]
      : [],
    query: { enabled: !!a },
  });

  const ok = r.data && r.data.every((x) => x.status === "success");
  const token: Token | undefined = ok && a
    ? {
        address: a,
        name: r.data![0].result as string,
        symbol: r.data![1].result as string,
        decimals: Number(r.data![2].result as number),
        logo: FALLBACK_LOGO,
      }
    : undefined;

  return { valid, known, isLoading: r.isLoading, token };
}

export const CUSTOM_FALLBACK_LOGO = FALLBACK_LOGO;