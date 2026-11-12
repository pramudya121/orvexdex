import { useCallback } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useToast } from "@/components/ui/toaster";
import { litvm } from "@/lib/chain";
import { txErrorMessage } from "@/lib/txError";

export function useEnsureLitVmNetwork() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { push } = useToast();

  return useCallback(async () => {
    if (!address) {
      push({ title: "Connect wallet first", type: "error" });
      return false;
    }

    if (chainId === litvm.id) return true;

    try {
      await switchChainAsync({ chainId: litvm.id });
      push({
        title: "Network switched",
        description: `Review the transaction and submit again on ${litvm.name}.`,
        type: "info",
      });
    } catch (error) {
      const result = txErrorMessage(error);
      push({
        title: result.rejected ? "Network switch cancelled" : "Network switch failed",
        description: result.description,
        type: result.rejected ? "info" : "error",
      });
    }

    return false;
  }, [address, chainId, push, switchChainAsync]);
}
