import { useEffect, useState, useCallback } from "react";
import { isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { TOKENS, type Token } from "@/lib/tokens";

const KEY = "orvex.customTokens.v1";
const MAX_CUSTOM_TOKENS = 100;
const FALLBACK_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%237A5CFF'/><stop offset='1' stop-color='%2300E5FF'/></linearGradient></defs><circle cx='32' cy='32' r='32' fill='url(%23g)'/><text x='32' y='40' font-family='Inter,system-ui,sans-serif' font-size='22' font-weight='700' text-anchor='middle' fill='white'>?</text></svg>`,
  );

function isValidCustomToken(value: unknown): value is Token {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const token = value as Record<string, unknown>;
  const isSafeLogo =
    typeof token.logo === "string" &&
    token.logo.length <= 2048 &&
    (token.logo.startsWith("https://") ||
      /^data:image\/(?:svg\+xml|png|jpe?g|webp);/i.test(token.logo));

  return (
    typeof token.address === "string" &&
    isAddress(token.address) &&
    typeof token.name === "string" &&
    token.name.trim().length > 0 &&
    token.name.length <= 64 &&
    typeof token.symbol === "string" &&
    token.symbol.trim().length > 0 &&
    token.symbol.length <= 32 &&
    typeof token.decimals === "number" &&
    Number.isInteger(token.decimals) &&
    token.decimals >= 0 &&
    token.decimals <= 255 &&
    token.isNative === undefined &&
    token.isWrapped === undefined &&
    token.faucetIndex === undefined &&
    isSafeLogo
  );
}

function read(): Token[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (!raw || raw.length > 64_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((value): value is Token => {
        if (!isValidCustomToken(value)) return false;
        const address = value.address.toLowerCase();
        if (seen.has(address)) return false;
        seen.add(address);
        return true;
      })
      .slice(0, MAX_CUSTOM_TOKENS);
  } catch {
    return [];
  }
}

function write(list: Token[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CUSTOM_TOKENS)));
  } catch {
    /* noop */
  }
}

export function useCustomTokens() {
  const [list, setList] = useState<Token[]>([]);
  useEffect(() => {
    setList(read());
  }, []);

  const add = useCallback((t: Token) => {
    if (!isValidCustomToken(t)) return;
    setList((prev) => {
      if (prev.length >= MAX_CUSTOM_TOKENS) return prev;
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

  const rows = r.data as Array<{ status: string; result?: unknown }> | undefined;
  const ok = !!rows && rows.every((x) => x.status === "success");
  const name = rows?.[0]?.result;
  const symbol = rows?.[1]?.result;
  const decimals = rows?.[2]?.result;
  const token: Token | undefined =
    ok &&
    a &&
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.length <= 64 &&
    typeof symbol === "string" &&
    symbol.trim().length > 0 &&
    symbol.length <= 32 &&
    typeof decimals === "number" &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 255
      ? { address: a, name, symbol, decimals, logo: FALLBACK_LOGO }
      : undefined;

  return { valid, known, isLoading: r.isLoading, token };
}

export const CUSTOM_FALLBACK_LOGO = FALLBACK_LOGO;
