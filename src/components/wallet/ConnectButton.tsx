import { useEffect, useMemo, useRef, useState } from "react";
import { useConnect, useAccount, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { litvm } from "@/lib/chain";
import { useEip6963Providers, type Eip6963Detail } from "@/lib/eip6963";

const ACTIVE_RDNS_KEY = "orvex.activeWalletRdns";

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
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const detected = useEip6963Providers();

  // Build merged list: detected providers first, then suggestions for non-detected popular wallets.
  const detectedRdns = new Set(detected.map((d) => d.info.rdns.toLowerCase()));
  const installables = SUGGESTIONS.filter((s) => !detectedRdns.has(s.rdns.toLowerCase()));

  const q = query.trim().toLowerCase();
  const filteredDetected = q
    ? detected.filter((d) => d.info.name.toLowerCase().includes(q) || d.info.rdns.toLowerCase().includes(q))
    : detected;
  const filteredInstallables = q
    ? installables.filter((s) => s.name.toLowerCase().includes(q) || s.rdns.toLowerCase().includes(q))
    : installables;

  // Flat keyboard-navigable list: [...detected, ...installables]
  type Row =
    | { kind: "detected"; detail: Eip6963Detail }
    | { kind: "install"; suggestion: WalletSuggestion };
  const rows: Row[] = useMemo(() => [
    ...filteredDetected.map((d) => ({ kind: "detected" as const, detail: d })),
    ...filteredInstallables.map((s) => ({ kind: "install" as const, suggestion: s })),
  ], [filteredDetected, filteredInstallables]);

  useEffect(() => { setCursor(0); }, [query, detected.length]);

  const handleConnect = async (d: Eip6963Detail) => {
    setErr(null);
    setBusy(d.info.uuid);
    try {
      const injectedConn = connectors.find((c) => c.type === "injected" || c.id === "injected");
      if (!injectedConn) throw new Error("No injected connector available");
      (injectedConn as any).getProvider = async () => d.provider;
      await connectAsync({ connector: injectedConn });
      try { localStorage.setItem(ACTIVE_RDNS_KEY, d.info.rdns); } catch { /* noop */ }
      onClose();
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || "Failed to connect");
    } finally {
      setBusy(null);
    }
  };

  // Global key handling: Escape to close, ↑/↓ to move cursor, Enter to activate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (rows.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % rows.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + rows.length) % rows.length);
      } else if (e.key === "Enter") {
        const r = rows[cursor];
        if (!r) return;
        e.preventDefault();
        if (r.kind === "detected") handleConnect(r.detail);
        else window.open(r.suggestion.installUrl, "_blank", "noopener");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows, cursor]);

  // Scroll active row into view when cursor moves.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
    >
      <div
        className="glass-strong rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-neon border-gold animate-scale-in max-h-[90vh] overflow-y-auto"
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
        <p className="text-xs text-muted-foreground mb-4">
          LitVM LiteForge Testnet · Chain ID 4441
        </p>

        {(detected.length + installables.length) > 3 && (
          <div className="mb-4 flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2 border border-border focus-within:border-primary/60 transition">
            <span className="text-muted-foreground text-sm">⌕</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search wallets…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-xs text-muted-foreground hover:text-foreground">clear</button>
            )}
          </div>
        )}

        <div ref={listRef}>
        {detected.length > 0 ? (
          <>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2 px-1 flex items-center justify-between">
              <span>Installed</span>
              <span className="text-muted-foreground/60 normal-case tracking-normal">{filteredDetected.length} of {detected.length}</span>
            </div>
            <div className="space-y-2 mb-5">
              {filteredDetected.length === 0 && (
                <div className="text-xs text-muted-foreground p-3 rounded-xl bg-surface-2/50 text-center">No installed wallet matches “{query}”.</div>
              )}
              {filteredDetected.map((d, i) => {
                const idx = i;
                const active = cursor === idx;
                return (
                <button
                  key={d.info.uuid}
                  data-row-index={idx}
                  onClick={() => handleConnect(d)}
                  onMouseEnter={() => setCursor(idx)}
                  disabled={busy !== null}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition disabled:opacity-50 animate-fade-in ${
                    active ? "border-primary/60 bg-surface-2 shadow-cyan" : "border-border hover:border-primary/60 hover:bg-surface-2"
                  }`}
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
              );})}
            </div>
          </>
        ) : (
          <div className="mb-5 p-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 text-xs text-amber-200">
            No wallet detected in this browser. Install one of the wallets below to continue.
          </div>
        )}

        {filteredInstallables.length > 0 && (
          <>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2 px-1">
              {detected.length > 0 ? "Other wallets" : "Get a wallet"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {filteredInstallables.map((s, i) => {
                const idx = filteredDetected.length + i;
                const active = cursor === idx;
                return (
                <a
                  key={s.rdns}
                  data-row-index={idx}
                  href={s.installUrl}
                  target="_blank"
                  rel="noreferrer"
                  onMouseEnter={() => setCursor(idx)}
                  className={`flex items-center gap-2 p-3 rounded-2xl border transition animate-fade-in ${
                    active ? "border-primary/60 bg-surface-2" : "border-border hover:border-primary/40 hover:bg-surface-2"
                  }`}
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
              );})}
            </div>
          </>
        )}
        </div>

        {err && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive animate-fade-in">
            {err}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between text-[10px] text-muted-foreground gap-2">
          <span className="hidden sm:inline">Use <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border">↓</kbd> <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border">↵</kbd> · <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border">Esc</kbd> to close</span>
          <span className="text-center sm:text-right flex-1">Non-custodial — your keys, your assets.</span>
        </div>
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
  const detected = useEip6963Providers();
  const wrong = isConnected && chainId !== litvm.id;

  // Identify the active EIP-6963 provider so the header logo matches the truly connected wallet.
  const activeWallet = useMemo<Eip6963Detail | null>(() => {
    if (!isConnected || typeof window === "undefined") return null;
    let storedRdns: string | null = null;
    try { storedRdns = localStorage.getItem(ACTIVE_RDNS_KEY); } catch { /* noop */ }
    if (storedRdns) {
      const byRdns = detected.find((d) => d.info.rdns.toLowerCase() === storedRdns!.toLowerCase());
      if (byRdns) return byRdns;
    }
    const eth: any = (window as any).ethereum;
    const byProvider = detected.find((d) =>
      d.provider === eth ||
      d.provider?.selectedAddress?.toLowerCase?.() === address?.toLowerCase?.(),
    );
    return byProvider ?? detected[0] ?? null;
  }, [detected, address, isConnected]);

  useEffect(() => {
    if (wrong) {
      try { switchChain({ chainId: litvm.id }); } catch { /* noop */ }
    }
  }, [wrong, switchChain]);

  const handleDisconnect = () => {
    try { localStorage.removeItem(ACTIVE_RDNS_KEY); } catch { /* noop */ }
    disconnect();
  };

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
        onClick={handleDisconnect}
        title={activeWallet ? `Disconnect ${activeWallet.info.name}` : "Disconnect"}
        className="flex items-center gap-2 px-3 py-2 rounded-xl glass text-sm font-mono hover:border-primary/60 transition"
      >
        {activeWallet?.info.icon && (
          <img
            src={activeWallet.info.icon}
            alt={activeWallet.info.name}
            className="h-5 w-5 rounded"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </button>
    </div>
  );
}
