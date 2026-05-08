import { useEffect, useState } from "react";
import { useConnect, useAccount, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { litvm } from "@/lib/chain";

type WalletMeta = {
  id: string;
  name: string;
  logo: string;
  detect: () => any;
  installUrl: string;
};

const WALLETS: WalletMeta[] = [
  {
    id: "metamask",
    name: "MetaMask",
    logo: "https://registry.walletconnect.com/api/v2/logo/lg/c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97e7c3f2",
    detect: () => {
      const eth: any = (globalThis as any).window?.ethereum;
      if (!eth) return null;
      if (eth.providers) return eth.providers.find((p: any) => p.isMetaMask && !p.isOkxWallet && !p.isBitKeep && !p.isRabby);
      return eth.isMetaMask && !eth.isOkxWallet && !eth.isBitKeep && !eth.isRabby ? eth : null;
    },
    installUrl: "https://metamask.io/download/",
  },
  {
    id: "okx",
    name: "OKX Wallet",
    logo: "https://registry.walletconnect.com/api/v2/logo/lg/45f2f08e-fc0c-4d62-3e63-404e72170500",
    detect: () => (globalThis as any).window?.okxwallet ?? null,
    installUrl: "https://www.okx.com/web3",
  },
  {
    id: "rabby",
    name: "Rabby",
    logo: "https://registry.walletconnect.com/api/v2/logo/lg/4d0cf02b-0dee-43d2-2a91-2906f8ac4d00",
    detect: () => {
      const eth: any = (globalThis as any).window?.ethereum;
      if (!eth) return null;
      if (eth.providers) return eth.providers.find((p: any) => p.isRabby);
      return eth.isRabby ? eth : null;
    },
    installUrl: "https://rabby.io/",
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    logo: "https://registry.walletconnect.com/api/v2/logo/lg/0d1a6cc4-9d4c-4f0a-1d76-58ec30d40b00",
    detect: () => (globalThis as any).window?.bitkeep?.ethereum ?? null,
    installUrl: "https://web3.bitget.com/",
  },
];

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connectAsync, connectors } = useConnect();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleConnect = async (w: WalletMeta) => {
    setErr(null);
    const provider = w.detect();
    if (!provider) {
      window.open(w.installUrl, "_blank");
      return;
    }
    setBusy(w.id);
    try {
      // Override the injected provider getter
      const injectedConn = connectors.find((c) => c.type === "injected" || c.id === "injected");
      if (!injectedConn) throw new Error("No injected connector");
      // Force-set the provider via getProvider override is not exposed; use request directly
      (injectedConn as any).getProvider = async () => provider;
      await connectAsync({ connector: injectedConn });
      onClose();
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || "Failed to connect");
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-strong rounded-2xl p-6 w-full max-w-md shadow-neon"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold">Connect wallet</h3>
            <p className="text-xs text-muted-foreground">LitVM LiteForge Testnet</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">✕</button>
        </div>
        <div className="space-y-2">
          {WALLETS.map((w) => {
            const installed = !!w.detect();
            return (
              <button
                key={w.id}
                onClick={() => handleConnect(w)}
                disabled={busy !== null}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/60 hover:bg-surface-2 transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <img src={w.logo} alt={w.name} className="h-10 w-10 rounded-lg" />
                  <div className="text-left">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {busy === w.id ? "Connecting…" : installed ? "Detected" : "Install"}
                    </div>
                  </div>
                </div>
                <span className="text-primary opacity-0 group-hover:opacity-100 transition">→</span>
              </button>
            );
          })}
        </div>
        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}

export function ConnectButton() {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const wrong = isConnected && chainId !== litvm.id;

  useEffect(() => {
    if (wrong) {
      try { switchChain({ chainId: litvm.id }); } catch { /* noop */ }
    }
  }, [wrong, switchChain]);

  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold shadow-neon hover:opacity-95 transition"
        >
          Connect Wallet
        </button>
        <WalletModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {wrong && (
        <button
          onClick={() => switchChain({ chainId: litvm.id })}
          className="px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold"
        >
          Switch to LitVM
        </button>
      )}
      <button
        onClick={() => disconnect()}
        className="px-3 py-2 rounded-xl glass text-sm font-mono hover:border-primary/60 transition"
      >
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </button>
    </div>
  );
}
