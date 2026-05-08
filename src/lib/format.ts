import { formatUnits, parseUnits } from "viem";

export const fmt = (v: bigint | undefined, decimals = 18, max = 6) => {
  if (v === undefined) return "—";
  const s = formatUnits(v, decimals);
  const [i, d = ""] = s.split(".");
  if (!d) return i;
  return `${i}.${d.slice(0, max).replace(/0+$/, "")}`.replace(/\.$/, "");
};

export const safeParse = (v: string, decimals = 18): bigint => {
  if (!v) return 0n;
  try {
    const cleaned = v.replace(/,/g, "").trim();
    if (!/^\d*\.?\d*$/.test(cleaned)) return 0n;
    return parseUnits(cleaned as `${number}`, decimals);
  } catch {
    return 0n;
  }
};

export const deadline = (mins = 20) => BigInt(Math.floor(Date.now() / 1000) + mins * 60);

export const slippageMin = (amount: bigint, bps = 50): bigint =>
  (amount * BigInt(10000 - bps)) / 10000n;

export const slippageMax = (amount: bigint, bps = 50): bigint =>
  (amount * BigInt(10000 + bps)) / 10000n;
