import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import heroNeon from "@/assets/orvex-hero-neon.jpg";
import { ADDR } from "@/lib/chain";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { TOKENS } from "@/lib/tokens";
import { WalletModal } from "@/components/wallet/ConnectButton";
import { findToken } from "@/lib/tokens";
import { usePoolStats, fmtWzk, type PoolMeta } from "@/lib/poolStats";
import { BrandMark } from "@/components/brand/BrandMark";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "ORVEX — Premium AMM DEX on LitVM LiteForge" },
      { name: "description", content: "ORVEX is a premium AMM DEX on LitVM LiteForge Testnet. Swap, provide liquidity, and earn — fully on-chain." },
      { property: "og:title", content: "ORVEX — Premium AMM DEX on LitVM LiteForge" },
      { property: "og:description", content: "Swap, provide liquidity, and track your portfolio live on the ORVEX AMM DEX." },
      { property: "og:url", content: "https://orvexdex12.lovable.app/" },
      { name: "twitter:title", content: "ORVEX — Premium AMM DEX on LitVM LiteForge" },
      { name: "twitter:description", content: "Swap, provide liquidity, and track your portfolio live on the ORVEX AMM DEX." },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex12.lovable.app/" }],
  }),
});

function Landing() {
  const [walletOpen, setWalletOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();

  // Live on-chain stats
  const len = useReadContract({
    address: ADDR.factory, abi: factoryAbi, functionName: "allPairsLength",
    query: { refetchInterval: 30000 },
  });
  const total = Number((len.data as bigint | undefined) ?? 0n);

  // Build poolMetas (every pair) so we can derive token prices in wzkLTC.
  const pairCalls = useMemo(
    () => Array.from({ length: total }, (_, i) => ({
      address: ADDR.factory as `0x${string}`,
      abi: factoryAbi,
      functionName: "allPairs" as const,
      args: [BigInt(i)] as const,
    })),
    [total],
  );
  const pairsQ = useReadContracts({ contracts: pairCalls, query: { enabled: total > 0 } });
  const pairAddrs = (pairsQ.data ?? [])
    .map((r) => r.result as `0x${string}` | undefined)
    .filter(Boolean) as `0x${string}`[];

  const metaCalls = useMemo(
    () => pairAddrs.flatMap((p) => [
      { address: p, abi: pairAbi, functionName: "token0" as const },
      { address: p, abi: pairAbi, functionName: "token1" as const },
      { address: p, abi: pairAbi, functionName: "getReserves" as const },
    ]),
    [pairAddrs],
  );
  const metaQ = useReadContracts({ contracts: metaCalls, query: { enabled: pairAddrs.length > 0, refetchInterval: 30000 } });
  const poolMetas: PoolMeta[] = useMemo(() => pairAddrs.flatMap((pair, i) => {
    const t0 = metaQ.data?.[i * 3]?.result as `0x${string}` | undefined;
    const t1 = metaQ.data?.[i * 3 + 1]?.result as `0x${string}` | undefined;
    const r = metaQ.data?.[i * 3 + 2]?.result as readonly [bigint, bigint, number] | undefined;
    if (!t0 || !t1 || !r) return [];
    return [{
      pair, token0: t0, token1: t1,
      reserve0: r[0], reserve1: r[1],
      decimals0: findToken(t0)?.decimals ?? 18,
      decimals1: findToken(t1)?.decimals ?? 18,
    }];
  }), [pairAddrs, metaQ.data]);
  const stats = usePoolStats(poolMetas);
  const prices = stats.data?.prices;

  // Native balance
  const nativeBal = useBalance({ address, query: { enabled: !!address } });

  // ERC20 balances for showcase holdings
  const erc20s = TOKENS.filter((t) => !t.isNative);
  const balCalls = useMemo(
    () => erc20s.map((t) => ({
      address: t.address,
      abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    [address, erc20s.length],
  );
  const bals = useReadContracts({ contracts: balCalls as any, query: { enabled: !!address } });

  // Per-token holding with raw bigint + wzkLTC value, sorted by value.
  const ONE = 10n ** 18n;
  const wzkAddr = ADDR.wzkLTC.toLowerCase();
  const holdings = useMemo(() => {
    const toWzk = (raw: bigint, decimals: number, addrLower: string): bigint => {
      if (raw === 0n) return 0n;
      // native zkLTC == wzkLTC for pricing purposes
      const px = prices?.get(addrLower) ?? (addrLower === wzkAddr ? ONE : undefined);
      if (!px) return 0n;
      const norm = decimals === 18 ? raw
        : decimals < 18 ? raw * 10n ** BigInt(18 - decimals)
        : raw / 10n ** BigInt(decimals - 18);
      return (norm * px) / ONE;
    };
    const list = [
      {
        token: TOKENS[0],
        raw: (nativeBal.data?.value ?? 0n),
        valueWzk: toWzk(nativeBal.data?.value ?? 0n, 18, wzkAddr),
      },
      ...erc20s.map((t, i) => {
        const raw = (bals.data?.[i]?.result as bigint | undefined) ?? 0n;
        return { token: t, raw, valueWzk: toWzk(raw, t.decimals, t.address.toLowerCase()) };
      }),
    ];
    return list.sort((a, b) => (a.valueWzk < b.valueWzk ? 1 : a.valueWzk > b.valueWzk ? -1 : 0));
  }, [nativeBal.data, bals.data, erc20s, prices, wzkAddr]);

  const totalValueWzk: bigint = holdings.reduce<bigint>((s, h) => s + h.valueWzk, 0n);

  return (
    <div className="relative">
      {/* Ambient backdrop */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] rounded-full blur-3xl opacity-50 animate-aurora"
          style={{ background: "radial-gradient(closest-side, oklch(0.65 0.27 295 / 0.55), transparent 70%)" }} />
        <div className="absolute top-40 -left-32 w-[600px] h-[600px] rounded-full blur-3xl opacity-40 animate-aurora-2"
          style={{ background: "radial-gradient(closest-side, oklch(0.78 0.18 220 / 0.5), transparent 70%)" }} />
        <div className="absolute top-80 -right-32 w-[700px] h-[700px] rounded-full blur-3xl opacity-30 animate-aurora"
          style={{ background: "radial-gradient(closest-side, oklch(0.84 0.16 85 / 0.35), transparent 70%)" }} />
      </div>

      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* Master frame */}
        <div className="relative rounded-[2.25rem] glass-strong border-gold shadow-elegant noise-bg overflow-hidden animated-border">
          <div className="absolute inset-0 grid-bg opacity-[0.10] pointer-events-none" />

          {/* HERO */}
          <div className="relative grid lg:grid-cols-12 gap-8 p-6 sm:p-10 lg:p-14">
            <div className="lg:col-span-7 relative z-10 animate-rise">
              <BrandMark size="lg" className="mb-7" />

              <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold leading-[1.05] tracking-tight">
                Mastering Crypto & Web3
                <br />
                <span className="text-gradient-luxe">Building the Future of</span>
                <br />
                Decentralized Wealth
              </h1>

              <div className="mt-5 flex items-center gap-2 text-sm">
                <span className="text-gradient-brand font-semibold tracking-wider">Portfolio</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-gradient-brand font-semibold tracking-wider">DeFi</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-gradient-brand font-semibold tracking-wider">Innovation</span>
              </div>

              {/* Portfolio value card */}
              <div className="mt-8 relative max-w-md rounded-2xl p-5 glass-strong border-gold shadow-neon animate-rise" style={{ animationDelay: "120ms" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground">Total Portfolio Value</div>
                    <div className="mt-1 text-4xl sm:text-5xl font-extrabold text-gradient-luxe">
                      {isConnected ? (
                        <>
                          {fmtWzk(totalValueWzk, 4)}{" "}
                          <span className="text-2xl text-muted-foreground font-bold">wzkLTC</span>
                        </>
                      ) : "1.28M wzkLTC"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {isConnected ? "Priced via on-chain wzkLTC pools" : "Demo · connect to view live"}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-black font-bold text-sm shadow-[0_0_30px_rgba(52,211,153,0.45)]">
                    +0%
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap gap-3 animate-rise" style={{ animationDelay: "200ms" }}>
                <button
                  onClick={() => { if (isConnected) navigate({ to: "/swap" }); else setWalletOpen(true); }}
                  className="px-6 py-3 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:-translate-y-0.5 transition-all"
                >
                  {isConnected ? "Open Trading Desk →" : "Connect Wallet"}
                </button>
                <Link to="/pools" className="px-6 py-3 rounded-xl glass border-gold font-semibold hover:bg-surface-2 transition">
                  Explore Pools
                </Link>
                <Link to="/faucet" className="px-6 py-3 rounded-xl text-sm text-muted-foreground hover:text-foreground transition">
                  Test tokens →
                </Link>
              </div>
            </div>

            {/* Hero visual */}
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-square w-full max-w-lg mx-auto animate-rise" style={{ animationDelay: "120ms" }}>
                <div className="absolute inset-0 rounded-[2.5rem] blur-3xl opacity-70 animate-pulse-glow"
                  style={{ background: "radial-gradient(closest-side, oklch(0.65 0.27 295 / 0.7), transparent 70%)" }} />
                <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden shadow-elegant border-gold animated-border">
                  <img src={heroNeon} alt="ORVEX neon emblem" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-gold text-[10px] font-bold tracking-[0.3em] uppercase text-black shadow-gold">
                  Premium AMM · LitVM
                </div>
              </div>
            </div>
          </div>

          {/* DASHBOARD ROW */}
          <div className="relative grid lg:grid-cols-12 gap-6 px-6 sm:px-10 lg:px-14 pb-10">
            <h2 className="sr-only">Portfolio overview</h2>
            {/* Holdings */}
            <div className="lg:col-span-7 rounded-2xl glass border-gold p-6 card-hover animate-rise" style={{ animationDelay: "240ms" }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Holdings</h3>
                <Link to="/portfolio" className="text-xs text-gradient-gold font-semibold tracking-[0.2em] uppercase hover:opacity-80">View all →</Link>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {holdings.slice(0, 5).map((h) => (
                  <div key={h.token.symbol} className="rounded-xl p-3 glass-strong border-gold text-center card-hover">
                    <img src={h.token.logo} alt={`${h.token.symbol} token logo`} className="h-10 w-10 mx-auto rounded-full ring-2 ring-primary/40" />
                    <div className="mt-2 text-sm font-bold">{h.token.symbol}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {isConnected
                        ? `${Number(formatUnits(h.raw, h.token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 3 })}`
                        : h.token.name}
                    </div>
                    {isConnected && h.valueWzk > 0n && (
                      <div className="text-[10px] text-gradient-gold font-mono">{fmtWzk(h.valueWzk, 2)} wzk</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Performance */}
            <div className="lg:col-span-5 rounded-2xl glass border-gold p-6 card-hover animate-rise" style={{ animationDelay: "300ms" }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Performance</h3>
                <span className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded-full glass-strong border-gold">Daily</span>
              </div>
              <Sparkline />
              <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span>
              </div>
            </div>
          </div>

          {/* FEATURED ROW */}
          <div className="relative grid lg:grid-cols-12 gap-6 px-6 sm:px-10 lg:px-14 pb-12">
            <h2 className="sr-only">Featured products</h2>
            <FeaturedCard
              title="Featured Pools"
              subtitle={`${total > 0 ? total : "—"} active markets`}
              accent="violet"
              cta="Open Pools"
              to="/pools"
              delay={360}
            />
            <FeaturedCard
              title="Smart Routing"
              subtitle="Multi-hop best execution via wzkLTC"
              accent="cyan"
              cta="Try a Swap"
              to="/swap"
              delay={420}
            />
            <FeaturedCard
              title="Latest Activity"
              subtitle="Live mints, swaps & burns on-chain"
              accent="gold"
              cta="Open Portfolio"
              to="/portfolio"
              delay={480}
            />
          </div>
        </div>
      </section>

      {/* TICKER */}
      <section className="relative border-y border-border/60 bg-surface-2/30 backdrop-blur overflow-hidden">
        <div className="flex gap-12 py-4 whitespace-nowrap animate-ticker">
          {[...Array(2)].flatMap((_, j) =>
            TOKENS.map((t) => (
              <div key={`${j}-${t.symbol}`} className="flex items-center gap-3 text-sm">
                <img src={t.logo} alt={`${t.symbol} token logo`} className="h-6 w-6 rounded-full" />
                <span className="font-semibold tracking-wider">{t.symbol}</span>
                <span className="text-muted-foreground text-xs">{t.name}</span>
              </div>
            )),
          )}
        </div>
      </section>

      <WalletModal open={walletOpen} onClose={() => { setWalletOpen(false); if (isConnected) navigate({ to: "/swap" }); }} />
    </div>
  );
}

function Sparkline() {
  // Decorative deterministic sparkline
  const points = [40, 90, 70, 130, 100, 150, 120, 180, 160, 210, 190, 240, 220, 260];
  const w = 480, h = 140, max = 280;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * h}`).join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.65 0.27 295)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="oklch(0.65 0.27 295)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-line" x1="0" x2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.18 220)" />
          <stop offset="100%" stopColor="oklch(0.84 0.16 85)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke="url(#spark-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - (points[points.length - 1] / max) * h} r="5" fill="oklch(0.84 0.16 85)" className="animate-pulse-glow" />
    </svg>
  );
}

function FeaturedCard({ title, subtitle, cta, to, accent, delay }: { title: string; subtitle: string; cta: string; to: string; accent: "violet" | "cyan" | "gold"; delay: number }) {
  const grad = accent === "violet"
    ? "from-[oklch(0.45_0.22_295)] via-[oklch(0.3_0.15_300)] to-[oklch(0.18_0.08_290)]"
    : accent === "cyan"
    ? "from-[oklch(0.45_0.18_220)] via-[oklch(0.28_0.12_240)] to-[oklch(0.18_0.06_270)]"
    : "from-[oklch(0.55_0.16_85)] via-[oklch(0.35_0.12_70)] to-[oklch(0.18_0.05_60)]";
  return (
    <div
      className={`lg:col-span-4 group relative rounded-2xl p-6 overflow-hidden border-gold card-hover bg-gradient-to-br ${grad} shadow-elegant animate-rise`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-50 bg-white/20" />
      <div className="relative">
        <div className="text-[10px] tracking-[0.3em] uppercase text-white/70 mb-2">Featured</div>
        <h3 className="text-2xl font-bold text-white">{title}</h3>
        <p className="mt-1 text-sm text-white/80">{subtitle}</p>
        <Link
          to={to as any}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 text-black text-sm font-bold hover:bg-white transition"
        >
          {cta} →
        </Link>
      </div>
    </div>
  );
}