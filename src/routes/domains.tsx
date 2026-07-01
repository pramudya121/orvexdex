import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { keccak256, toBytes, formatEther, namehash } from "viem";
import { ADDR, DOMAIN_TLD, explorerTx } from "@/lib/chain";
import { domainControllerAbi } from "@/lib/abis/domainController";
import { domainRegistrarAbi } from "@/lib/abis/domainRegistrar";
import { domainResolverAbi } from "@/lib/abis/domainResolver";
import { domainRegistryAbi } from "@/lib/abis/domainRegistry";
import { useToast } from "@/components/ui/toaster";
import { notifyDomainUpdated } from "@/lib/primaryDomain";

import { ConnectButton } from "@/components/wallet/ConnectButton";
import {
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  Minus,
  Plus,
  Loader2,
  Globe,
  Star,
  Wallet,
  Clock,
  Shield,
  Crown,
} from "lucide-react";

const getErr = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const m = e as { shortMessage?: string; message?: string };
    return m.shortMessage || m.message;
  }
  return undefined;
};

const ZERO = "0x0000000000000000000000000000000000000000";
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const COMMIT_KEY_PREFIX = "orvex.domain.commit.v1.";
const PRIMARY_KEY = "orvex.domain.primary.v1";

type StoredCommit = {
  name: string;
  secret: `0x${string}`;
  registrant: `0x${string}`;
  duration: number;
  committedAt: number;
  txHash: `0x${string}`;
};

function loadCommit(name: string, addr?: string): StoredCommit | null {
  if (typeof window === "undefined" || !addr) return null;
  try {
    const raw = localStorage.getItem(COMMIT_KEY_PREFIX + addr.toLowerCase() + "." + name.toLowerCase());
    return raw ? (JSON.parse(raw) as StoredCommit) : null;
  } catch {
    return null;
  }
}
function saveCommit(c: StoredCommit) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    COMMIT_KEY_PREFIX + c.registrant.toLowerCase() + "." + c.name.toLowerCase(),
    JSON.stringify(c),
  );
}
function clearCommit(name: string, addr: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COMMIT_KEY_PREFIX + addr.toLowerCase() + "." + name.toLowerCase());
}

function randomSecret(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

export const Route = createFileRoute("/domains")({
  component: DomainsPage,
  head: () => ({
    meta: [
      { title: "Domains — ORVEX Name Service" },
      {
        name: "description",
        content:
          "Mint your on-chain Web3 identity. Search, claim and manage .orvex domains on LitVM.",
      },
      { property: "og:title", content: "ORVEX Name Service" },
      {
        property: "og:description",
        content: "Your Web3 identity on LitVM — search, mint & manage .orvex domains.",
      },
      { property: "og:url", content: "https://orvexdex.lovable.app/domains" },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/domains" }],
  }),
});

function DomainsPage() {
  const { address, isConnected } = useAccount();
  const toast = useToast();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // ─────────────────────── SEARCH STATE ───────────────────────
  const [rawQuery, setRawQuery] = useState("");
  const [checkedName, setCheckedName] = useState<string | null>(null);
  const [years, setYears] = useState(1);

  const sanitize = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
  const name = useMemo(() => sanitize(rawQuery), [rawQuery]);
  const valid = name.length >= 3;

  // ───────────────────── ON-CHAIN READS ─────────────────────
  const minDur = useReadContract({
    address: ADDR.domainController,
    abi: domainControllerAbi,
    functionName: "MIN_REGISTRATION_DURATION",
  });
  const commitDelay = useReadContract({
    address: ADDR.domainController,
    abi: domainControllerAbi,
    functionName: "COMMIT_REVEAL_DELAY",
  });
  const commitExpiry = useReadContract({
    address: ADDR.domainController,
    abi: domainControllerAbi,
    functionName: "COMMIT_REVEAL_EXPIRY",
  });

  // Cek ketersediaan + info domain saat ada nama yang sudah dicek
  // SOURCE: DomainRegistrarController.isAvailable & domainInfo (read)
  const availability = useReadContracts({
    contracts: checkedName
      ? [
          {
            address: ADDR.domainController,
            abi: domainControllerAbi,
            functionName: "isAvailable",
            args: [checkedName],
          },
          {
            address: ADDR.domainController,
            abi: domainControllerAbi,
            functionName: "domainInfo",
            args: [checkedName],
          },
          {
            address: ADDR.domainController,
            abi: domainControllerAbi,
            functionName: "price",
            args: [checkedName, BigInt(years * SECONDS_PER_YEAR)],
          },
        ]
      : [],
    query: { enabled: !!checkedName, refetchInterval: 12000 },
  });

  const isAvailable = availability.data?.[0]?.result as boolean | undefined;
  const domainInfo = availability.data?.[1]?.result as
    | readonly [`0x${string}`, bigint, boolean]
    | undefined;
  const priceWei = availability.data?.[2]?.result as bigint | undefined;

  // ─────────────────── ACTIONS ───────────────────
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [pendingLabel, setPendingLabel] = useState<string>("");
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash });

  useEffect(() => {
    if (receipt.isSuccess && pendingHash) {
      toast.push({ title: `${pendingLabel} confirmed`, type: "success", hash: pendingHash });
      setPendingHash(undefined);
      setPendingLabel("");
      availability.refetch();
      void refreshMyDomains();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  // ============ handleSearch ============
  // Memicu pembacaan on-chain isAvailable + price dari DomainRegistrarController
  const handleSearch = useCallback(() => {
    if (!valid) {
      toast.push({ title: "Nama minimal 3 karakter", type: "error" });
      return;
    }
    setCheckedName(name);
  }, [name, valid, toast]);

  // ============ handleMint (commit + register / commit-reveal) ============
  // Langkah 1: write commit() ke DomainRegistrarController
  // Langkah 2 (setelah COMMIT_REVEAL_DELAY): write register() payable dengan value = price
  const handleCommit = async () => {
    if (!address || !checkedName) return;
    try {
      const secret = randomSecret();
      // pre-compute commitment hash (pure on chain)
      const commitment = (await publicClient!.readContract({
        address: ADDR.domainController,
        abi: domainControllerAbi,
        functionName: "makeCommitment",
        args: [checkedName, address, secret],
      })) as `0x${string}`;

      const h = await writeContractAsync({
        address: ADDR.domainController,
        abi: domainControllerAbi,
        functionName: "commit",
        args: [commitment, checkedName],
      });
      saveCommit({
        name: checkedName,
        secret,
        registrant: address,
        duration: years * SECONDS_PER_YEAR,
        committedAt: Math.floor(Date.now() / 1000),
        txHash: h,
      });
      setPendingHash(h);
      setPendingLabel("Commit");
      toast.push({ title: "Commit dikirim — tunggu jeda lalu Mint", hash: h });
    } catch (e) {
      toast.push({ title: "Commit gagal", description: getErr(e), type: "error" });
    }
  };

  const handleMint = async () => {
    if (!address || !checkedName) return;
    const stored = loadCommit(checkedName, address);
    if (!stored) {
      toast.push({ title: "Belum ada commit", description: "Klik Commit dulu", type: "error" });
      return;
    }
    const delay = Number(commitDelay.data ?? 5n);
    const elapsed = Math.floor(Date.now() / 1000) - stored.committedAt;
    if (elapsed < delay) {
      toast.push({ title: `Tunggu ${delay - elapsed}s lagi sebelum mint`, type: "error" });
      return;
    }
    if (!priceWei) {
      toast.push({ title: "Harga belum tersedia", type: "error" });
      return;
    }
    try {
      const h = await writeContractAsync({
        address: ADDR.domainController,
        abi: domainControllerAbi,
        functionName: "register",
        args: [checkedName, address, BigInt(stored.duration), stored.secret],
        value: priceWei,
      });
      setPendingHash(h);
      setPendingLabel("Mint");
      toast.push({ title: `Minting ${checkedName}.${DOMAIN_TLD}…`, hash: h });
      clearCommit(checkedName, address);
    } catch (e) {
      toast.push({ title: "Mint gagal", description: getErr(e), type: "error" });
    }
  };

  // 1s ticker so countdown updates live without waiting for a re-render trigger.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // ============ handleSetPrimary ============
  // Menulis reverse record di PublicResolver (setReverse) + simpan preferensi lokal
  const handleSetPrimary = async (domainName: string) => {
    if (!address) return;
    try {
      const h = await writeContractAsync({
        address: ADDR.domainResolver,
        abi: domainResolverAbi,
        functionName: "setReverse",
        args: [address, `${domainName}.${DOMAIN_TLD}`],
      });
      localStorage.setItem(PRIMARY_KEY + ":" + address.toLowerCase(), domainName);
      setPrimaryLocal(domainName);
      notifyDomainUpdated();
      setPendingHash(h);
      setPendingLabel("Set primary");
      toast.push({ title: `${domainName}.${DOMAIN_TLD} set as primary`, hash: h });

    } catch (e) {
      toast.push({ title: "Gagal set primary", description: getErr(e), type: "error" });
    }
  };

  // ─────────────────── MY DOMAINS (event scan) ───────────────────
  type MyDomain = { name: string; expires: number };
  const [myDomains, setMyDomains] = useState<MyDomain[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [primaryLocal, setPrimaryLocal] = useState<string | null>(null);

  const refreshMyDomains = useCallback(async () => {
    if (!address || !publicClient) return;
    setLoadingMine(true);
    try {
      const seen = new Map<string, number>();
      // Sumber utama: cache lokal nama yang sukses di-mint dari device ini.
      const cached = JSON.parse(
        localStorage.getItem("orvex.domain.owned." + address.toLowerCase()) || "[]",
      ) as string[];
      // Tambahkan nama yang sedang dicek bila terbukti milik user.
      if (checkedName && !cached.includes(checkedName)) cached.push(checkedName);

      for (const n of cached) {
        try {
          const info = (await publicClient.readContract({
            address: ADDR.domainController,
            abi: domainControllerAbi,
            functionName: "domains",
            args: [n],
          })) as readonly [`0x${string}`, bigint];
          if (info[0].toLowerCase() === address.toLowerCase()) {
            seen.set(n, Number(info[1]));
          }
        } catch {
          // ignore single failure
        }
      }
      const list: MyDomain[] = Array.from(seen.entries()).map(([n, exp]) => ({ name: n, expires: exp }));
      setMyDomains(list);
    } catch (e) {
      console.warn("scan domains failed", e);
    } finally {
      setLoadingMine(false);
    }
  }, [address, publicClient, checkedName]);

  // Cache nama saat mint sukses
  useEffect(() => {
    if (receipt.isSuccess && pendingLabel === "Mint" && checkedName && address) {
      const key = "orvex.domain.owned." + address.toLowerCase();
      const cur = JSON.parse(localStorage.getItem(key) || "[]") as string[];
      if (!cur.includes(checkedName)) {
        cur.push(checkedName);
        localStorage.setItem(key, JSON.stringify(cur));
      }
      // If user has no primary yet, auto-set this domain as primary locally
      // so the header instantly shows their new identity.
      const pKey = PRIMARY_KEY + ":" + address.toLowerCase();
      if (!localStorage.getItem(pKey)) {
        localStorage.setItem(pKey, checkedName);
        setPrimaryLocal(checkedName);
      }
      notifyDomainUpdated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);


  useEffect(() => {
    void refreshMyDomains();
  }, [refreshMyDomains]);

  useEffect(() => {
    if (!address) return setPrimaryLocal(null);
    setPrimaryLocal(localStorage.getItem(PRIMARY_KEY + ":" + address.toLowerCase()));
  }, [address]);

  // ─────────────────────── UI ───────────────────────
  const existingCommit = checkedName && address ? loadCommit(checkedName, address) : null;
  // Default delay UX = 5s (was 60s). Actual on-chain minimum still respected via commitDelay read.
  const delaySec = Number(commitDelay.data ?? 5n);
  const elapsed = existingCommit ? now - existingCommit.committedAt : 0;
  const canReveal = !!existingCommit && elapsed >= delaySec;
  const waitSec = existingCommit ? Math.max(0, delaySec - elapsed) : 0;

  const yearsClamped = Math.min(5, Math.max(1, years));
  const isPriceLoading = !!checkedName && priceWei === undefined && availability.isLoading;

  return (
    <div className="relative max-w-6xl mx-auto px-4 py-10">
      {/* Aurora backdrop */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[520px] overflow-hidden -z-10">
        <div
          className="absolute -top-32 left-1/4 h-80 w-80 rounded-full blur-3xl animate-aurora"
          style={{ background: "var(--gradient-luxe)" }}
        />
        <div
          className="absolute top-10 right-10 h-96 w-96 rounded-full blur-3xl animate-aurora-2"
          style={{ background: "var(--gradient-brand)" }}
        />
        <div className="absolute inset-0 grid-bg opacity-30" />
      </div>

      {/* Internal page header */}
      <div className="flex items-center justify-between mb-6 animate-rise">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 rounded-2xl bg-gradient-luxe grid place-items-center shadow-neon">
            <Globe className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-accent font-semibold">
              ORVEX Name Service
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Claim your <span className="text-gradient-luxe">.{DOMAIN_TLD}</span> identity
            </h1>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 glass rounded-full px-3 py-1.5 text-xs">
          {isConnected ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <Wallet className="h-3.5 w-3.5" />
              <span className="font-mono">
                {address!.slice(0, 6)}…{address!.slice(-4)}
              </span>
            </>
          ) : (
            <ConnectButton />
          )}
        </div>
      </div>

      {/* HERO + SEARCH */}
      <div className="relative glass-strong rounded-[2rem] p-6 md:p-10 mb-8 overflow-hidden animated-border animate-rise">
        <div className="absolute inset-0 -z-0 opacity-40 grid-bg" />
        <div className="relative text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-semibold tracking-[0.25em] uppercase mb-4">
            <Sparkles className="h-3 w-3" />
            One name. Every chain.
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05] mb-3">
            Find your perfect <span className="text-gradient-luxe">Web3 name</span>
          </h2>
          <p className="text-muted-foreground mb-6">
            Replace long wallet addresses with a memorable on-chain identity. NFT-backed, owned by you forever.
          </p>

          <div className="relative">
            <div className="flex items-stretch gap-2 bg-surface-2 border border-border rounded-2xl p-2 focus-within:border-primary transition">
              <div className="flex items-center pl-3 text-muted-foreground">
                <Search className="h-5 w-5" />
              </div>
              <input
                value={rawQuery}
                onChange={(e) => setRawQuery(sanitize(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="vitalik"
                className="flex-1 bg-transparent outline-none text-lg md:text-xl font-semibold tracking-tight px-2"
                aria-label="Domain name"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
              />
              <div className="hidden sm:flex items-center px-3 text-lg font-bold text-gradient-luxe">
                .{DOMAIN_TLD}
              </div>
              <button
                onClick={handleSearch}
                disabled={!valid}
                className="px-5 md:px-7 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:shadow-gold transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cek
              </button>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground text-left px-2">
              Hanya huruf kecil, angka, dan tanda hubung — minimal 3 karakter.
            </div>
          </div>
        </div>
      </div>

      {/* RESULT PANEL */}
      {checkedName && (
        <div className="glass-strong rounded-3xl p-6 md:p-8 mb-8 animate-rise">
          {availability.isLoading && !availability.data ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Mengecek ketersediaan…
            </div>
          ) : isAvailable ? (
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 text-xs font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Tersedia
                </div>
                <div className="mt-3 text-3xl md:text-4xl font-black tracking-tight break-all">
                  {checkedName}
                  <span className="text-gradient-luxe">.{DOMAIN_TLD}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {checkedName.length <= 3
                    ? "Nama Premium — sangat langka"
                    : checkedName.length === 4
                      ? "Nama pendek — populer"
                      : "Nama standar"}
                </div>
                <div className="flex gap-3 mt-5">
                  <Stat icon={<Shield className="h-4 w-4" />} label="NFT" value="ERC-721" />
                  <Stat icon={<Clock className="h-4 w-4" />} label="Durasi" value={`${yearsClamped} thn`} />
                  <Stat
                    icon={<Sparkles className="h-4 w-4" />}
                    label="Harga"
                    value={
                      isPriceLoading
                        ? "…"
                        : priceWei
                          ? `${Number(formatEther(priceWei)).toFixed(4)} zkLTC`
                          : "—"
                    }
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-surface-2 border border-border p-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  Pilih durasi registrasi
                </div>
                <div className="flex items-center justify-between rounded-xl bg-surface border border-border p-2">
                  <button
                    onClick={() => setYears((y) => Math.max(1, y - 1))}
                    className="h-10 w-10 rounded-lg bg-surface-2 hover:bg-primary/20 grid place-items-center transition"
                    aria-label="Kurangi tahun"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="text-center">
                    <div className="text-3xl font-black">{yearsClamped}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Tahun
                    </div>
                  </div>
                  <button
                    onClick={() => setYears((y) => Math.min(5, y + 1))}
                    className="h-10 w-10 rounded-lg bg-surface-2 hover:bg-primary/20 grid place-items-center transition"
                    aria-label="Tambah tahun"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-mono font-bold text-lg">
                    {isPriceLoading
                      ? "…"
                      : priceWei
                        ? `${Number(formatEther(priceWei)).toFixed(4)} zkLTC`
                        : "—"}
                  </span>
                </div>

                {/* Commit-reveal flow */}
                {!isConnected ? (
                  <div className="mt-4">
                    <ConnectButton />
                  </div>
                ) : !existingCommit ? (
                  <button
                    onClick={handleCommit}
                    disabled={!!pendingHash}
                    className="mt-4 w-full py-3 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:shadow-gold transition disabled:opacity-40 inline-flex items-center justify-center gap-2"
                  >
                    {pendingHash && pendingLabel === "Commit" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Commit…
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" /> 1/2 — Commit
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleMint}
                    disabled={!canReveal || !!pendingHash}
                    className="mt-4 w-full py-3 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:shadow-gold transition disabled:opacity-40 inline-flex items-center justify-center gap-2"
                  >
                    {pendingHash && pendingLabel === "Mint" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Minting…
                      </>
                    ) : canReveal ? (
                      <>
                        <Sparkles className="h-4 w-4" /> 2/2 — Mint Domain
                      </>
                    ) : (
                      <>
                        <Clock className="h-4 w-4" /> Tunggu {waitSec}s
                      </>
                    )}
                  </button>
                )}
                <div className="mt-2 text-[10px] text-muted-foreground text-center">
                  Anti-front-running: commit dulu, lalu mint setelah ~{delaySec}s.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/15 text-destructive border border-destructive/30 text-xs font-bold">
                  <XCircle className="h-3.5 w-3.5" /> Sudah Dimiliki
                </div>
                <div className="mt-3 text-3xl font-black break-all">
                  {checkedName}
                  <span className="text-muted-foreground">.{DOMAIN_TLD}</span>
                </div>
                {domainInfo && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Pemilik:{" "}
                    <span className="font-mono text-foreground">
                      {domainInfo[0] === ZERO
                        ? "—"
                        : `${domainInfo[0].slice(0, 6)}…${domainInfo[0].slice(-4)}`}
                    </span>
                    {domainInfo[1] > 0n && (
                      <>
                        {" · "}
                        Berakhir{" "}
                        <span className="text-foreground">
                          {new Date(Number(domainInfo[1]) * 1000).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={async () => {
                  if (!address) return;
                  if (!priceWei) return;
                  try {
                    const h = await writeContractAsync({
                      address: ADDR.domainController,
                      abi: domainControllerAbi,
                      functionName: "renew",
                      args: [checkedName, BigInt(yearsClamped * SECONDS_PER_YEAR)],
                      value: priceWei,
                    });
                    setPendingHash(h);
                    setPendingLabel("Renew");
                    toast.push({ title: "Renewing…", hash: h });
                  } catch (e) {
                    toast.push({ title: "Renew gagal", description: getErr(e), type: "error" });
                  }
                }}
                disabled={
                  !isConnected ||
                  !domainInfo ||
                  domainInfo[0].toLowerCase() !== (address?.toLowerCase() ?? "")
                }
                className="px-5 py-3 rounded-xl glass border border-border hover:border-primary/60 font-semibold transition disabled:opacity-40"
                title="Perpanjang (hanya pemilik)"
              >
                Perpanjang {yearsClamped} thn
              </button>
            </div>
          )}
        </div>
      )}

      {/* MY DOMAINS */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold tracking-tight inline-flex items-center gap-2">
          <Crown className="h-5 w-5 text-accent" /> Domain Saya
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
        <button
          onClick={() => void refreshMyDomains()}
          className="text-xs glass px-3 py-1.5 rounded-full hover:border-primary/60"
        >
          {loadingMine ? "Memuat…" : "Refresh"}
        </button>
      </div>

      {!isConnected ? (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground">
          Hubungkan dompet untuk melihat domain yang Anda miliki.
        </div>
      ) : myDomains.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground">
          Belum ada domain. Cari dan mint nama pertama Anda di atas ✨
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {myDomains.map((d, i) => {
            const isPrimary = primaryLocal === d.name;
            const daysLeft = Math.max(0, Math.floor((d.expires - Date.now() / 1000) / 86400));
            return (
              <div
                key={d.name}
                className="glass rounded-2xl p-5 card-hover animate-rise"
                style={{ animationDelay: `${Math.min(i * 50, 320)}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="relative">
                    <div
                      className="absolute inset-0 rounded-2xl blur-md opacity-60"
                      style={{ background: "var(--gradient-luxe)" }}
                    />
                    <div className="relative h-12 w-12 rounded-2xl bg-gradient-luxe grid place-items-center shadow-neon">
                      <Globe className="h-6 w-6 text-primary-foreground" />
                    </div>
                  </div>
                  {isPrimary && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full bg-accent/15 text-accent border border-accent/30">
                      <Star className="h-3 w-3 fill-current" /> Primary
                    </span>
                  )}
                </div>
                <div className="font-bold text-lg break-all">
                  {d.name}
                  <span className="text-gradient-luxe">.{DOMAIN_TLD}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {daysLeft > 0 ? `Berlaku ${daysLeft} hari lagi` : "Kedaluwarsa"}
                </div>
                <button
                  onClick={() => handleSetPrimary(d.name)}
                  disabled={isPrimary || !!pendingHash}
                  className="mt-4 w-full py-2.5 rounded-xl bg-surface-2 border border-border hover:border-primary/60 font-semibold text-sm transition disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  <Star className="h-4 w-4" />
                  {isPrimary ? "Sudah Primary" : "Jadikan Domain Utama"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Info strip kontrak (transparansi) */}
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <ContractChip label="Controller" addr={ADDR.domainController} />
        <ContractChip label="Registrar" addr={ADDR.domainRegistrar} />
        <ContractChip label="Resolver" addr={ADDR.domainResolver} />
        <ContractChip label="Registry" addr={ADDR.domainRegistry} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}

function ContractChip({ label, addr }: { label: string; addr: string }) {
  return (
    <div className="glass rounded-xl px-3 py-2 flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {addr.slice(0, 6)}…{addr.slice(-4)}
      </span>
    </div>
  );
}

// Catatan: namehash, keccak256, dan domainRegistryAbi/domainRegistrarAbi diimpor agar
// integrasi lanjutan (mis. baca expiries() di Registrar via tokenId = uint256(keccak256(label)),
// atau menulis subnode via Registry.setSubnodeOwner) bisa langsung ditambahkan di sini
// tanpa perlu mengubah dependencies.
void namehash;
void keccak256;
void toBytes;
void domainRegistrarAbi;
void domainRegistryAbi;
