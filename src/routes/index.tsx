import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/orvex-logo.png";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{ background: "var(--gradient-glow)" }} />

      <section className="relative max-w-7xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-muted-foreground mb-8">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Live on LitVM LiteForge Testnet
        </div>

        <img src={logo} alt="ORVEX" className="h-32 w-32 mx-auto mb-6 animate-pulse-glow" />

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
          Trade at the speed of <span className="text-gradient-brand">light</span>.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          ORVEX is the premium decentralized exchange built on LitVM LiteForge.
          Swap tokens, wrap zkLTC, and provide liquidity — every action settles fully on-chain.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/swap"
            className="px-7 py-3 rounded-xl bg-gradient-brand text-primary-foreground font-semibold shadow-neon hover:scale-[1.02] transition"
          >
            Launch Swap →
          </Link>
          <Link
            to="/faucet"
            className="px-7 py-3 rounded-xl glass font-semibold hover:border-primary/60 transition"
          >
            Get Test Tokens
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { label: "Chain ID", value: "4441" },
            { label: "Native", value: "zkLTC" },
            { label: "AMM Model", value: "UniswapV2" },
            { label: "Wallets", value: "4 Supported" },
          ].map((s) => (
            <div key={s.label} className="glass rounded-2xl p-5">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className="text-xl font-bold mt-1 text-gradient-brand">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative max-w-7xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { title: "Instant Swap", body: "Lightning-fast AMM trades powered by Uniswap V2 math, wrapped in a delightful UI.", icon: "⚡" },
            { title: "Real Liquidity", body: "Add or remove LP positions with a single, smart-approval flow. Earn protocol fees.", icon: "🌊" },
            { title: "On-Chain Faucet", body: "Claim test tokens with a 3D animated faucet. Built for builders.", icon: "💧" },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 hover:neon-border transition group">
              <div className="text-3xl mb-3 animate-float inline-block">{f.icon}</div>
              <h3 className="text-xl font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
