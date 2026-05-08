import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { ADDR } from "@/lib/chain";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { routerAbi } from "@/lib/abis/router";

export const MAX_UINT256 = (2n ** 256n - 1n) as bigint;

export function useTokenBalance(token: `0x${string}` | undefined, owner?: `0x${string}`) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: !!token && !!owner, refetchInterval: 8000 },
  });
}

export function useAllowance(token: `0x${string}` | undefined, owner?: `0x${string}`, spender: `0x${string}` = ADDR.router) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    query: { enabled: !!token && !!owner, refetchInterval: 6000 },
  });
}

export function useGetPair(a?: `0x${string}`, b?: `0x${string}`) {
  return useReadContract({
    address: ADDR.factory,
    abi: factoryAbi,
    functionName: "getPair",
    args: a && b ? [a, b] : undefined,
    query: { enabled: !!a && !!b },
  });
}

export function usePairReserves(pair?: `0x${string}`) {
  return useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: pairAbi, functionName: "getReserves" },
          { address: pair, abi: pairAbi, functionName: "token0" },
          { address: pair, abi: pairAbi, functionName: "token1" },
        ]
      : [],
    query: { enabled: !!pair, refetchInterval: 8000 },
  });
}

export function useAmountsOut(amountIn: bigint, path?: `0x${string}`[]) {
  return useReadContract({
    address: ADDR.router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: amountIn > 0n && path && path.length >= 2 ? [amountIn, path] : undefined,
    query: { enabled: amountIn > 0n && !!path && path.length >= 2 },
  });
}

export function useQuote(amountA: bigint, reserveA?: bigint, reserveB?: bigint) {
  return useReadContract({
    address: ADDR.router,
    abi: routerAbi,
    functionName: "quote",
    args: amountA > 0n && reserveA && reserveB && reserveA > 0n ? [amountA, reserveA, reserveB] : undefined,
    query: { enabled: amountA > 0n && !!reserveA && !!reserveB && reserveA > 0n },
  });
}
