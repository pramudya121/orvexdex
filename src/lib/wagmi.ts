import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { litvm } from "./chain";

// Multi-injected connector that detects all installed EIP-1193 wallets:
// MetaMask, OKX, Rabby, Bitget, etc. Each appears as a separate option.
export const wagmiConfig = createConfig({
  chains: [litvm],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [litvm.id]: http(litvm.rpcUrls.default.http[0]),
  },
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
