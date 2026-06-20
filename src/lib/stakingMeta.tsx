import { useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { findToken } from "@/lib/tokens";

const pairAbi = [
  { inputs: [], name: "token0", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "token1", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
] as const;

export type StakingMeta = {
  symbol: string;
  decimals: number;
  isLP: boolean;
  token0?: `0x${string}`;
  token1?: `0x${string}`;
  logo?: string;
  logo0?: string;
  logo1?: string;
  sym0?: string;
  sym1?: string;
};

export function useStakingMeta(addr?: `0x${string}`): StakingMeta | undefined {
  const enabled = !!addr;
  const base = useReadContracts({
    allowFailure: true,
    query: { enabled, staleTime: 60_000 },
    contracts: enabled
      ? [
          { address: addr, abi: erc20Abi, functionName: "symbol" },
          { address: addr, abi: erc20Abi, functionName: "decimals" },
          { address: addr, abi: pairAbi, functionName: "token0" },
          { address: addr, abi: pairAbi, functionName: "token1" },
        ]
      : [],
  });

  if (!enabled || !base.data) return undefined;
  const [sym, dec, t0, t1] = base.data;
  const symbol = (sym?.result as string) || "TOKEN";
  const decimals = Number((dec?.result as number) ?? 18);
  const token0 = (t0?.result as `0x${string}` | undefined);
  const token1 = (t1?.result as `0x${string}` | undefined);
  const isLP = !!token0 && !!token1;
  const known = findToken(addr);
  if (!isLP) {
    return { symbol, decimals, isLP: false, logo: known?.logo };
  }
  const k0 = token0 ? findToken(token0) : undefined;
  const k1 = token1 ? findToken(token1) : undefined;
  return {
    symbol: `${k0?.symbol ?? "?"}-${k1?.symbol ?? "?"} LP`,
    decimals,
    isLP: true,
    token0,
    token1,
    logo0: k0?.logo,
    logo1: k1?.logo,
    sym0: k0?.symbol,
    sym1: k1?.symbol,
  };
}

export function TokenIcons({ meta, size = 32 }: { meta?: StakingMeta; size?: number }) {
  if (!meta) {
    return <div className="rounded-full bg-surface-2 animate-pulse" style={{ width: size, height: size }} />;
  }
  if (meta.isLP) {
    return (
      <div className="relative inline-flex items-center" style={{ width: size * 1.5, height: size }}>
        <img
          src={meta.logo0 || "/icon-512.png"}
          alt={meta.sym0 || ""}
          className="rounded-full border-2 border-background bg-surface-2 absolute left-0"
          style={{ width: size, height: size }}
        />
        <img
          src={meta.logo1 || "/icon-512.png"}
          alt={meta.sym1 || ""}
          className="rounded-full border-2 border-background bg-surface-2 absolute"
          style={{ width: size, height: size, left: size * 0.55 }}
        />
      </div>
    );
  }
  return (
    <img
      src={meta.logo || "/icon-512.png"}
      alt={meta.symbol}
      className="rounded-full border-2 border-background bg-surface-2"
      style={{ width: size, height: size }}
    />
  );
}
