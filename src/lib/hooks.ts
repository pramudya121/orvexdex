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

/**
 * Smart router: tries direct path A→B and multi-hop A→WzkLTC→B,
 * returns the path with the best output (AMM optimal route).
 */
export function useBestRoute(amountIn: bigint, tokenIn?: `0x${string}`, tokenOut?: `0x${string}`) {
  const sameAsHop = (t?: `0x${string}`) => t && t.toLowerCase() === ADDR.wzkLTC.toLowerCase();
  const directPath = tokenIn && tokenOut && tokenIn.toLowerCase() !== tokenOut.toLowerCase() ? [tokenIn, tokenOut] : undefined;
  const hopPath = tokenIn && tokenOut && !sameAsHop(tokenIn) && !sameAsHop(tokenOut) && tokenIn.toLowerCase() !== tokenOut.toLowerCase()
    ? [tokenIn, ADDR.wzkLTC, tokenOut] as `0x${string}`[]
    : undefined;

  const results = useReadContracts({
    contracts: [
      directPath && amountIn > 0n
        ? { address: ADDR.router, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, directPath] as const }
        : { address: ADDR.router, abi: routerAbi, functionName: "getAmountsOut", args: [0n, ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"]] as const },
      hopPath && amountIn > 0n
        ? { address: ADDR.router, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, hopPath] as const }
        : { address: ADDR.router, abi: routerAbi, functionName: "getAmountsOut", args: [0n, ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"]] as const },
    ],
    allowFailure: true,
    query: { enabled: amountIn > 0n && !!tokenIn && !!tokenOut, refetchInterval: 8000 },
  });

  const direct = results.data?.[0];
  const hop = results.data?.[1];
  const directOut = direct?.status === "success" ? (direct.result as bigint[]) : undefined;
  const hopOut = hop?.status === "success" ? (hop.result as bigint[]) : undefined;

  const directAmt = directOut && directPath ? directOut[directOut.length - 1] : 0n;
  const hopAmt = hopOut && hopPath ? hopOut[hopOut.length - 1] : 0n;

  let bestPath: `0x${string}`[] | undefined;
  let bestOut = 0n;
  let hops = 0;
  if (directAmt > 0n && directAmt >= hopAmt) {
    bestPath = directPath;
    bestOut = directAmt;
    hops = 1;
  } else if (hopAmt > 0n) {
    bestPath = hopPath;
    bestOut = hopAmt;
    hops = 2;
  }

  return { path: bestPath, amountOut: bestOut, hops, isLoading: results.isLoading, refetch: results.refetch };
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
