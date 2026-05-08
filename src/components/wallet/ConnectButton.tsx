import { useEffect, useState } from "react";
import { useConnect, useAccount, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { litvm } from "@/lib/chain";
import { useEip6963Providers, type Eip6963Detail } from "@/lib/eip6963";

// Fallback metadata for popular wallets the user may not have installed.
// Install links only — actual provider detection uses EIP-6963 (modern standard).
type WalletSuggestion = { name: string; rdns: string; icon: string; installUrl: string };
const SUGGESTIONS: WalletSuggestion[] = [
  { name: "MetaMask", rdns: "io.metamask", icon: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg", installUrl: "https://metamask.io/download/" },
  { name: "OKX Wallet", rdns: "com.okex.wallet", icon: "https://www.okx.com/cdn/assets/imgs/221/65DD4F3FA68419D2.png", installUrl: "https://www.okx.com/web3" },
  { name: "Rabby", rdns: "io.rabby", icon: "https://rabby.io/assets/images/logo-128.png", installUrl: "https://rabby.io/" },
  { name: "Bitget Wallet", rdns: "com.bitget.web3", icon: "https://web3.bitget.com/favicon.ico", installUrl: "https://web3.bitget.com/" },
];

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connectAsync, connectors } = useConnect();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const detected = useEip6963Providers();

  // Build merged list: detected providers first, then suggestions for non-detected popular wallets.
  const detectedRdns = new Set(detected.map((d) => d.info.rdns.toLowerCase()));
  const installables = SUGGESTIONS.filter((s) => !detectedRdns.has(s.rdns.toLowerCase()));

  const handleConnect = async (d: Eip6963Detail) => {
    setErr(null);
    setBusy(d.info.uuid);
    try {
      const injectedConn = connectors.find((c) => c.type === "injected" || c.id === "injected");
      if (!injectedConn) throw new Error("No injected connector available");
      (injectedConn as any).getProvider = async () => d.provider;
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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-neon border-gold animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold">Atelier Access</div>
            <h3 className="text-xl font-bold mt-1">Connect a wallet</h3>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-surface-2 hover:bg-surface text-muted-foreground hover:text-foreground transition flex items-center justify-center"
            aria-label="Close"
          >✕</button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          LitVM LiteForge Testnet · Chain ID 4441
        </p>

        {detected.length > 0 ? (
          <>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2 px-1">Installed</div>
            <div className="space-y-2 mb-5">
              {detected.map((d) => (
                <button
                  key={d.info.uuid}
                  onClick={() => handleConnect(d)}
                  disabled={busy !== null}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border hover:border-primary/60 hover:bg-surface-2 transition disabled:opacity-50"
                >
                  <img
                    src={d.info.icon}
                    alt={d.info.name}
                    className="h-10 w-10 rounded-xl bg-surface-2 object-contain p-0.5"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-semibold truncate">{d.info.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {busy === d.info.uuid ? "Waiting for confirmation…" : d.info.rdns}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">DETECTED</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mb-5 p-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 text-xs text-amber-200">
            No wallet detected in this browser. Install one of the wallets below to continue.
          </div>
        )}

        {installables.length > 0 && (
          <>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2 px-1">
              {detected.length > 0 ? "Other wallets" : "Get a wallet"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {installables.map((s) => (
                <a
                  key={s.rdns}
                  href={s.installUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-3 rounded-2xl border border-border hover:border-primary/40 hover:bg-surface-2 transition"
                >
                  <img
                    src={s.icon}
                    alt={s.name}
                    className="h-7 w-7 rounded-lg object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">Install ↗</div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {err && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive">
            {err}
          </div>
        )}

        <p className="mt-5 text-[10px] text-muted-foreground text-center leading-relaxed">
          By connecting, you accept that ORVEX is non-custodial — your keys, your assets.
        </p>
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
