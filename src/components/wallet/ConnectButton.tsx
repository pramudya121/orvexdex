import { useEffect, useMemo, useRef, useState } from "react";
import { useConnect, useAccount, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { litvm } from "@/lib/chain";
import { useEip6963Providers, type Eip6963Detail } from "@/lib/eip6963";
import logo from "@/assets/orvex-logo.png";

const ACTIVE_RDNS_KEY = "orvex.activeWalletRdns";

type WalletSuggestion = { name: string; rdns: string; icon: string; installUrl: string; tag?: "Latest" | "Popular" };
const SUGGESTIONS: WalletSuggestion[] = [
  { name: "MetaMask", rdns: "io.metamask", icon: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg", installUrl: "https://metamask.io/download/", tag: "Popular" },
  { name: "OKX Wallet", rdns: "com.okex.wallet", icon: "https://www.okx.com/cdn/assets/imgs/221/65DD4F3FA68419D2.png", installUrl: "https://www.okx.com/web3" },
  { name: "Rabby Wallet", rdns: "io.rabby", icon: "https://rabby.io/assets/images/logo-128.png", installUrl: "https://rabby.io/", tag: "Latest" },
  { name: "Bitget Wallet", rdns: "com.bitget.web3", icon: "https://web3.bitget.com/favicon.ico", installUrl: "https://web3.bitget.com/" },
  { name: "Coinbase Wallet", rdns: "com.coinbase.wallet", icon: "https://avatars.githubusercontent.com/u/18060234?s=200&v=4", installUrl: "https://www.coinbase.com/wallet" },
];

type Row =
  | { kind: "detected"; detail: Eip6963Detail }
  | { kind: "install"; suggestion: WalletSuggestion };

function useWalletList() {
  const detected = useEip6963Providers();
  const detectedRdns = new Set(detected.map((d) => d.info.rdns.toLowerCase()));
  const installables = SUGGESTIONS.filter((s) => !detectedRdns.has(s.rdns.toLowerCase()));
  return { detected, installables };
}

/* ------------------------ Shared panel UI (matches the reference dropdown) ------------------------ */

function WalletPanel({ onClose, onConnected }: { onClose: () => void; onConnected?: () => void }) {
  const { connectAsync, connectors } = useConnect();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { detected, installables } = useWalletList();

  const q = query.trim().toLowerCase();
  const fDetected = q ? detected.filter((d) => d.info.name.toLowerCase().includes(q)) : detected;
  const fInstall = q ? installables.filter((s) => s.name.toLowerCase().includes(q)) : installables;

  const rows: Row[] = useMemo(() => [
    ...fDetected.map((d) => ({ kind: "detected" as const, detail: d })),
    ...fInstall.map((s) => ({ kind: "install" as const, suggestion: s })),
  ], [fDetected, fInstall]);

  useEffect(() => { setCursor(0); }, [query, detected.length]);

  const handleConnect = async (d: Eip6963Detail) => {
    setErr(null); setBusy(d.info.uuid);
    try {
      const injectedConn = connectors.find((c) => c.type === "injected" || c.id === "injected");
      if (!injectedConn) throw new Error("No injected connector available");
      (injectedConn as any).getProvider = async () => d.provider;
      await connectAsync({ connector: injectedConn });
      try { localStorage.setItem(ACTIVE_RDNS_KEY, d.info.rdns); } catch { /* noop */ }
      onConnected?.(); onClose();
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || "Failed to connect");
    } finally { setBusy(null); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (rows.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % rows.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + rows.length) % rows.length); }
      else if (e.key === "Enter") {
        const r = rows[cursor]; if (!r) return;
        e.preventDefault();
        if (r.kind === "detected") handleConnect(r.detail);
        else window.open(r.suggestion.installUrl, "_blank", "noopener");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cursor]);

  // Featured top — first detected wallet (if any), else first suggestion. Plus a WalletConnect-style mobile QR card placeholder.
  const featured = fDetected[0] ?? null;

  return (
    <div
      className="rounded-3xl overflow-hidden shadow-elegant border border-[oklch(0.65_0.27_295/0.35)] bg-[oklch(0.09_0.03_280/0.96)] backdrop-blur-2xl animate-scale-in"
      style={{ boxShadow: "0 24px 60px -16px rgba(0,0,0,0.7), 0 0 0 1px oklch(0.65 0.27 295 / 0.18), inset 0 1px 0 oklch(1 0 0 / 0.04)" }}
      role="dialog" aria-modal="true" aria-label="Connect a wallet"
    >
      {/* Header */}
      <div className="relative px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="ORVEX" className="h-6 w-6" />
            <h3 className="text-[15px] font-semibold tracking-tight">Hubungkan dompet</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="h-7 w-7 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition flex items-center justify-center text-[13px]"
          >✕</button>
        </div>
      </div>

      {/* Featured cards */}
      <div className="px-4 space-y-2.5">
        {featured ? (
          <FeaturedCard
            tone="violet"
            icon={featured.info.icon}
            title={`Lanjutkan dengan ${featured.info.name}`}
            subtitle="Wallet terdeteksi di browser Anda"
            badge="DETECTED"
            onClick={() => handleConnect(featured)}
            busy={busy === featured.info.uuid}
          />
        ) : (
          <FeaturedCard
            tone="violet"
            icon={logo}
            title="Buat ORVEX Smart Wallet"
            subtitle="Tersedia di iOS, Android, dan Chrome"
            href="https://metamask.io/download/"
          />
        )}
        <FeaturedCard
          tone="dark"
          icon={logo}
          title="ORVEX Mobile"
          subtitle="Pindai kode QR untuk terhubung"
          comingSoon
        />
      </div>

      {/* Section divider with search toggle */}
      <div className="px-5 mt-5 mb-2 flex items-center gap-2">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dompet lainnya</span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      {detected.length + installables.length > 4 && (
        <div className="px-4 mb-2">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-1.5 border border-white/5 focus-within:border-primary/50 transition">
            <span className="text-muted-foreground text-xs">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari dompet…"
              className="flex-1 bg-transparent outline-none text-sm py-1"
            />
            {query && <button onClick={() => setQuery("")} className="text-[10px] text-muted-foreground hover:text-foreground">clear</button>}
          </div>
        </div>
      )}

      {/* Wallet list */}
      <div ref={listRef} className="px-3 pb-2 max-h-[340px] overflow-y-auto custom-scroll">
        {rows.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">Tidak ada wallet yang cocok.</div>
        )}
        {rows.map((row, idx) => {
          const active = cursor === idx;
          if (row.kind === "detected") {
            const d = row.detail;
            return (
              <button
                key={d.info.uuid}
                data-row-index={idx}
                onClick={() => handleConnect(d)}
                onMouseEnter={() => setCursor(idx)}
                disabled={busy !== null}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition disabled:opacity-50 ${
                  active ? "bg-white/[0.07]" : "hover:bg-white/[0.05]"
                }`}
              >
                <img src={d.info.icon} alt="" className="h-9 w-9 rounded-lg bg-white/5 object-contain p-0.5"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-semibold truncate">{d.info.name}</div>
                  {busy === d.info.uuid && <div className="text-[10px] text-muted-foreground">Menunggu konfirmasi…</div>}
                </div>
                <span className="text-[10px] font-semibold tracking-wider text-[oklch(0.78_0.18_220)]">Terdeteksi</span>
              </button>
            );
          }
          const s = row.suggestion;
          return (
            <a
              key={s.rdns}
              data-row-index={idx}
              href={s.installUrl}
              target="_blank"
              rel="noreferrer"
              onMouseEnter={() => setCursor(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                active ? "bg-white/[0.07]" : "hover:bg-white/[0.05]"
              }`}
            >
              <img src={s.icon} alt="" className="h-9 w-9 rounded-lg bg-white/5 object-contain p-0.5"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-semibold truncate">{s.name}</div>
              </div>
              {s.tag && (
                <span className={`text-[10px] font-semibold tracking-wider ${s.tag === "Latest" ? "text-[oklch(0.85_0.2_330)]" : "text-muted-foreground"}`}>
                  {s.tag === "Latest" ? "Terkini" : "Populer"}
                </span>
              )}
            </a>
          );
        })}
      </div>

      {err && (
        <div className="mx-4 mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-[11px] text-destructive animate-fade-in">
          {err}
        </div>
      )}

      <div className="px-5 py-3 border-t border-white/5 text-[10.5px] leading-relaxed text-muted-foreground/80 text-center">
        Dengan menghubungkan dompet, Anda menyetujui <span className="text-foreground/80">Ketentuan Layanan ORVEX</span> dan menyetujui <span className="text-foreground/80">Kebijakan Privasi</span>.
      </div>
    </div>
  );
}

function FeaturedCard({
  tone, icon, title, subtitle, badge, onClick, href, busy, comingSoon,
}: {
  tone: "violet" | "dark";
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  onClick?: () => void;
  href?: string;
  busy?: boolean;
  comingSoon?: boolean;
}) {
  const baseCls = `relative w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition group overflow-hidden ${
    tone === "violet"
      ? "bg-[linear-gradient(120deg,oklch(0.55_0.28_330)_0%,oklch(0.55_0.28_300)_55%,oklch(0.6_0.27_280)_100%)] hover:brightness-110 shadow-[0_10px_30px_-12px_oklch(0.55_0.28_320/0.6)]"
      : "bg-white/[0.04] hover:bg-white/[0.07] border border-white/5"
  }`;
  const inner = (
    <>
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${tone === "violet" ? "bg-white/15" : "bg-white/5"}`}>
        <img src={icon} alt="" className="h-7 w-7 object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate">{title}</div>
        <div className={`text-[11px] truncate ${tone === "violet" ? "text-white/85" : "text-muted-foreground"}`}>
          {busy ? "Menunggu konfirmasi…" : subtitle}
        </div>
      </div>
      {badge && (
        <span className="text-[9px] font-bold tracking-[0.2em] px-2 py-1 rounded-full bg-white/15 text-white">{badge}</span>
      )}
      {comingSoon && (
        <span className="text-[9px] font-bold tracking-[0.2em] px-2 py-1 rounded-full bg-white/5 text-muted-foreground border border-white/5">SOON</span>
      )}
      <span className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition" style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)" }} />
    </>
  );
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={baseCls}>{inner}</a>;
  return <button type="button" onClick={onClick} disabled={busy || comingSoon} className={baseCls + " disabled:opacity-70 disabled:cursor-default"}>{inner}</button>;
}

/* ------------------------ Anchored dropdown (header) ------------------------ */

function WalletDropdown({ open, onClose, anchorRef }: { open: boolean; onClose: () => void; anchorRef: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-[360px] z-50 animate-fade-in">
      <WalletPanel onClose={onClose} />
    </div>
  );
}

/* ------------------------ Centered modal (used on landing) ------------------------ */

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="w-full sm:max-w-[380px]" onClick={(e) => e.stopPropagation()}>
        <WalletPanel onClose={onClose} />
      </div>
    </div>
  );
}

/* ------------------------ Connect button (header) ------------------------ */

export function ConnectButton() {
  const [open, setOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectAsync, connectors } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const detected = useEip6963Providers();
  const wrong = isConnected && chainId !== litvm.id;
  const [switching, setSwitching] = useState<string | null>(null);

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

  useEffect(() => {
    if (!switcherOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (switcherRef.current?.contains(t)) return;
      if (accountRef.current?.contains(t)) return;
      setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [switcherOpen]);

  const handleDisconnect = () => {
    try { localStorage.removeItem(ACTIVE_RDNS_KEY); } catch { /* noop */ }
    disconnect();
    setSwitcherOpen(false);
  };

  const handleSwitchWallet = async (d: Eip6963Detail) => {
    if (activeWallet && d.info.uuid === activeWallet.info.uuid) {
      setSwitcherOpen(false);
      return;
    }
    setSwitching(d.info.uuid);
    try {
      // Disconnect current first to avoid stale session
      try { disconnect(); } catch { /* noop */ }
      const injectedConn = connectors.find((c) => c.type === "injected" || c.id === "injected");
      if (!injectedConn) throw new Error("No injected connector");
      (injectedConn as any).getProvider = async () => d.provider;
      await connectAsync({ connector: injectedConn });
      try { localStorage.setItem(ACTIVE_RDNS_KEY, d.info.rdns); } catch { /* noop */ }
      setSwitcherOpen(false);
    } catch {
      /* user rejected or wallet locked */
    } finally {
      setSwitching(null);
    }
  };

  if (!isConnected) {
    return (
      <div ref={containerRef} className="relative">
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="px-4 py-2 rounded-full bg-gradient-to-r from-[oklch(0.65_0.28_320)] to-[oklch(0.65_0.27_295)] text-white font-semibold shadow-neon hover:brightness-110 transition"
        >
          Hubungkan
        </button>
        <WalletDropdown open={open} onClose={() => setOpen(false)} anchorRef={btnRef} />
      </div>
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
      <div className="relative">
        <button
          ref={accountRef}
          onClick={() => setSwitcherOpen((v) => !v)}
          title={activeWallet ? `${activeWallet.info.name} · switch or disconnect` : "Wallet menu"}
          className="flex items-center gap-2 px-3 py-2 rounded-full glass text-sm font-mono hover:border-primary/60 transition"
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
          <span className="text-[10px] text-muted-foreground">▾</span>
        </button>
        {switcherOpen && (
          <div
            ref={switcherRef}
            className="absolute right-0 top-full mt-2 w-[280px] z-50 rounded-2xl overflow-hidden border border-[oklch(0.65_0.27_295/0.35)] bg-[oklch(0.09_0.03_280/0.96)] backdrop-blur-2xl shadow-elegant animate-fade-in"
          >
            <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Switch wallet
            </div>
            <div className="px-2 pb-2 max-h-[260px] overflow-y-auto custom-scroll">
              {detected.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Tidak ada wallet terdeteksi
                </div>
              )}
              {detected.map((d) => {
                const isActive = activeWallet?.info.uuid === d.info.uuid;
                return (
                  <button
                    key={d.info.uuid}
                    onClick={() => handleSwitchWallet(d)}
                    disabled={switching !== null}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition disabled:opacity-50 ${
                      isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <img
                      src={d.info.icon}
                      alt=""
                      className="h-8 w-8 rounded-lg bg-white/5 object-contain p-0.5"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-semibold truncate">{d.info.name}</div>
                      {isActive && <div className="text-[10px] text-[oklch(0.78_0.18_220)]">Aktif</div>}
                      {switching === d.info.uuid && <div className="text-[10px] text-muted-foreground">Menunggu konfirmasi…</div>}
                    </div>
                    {isActive && <span className="text-[10px] font-semibold text-emerald-400">●</span>}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-white/5 p-2 flex gap-2">
              <button
                onClick={() => { setSwitcherOpen(false); setOpen(true); }}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 transition"
              >
                + Hubungkan lain
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
        <WalletDropdown open={open} onClose={() => setOpen(false)} anchorRef={accountRef} />
      </div>
    </div>
  );
}
