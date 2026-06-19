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
import { useDexStats } from "@/lib/dexStats";
import { BrandMark } from "@/components/brand/BrandMark";
import { HeroParallax, Tilt, CountUp } from "@/components/landing/HeroFx";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    links: [
      { rel: "preload", as: "image", href: heroNeon, fetchpriority: "high" } as any,
      { rel: "canonical", href: "https://orvexdex.lovable.app/" },
    ],
    meta: [
      { title: "ORVEX — The Connoisseur's DEX on LitVM LiteForge" },
      { name: "description", content: "ORVEX is a connoisseur-grade decentralized exchange on LitVM LiteForge. Trade with institutional precision, deep liquidity, smart routing and atomic on-chain settlement — no custodians, no compromises." },
      { property: "og:title", content: "ORVEX — The Connoisseur's DEX on LitVM LiteForge" },
      { property: "og:description", content: "Institutional-grade swaps, deep liquidity, and live on-chain analytics on the LitVM AMM. Refined for traders who demand more." },
      { property: "og:url", content: "https://orvexdex.lovable.app/" },
      { name: "twitter:title", content: "ORVEX — The Connoisseur's DEX on LitVM LiteForge" },
      { name: "twitter:description", content: "Institutional-grade swaps, deep liquidity, and live on-chain analytics on the LitVM AMM. Refined for traders who demand more." },
    ],
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
  const dex = useDexStats(poolMetas);
  const dexLoading = dex.isLoading || metaQ.isLoading || pairsQ.isLoading;

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
    <div className="relative" id="hero-root">
      <HeroParallax targetSelector="#hero-root" />
      {/* Ambient backdrop */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] rounded-full blur-3xl opacity-50 animate-aurora"
          style={{ background: "radial-gradient(closest-side, oklch(0.65 0.27 295 / 0.55), transparent 70%)", transform: "translate3d(calc(var(--mx,0) * 24px), calc(var(--my,0) * 18px), 0)" }} />
        <div className="absolute top-40 -left-32 w-[600px] h-[600px] rounded-full blur-3xl opacity-40 animate-aurora-2"
          style={{ background: "radial-gradient(closest-side, oklch(0.78 0.18 220 / 0.5), transparent 70%)", transform: "translate3d(calc(var(--mx,0) * -30px), calc(var(--my,0) * 22px), 0)" }} />
        <div className="absolute top-80 -right-32 w-[700px] h-[700px] rounded-full blur-3xl opacity-30 animate-aurora"
          style={{ background: "radial-gradient(closest-side, oklch(0.84 0.16 85 / 0.35), transparent 70%)", transform: "translate3d(calc(var(--mx,0) * 36px), calc(var(--my,0) * -20px), 0)" }} />
      </div>

      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* Master frame */}
        <div className="relative rounded-[2.25rem] glass-strong border-gold shadow-elegant noise-bg overflow-hidden animated-border">
          <div className="absolute inset-0 grid-bg opacity-[0.10] pointer-events-none" />

          {/* HERO */}
          <div className="relative grid lg:grid-cols-12 gap-8 p-6 sm:p-10 lg:p-14">
            <div className="lg:col-span-7 relative z-10 animate-rise">
              <BrandMark size="lg" className="mb-7" />

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-strong border-gold text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live on LitVM LiteForge · Chain 4441
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold leading-[1.05] tracking-tight">
                The Connoisseur's
                <br />
                <span className="text-gradient-luxe-anim">Decentralized Exchange</span>
                <br />
                Refined for LitVM.
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                ORVEX is an institutional-grade AMM crafted for the LitVM era — deep liquidity, smart multi-hop routing, transparent on-chain analytics and atomic settlement. No custodians. No middlemen. <span className="text-foreground/90 font-semibold">Just precision liquidity, on your terms.</span>
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] tracking-wider">
                <span className="px-2.5 py-1 rounded-full glass border-gold text-gradient-gold font-semibold">SMART ROUTING</span>
                <span className="px-2.5 py-1 rounded-full glass border-gold text-gradient-gold font-semibold">DEEP LIQUIDITY</span>
                <span className="px-2.5 py-1 rounded-full glass border-gold text-gradient-gold font-semibold">ATOMIC SETTLEMENT</span>
                <span className="px-2.5 py-1 rounded-full glass border-gold text-gradient-gold font-semibold">SELF-CUSTODY</span>
              </div>

              {/* Portfolio value card */}
              <div className="mt-8 relative max-w-md rounded-2xl p-5 glass-strong border-gold shadow-neon animate-rise" style={{ animationDelay: "120ms" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground">Total Portfolio Value</div>
                    <div className="mt-1 text-4xl sm:text-5xl font-extrabold text-gradient-luxe-anim">
                      {isConnected ? (
                        <>
                          {fmtWzk(totalValueWzk, 4)}{" "}
                          <span className="text-2xl text-muted-foreground font-bold">wzkLTC</span>
                        </>
                      ) : (
                        <>
                          <CountUp to={1.28} decimals={2} suffix="M" />{" "}
                          <span className="text-2xl text-muted-foreground font-bold">wzkLTC</span>
                        </>
                      )}
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
                  className="group relative overflow-hidden px-6 py-3 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:-translate-y-0.5 transition-all press"
                >
                  <span className="relative z-10">{isConnected ? "Open Trading Desk →" : "Connect Wallet"}</span>
                  <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                </button>
                <Link to="/pools" className="px-6 py-3 rounded-xl glass border-gold font-semibold hover:bg-surface-2 transition press">
                  Explore Pools
                </Link>
                <Link to="/faucet" className="px-6 py-3 rounded-xl text-sm text-muted-foreground hover:text-foreground transition">
                  Test tokens →
                </Link>
              </div>
            </div>

            {/* Hero visual */}
            <div className="lg:col-span-5 relative">
              <Tilt className="relative aspect-square w-full max-w-lg mx-auto animate-rise">
                <div className="absolute inset-0 rounded-[2.5rem] blur-3xl opacity-70 animate-pulse-glow"
                  style={{ background: "radial-gradient(closest-side, oklch(0.65 0.27 295 / 0.7), transparent 70%)" }} />
                <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden shadow-elegant border-gold animated-border">
                  <img
                    src={heroNeon}
                    alt="ORVEX neon emblem"
                    width={1024}
                    height={1024}
                    fetchPriority="high"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <div aria-hidden className="pointer-events-none absolute inset-0"
                    style={{ background: "radial-gradient(600px circle at calc(50% + var(--mx,0) * 120px) calc(50% + var(--my,0) * 120px), oklch(1 0 0 / 0.12), transparent 55%)" }} />
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-gold text-[10px] font-bold tracking-[0.3em] uppercase text-black shadow-gold">
                  Premium AMM · LitVM
                </div>
              </Tilt>
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

          {/* ON-CHAIN DEX STATS */}
          <div className="relative px-6 sm:px-10 lg:px-14 pb-10">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Live On-chain Metrics</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Aggregated directly from LitVM logs · refreshes every 60s
                </p>
              </div>
              <span className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded-full glass-strong border-gold">
                {dexLoading ? "Syncing…" : "Live"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Pools" value={dex.data ? String(dex.data.pools) : (total ? String(total) : "—")} loading={dexLoading} accent="violet" />
              <StatTile label="Volume 24h" value={dex.data ? `${fmtWzk(dex.data.volume24hWzk, 2)}` : "—"} suffix="wzk" loading={dexLoading} accent="gold" />
              <StatTile label="Swaps 24h" value={dex.data ? dex.data.txs24h.toLocaleString() : "—"} loading={dexLoading} accent="cyan" />
              <StatTile label="Unique Wallets" value={dex.data ? dex.data.uniqueWallets.toLocaleString() : "—"} hint="~24h window" loading={dexLoading} accent="violet" />
              <StatTile label="Active (1h)" value={dex.data ? dex.data.activeWallets1h.toLocaleString() : "—"} hint="last ~1h" loading={dexLoading} accent="cyan" />
              <StatTile label="TVL" value={dex.data ? fmtWzk(dex.data.tvlWzk, 2) : "—"} suffix="wzk" loading={dexLoading} accent="gold" />
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

      {/* HOW IT WORKS */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <div className="text-center mb-10 animate-rise">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-strong border-gold text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            From wallet to trade in <span className="text-gradient-luxe-anim">three moves</span>.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto">
            No accounts. No forms. No waiting. Just pure on-chain execution, the way DeFi was meant to feel.
          </p>
        </div>
        <div className="relative grid md:grid-cols-3 gap-5">
          {/* connecting line for desktop */}
          <div aria-hidden className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          {[
            { n: "01", t: "Connect", b: "MetaMask, Rabby, WalletConnect — your keys, never ours. LitVM is auto-added on first connect.", chip: "5 sec" },
            { n: "02", t: "Claim & Fund", b: "Grab zkLTC and sample assets from the in-app faucet. Cooldowns prevent abuse, balances arrive instantly.", chip: "10 sec" },
            { n: "03", t: "Trade", b: "Smart router scans every wzkLTC pair for best execution. Confirm once — settlement is atomic.", chip: "Sub-second" },
          ].map((s, i) => (
            <div
              key={s.n}
              className="group relative rounded-2xl p-6 glass-strong border-gold card-hover overflow-hidden animate-rise"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div aria-hidden className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-30 group-hover:opacity-70 transition-opacity duration-500 bg-primary/50" />
              <div className="relative flex items-start gap-4">
                <div className="shrink-0 grid place-items-center h-12 w-12 rounded-2xl bg-gradient-luxe text-primary-foreground font-black text-lg shadow-neon">
                  {s.n}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">{s.t}</h3>
                    <span className="text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full glass border-gold text-gradient-gold font-semibold">{s.chip}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{s.b}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SOCIAL PROOF / METRICS BAND */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <div className="relative rounded-3xl overflow-hidden border-gold glass-strong p-8 sm:p-10 animate-rise">
          <div aria-hidden className="absolute inset-0 grid-bg opacity-[0.08] pointer-events-none" />
          <div aria-hidden className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl opacity-40 bg-primary/40 animate-pulse-glow" />
          <div className="relative grid md:grid-cols-4 gap-6 text-center">
            {[
              { v: total > 0 ? String(total) : "—", l: "Live Pools", s: "On LitVM" },
              { v: dex.data ? dex.data.txs24h.toLocaleString() : "—", l: "Swaps · 24h", s: "And counting" },
              { v: dex.data ? dex.data.uniqueWallets.toLocaleString() : "—", l: "Unique Wallets", s: "Last 24h" },
              { v: "0.30%", l: "LP Fee", s: "Zero protocol cut" },
            ].map((m) => (
              <div key={m.l} className="relative">
                <div className="text-4xl sm:text-5xl font-extrabold text-gradient-luxe-anim leading-none">{m.v}</div>
                <div className="mt-2 text-[11px] tracking-[0.25em] uppercase text-foreground/80 font-semibold">{m.l}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{m.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY ORVEX */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <div className="text-center mb-10 animate-rise">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-strong border-gold text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Why ORVEX
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Built for traders who <span className="text-gradient-luxe-anim">demand more</span>.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto">
            Every basis point matters. ORVEX is engineered for precision execution, transparent economics, and an experience that feels effortless.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: "⚡", title: "Sub-second routing", body: "Multi-hop pathfinder evaluates every wzkLTC bridge in real-time for best execution.", delay: 0 },
            { icon: "🛡", title: "Self-custodial", body: "Your keys, your coins. ORVEX never touches funds — settlement is atomic on-chain.", delay: 80 },
            { icon: "📊", title: "Transparent metrics", body: "TVL, volume, swaps and unique wallets streamed directly from LitVM logs.", delay: 160 },
            { icon: "✨", title: "Atelier-grade UX", body: "Crafted micro-interactions, instant feedback, and a zero-friction trade flow.", delay: 240 },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl p-5 glass-strong border-gold card-hover animate-rise overflow-hidden"
              style={{ animationDelay: `${f.delay}ms` }}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-60 bg-primary/40 transition-opacity duration-500" />
              <div className="relative">
                <div className="text-3xl mb-3">{f.icon}</div>
                <div className="text-base font-bold">{f.title}</div>
                <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Trust strip */}
        <div className="mt-10 rounded-2xl glass border-gold p-5 flex flex-wrap items-center justify-around gap-4 animate-rise">
          {[
            { k: "Network", v: "LitVM · 4441" },
            { k: "Settlement", v: "Atomic on-chain" },
            { k: "Custody", v: "Non-custodial" },
            { k: "Routing", v: "Smart 2-hop" },
            { k: "Open source", v: "Verifiable" },
          ].map((t) => (
            <div key={t.k} className="text-center">
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">{t.k}</div>
              <div className="mt-0.5 text-sm font-bold text-gradient-gold">{t.v}</div>
            </div>
          ))}
        </div>
      </section>


      {/* FAQ */}
      <section className="relative max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="text-center mb-8 animate-rise">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-strong border-gold text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-3">
            FAQ
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Questions, <span className="text-gradient-luxe-anim">answered</span>.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { q: "Do I need to create an account?", a: "Never. ORVEX is fully self-custodial — connect any EVM wallet and trade. No emails, no KYC, no custody." },
            { q: "Which network does ORVEX use?", a: "LitVM LiteForge (Chain ID 4441). Your wallet is auto-prompted to add it the first time you connect." },
            { q: "What are the fees?", a: "Standard UniswapV2-style 0.30% LP fee per swap — paid to liquidity providers. ORVEX takes no protocol fee on top." },
            { q: "Is the code audited?", a: "ORVEX is a clean UniswapV2 fork. Contracts are verified on-chain and the source is open for inspection." },
            { q: "How do I get test tokens?", a: "Use the in-app Faucet to claim zkLTC and sample assets like TRX, XRP, ADA, ZEC, XMR with cooldowns." },
            { q: "Can I add my own pool?", a: "Yes — head to Liquidity, pick any two ERC-20s, approve once and deposit. New pairs deploy automatically via the Factory." },
          ].map((f, i) => (
            <details
              key={f.q}
              className="group rounded-2xl glass-strong border-gold p-4 cursor-pointer animate-rise hover:border-primary/40 transition-colors"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <summary className="flex items-center justify-between gap-3 list-none">
                <span className="text-sm font-semibold">{f.q}</span>
                <span className="h-6 w-6 grid place-items-center rounded-full glass border-gold text-xs text-gradient-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA BAND */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="relative overflow-hidden rounded-3xl border-gold glass-strong p-8 sm:p-12 animate-rise">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-3xl bg-primary/30 animate-pulse-glow" />
          <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full blur-3xl bg-accent/20 animate-pulse-glow" />
          <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6 text-center lg:text-left">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-bold mb-2">Ready when you are</div>
              <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Trade like a <span className="text-gradient-luxe-anim">connoisseur</span>.
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Connect your wallet, claim test assets, and execute your first swap in under thirty seconds.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-center">
              <Link
                to="/swap"
                className="press inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground text-sm font-bold shadow-neon hover:opacity-95 transition"
              >
                Launch Swap →
              </Link>
              <Link
                to="/faucet"
                className="press inline-flex items-center gap-2 px-6 py-3 rounded-2xl glass border-gold text-sm font-bold hover:border-primary/50 transition"
              >
                Get Test Tokens
              </Link>
            </div>
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

function StatTile({
  label, value, suffix, hint, loading, accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  loading?: boolean;
  accent: "violet" | "cyan" | "gold";
}) {
  const dot = accent === "violet"
    ? "bg-[oklch(0.65_0.27_295)]"
    : accent === "cyan"
    ? "bg-[oklch(0.78_0.18_220)]"
    : "bg-[oklch(0.84_0.16_85)]";
  return (
    <div className="rounded-2xl p-4 glass-strong border-gold card-hover">
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">{label}</div>
        <span className={`h-1.5 w-1.5 rounded-full ${dot} shadow-[0_0_10px_currentColor] animate-pulse-glow`} />
      </div>
      <div className="mt-2 text-2xl font-extrabold text-gradient-luxe">
        {loading ? <span className="inline-block h-6 w-16 rounded bg-surface-2 animate-pulse" /> : value}
        {!loading && suffix && <span className="ml-1 text-xs text-muted-foreground font-bold">{suffix}</span>}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}