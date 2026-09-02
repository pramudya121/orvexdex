import { useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { litvm } from "@/lib/chain";

/**
 * Automatically prompts the user to switch to the LitVM LiteForge network
 * whenever they are connected but on a different chain.
 * Renders nothing — it is a side-effect-only component.
 */
export function AutoNetworkSwitch() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isConnected || chainId === litvm.id) {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    switchChainAsync({ chainId: litvm.id }).catch(() => {
      // user rejected or chain not added — allow retry on next change
      attemptedRef.current = false;
    });
  }, [isConnected, chainId, switchChainAsync]);

  return null;
}
