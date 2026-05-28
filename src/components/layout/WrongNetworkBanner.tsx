import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { litvm } from "@/lib/chain";

export function WrongNetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === litvm.id) return null;
  return (
    <div className="sticky top-16 z-30 bg-destructive/90 text-destructive-foreground backdrop-blur-md border-b border-destructive">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse shrink-0" />
          <span className="truncate">
            Wrong network. ORVEX runs on <strong>{litvm.name}</strong>.
          </span>
        </div>
        <button
          onClick={() => switchChain({ chainId: litvm.id })}
          disabled={isPending}
          className="shrink-0 px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 font-semibold transition disabled:opacity-60"
        >
          {isPending ? "Switching…" : `Switch to ${litvm.nativeCurrency.symbol}`}
        </button>
      </div>
    </div>
  );
}
