import { useQuery } from "@tanstack/react-query";
import type { Abi } from "viem";
import { formatUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";

type Params = {
  enabled?: boolean;
  address?: `0x${string}`;
  abi?: Abi | readonly unknown[];
  functionName?: string;
  args?: readonly unknown[];
  value?: bigint;
};

export type GasEstimate = {
  gas: bigint;
  gasPrice: bigint;
  costWei: bigint;
  costText: string;
};

/**
 * Estimates gas for a contract write and converts it into a native-token cost.
 * Returns `undefined` while loading or when the call would revert.
 */
export function useGasEstimate({ enabled = true, address, abi, functionName, args, value }: Params) {
  const client = usePublicClient();
  const { address: account } = useAccount();

  const key = [
    "gas-estimate",
    address,
    functionName,
    account,
    value?.toString(),
    args?.map((a) => (typeof a === "bigint" ? a.toString() : String(a))).join("|"),
  ];

  return useQuery<GasEstimate | null>({
    queryKey: key,
    enabled: Boolean(enabled && client && account && address && abi && functionName),
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: false,
    queryFn: async () => {
      if (!client || !account || !address || !abi || !functionName) return null;
      try {
        const [gas, gasPrice] = await Promise.all([
          client.estimateContractGas({
            address,
            abi: abi as Abi,
            functionName,
            args: args as never,
            account,
            ...(value !== undefined ? { value } : {}),
          }),
          client.getGasPrice(),
        ]);
        const costWei = gas * gasPrice;
        return {
          gas,
          gasPrice,
          costWei,
          costText: `${Number(formatUnits(costWei, 18)).toFixed(6)} zkLTC`,
        };
      } catch {
        return null;
      }
    },
  });
}
