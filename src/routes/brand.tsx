import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand/BrandMark";

export const Route = createFileRoute("/brand")({
  component: BrandGuide,
  head: () => ({
    meta: [
      { title: "ORVEX Brand & Style Guide" },
      { name: "description", content: "Official ORVEX brand kit: logo treatments, color tokens, typography, motion, and component patterns for the premium AMM DEX experience." },
      { property: "og:title", content: "ORVEX Brand & Style Guide" },
      { property: "og:description", content: "Logo treatments, color tokens, typography, and motion principles for the ORVEX premium AMM DEX." },
    ],
  }),
});

const palette: Array<{ name: string; token: string; oklch: string; usage: string }> = [
  { name: "Violet Neon", token: "--primary", oklch: "oklch(0.65 0.27 295)", usage: "Primary brand, active states, neon halo" },
  { name: "Azure Pulse", token: "--accent", oklch: "oklch(0.78 0.18 220)", usage: "Secondary accent, links, highlights" },
  { name: "Atelier Gold", token: "--gold", oklch: "oklch(0.84 0.16 85)", usage: "Premium chips, borders, gold gradient" },
  { name: "Obsidian", token: "--background", oklch: "oklch(0.08 0.02 280)", usage: "Canvas, deep ambient backdrop" },
  { name: "Surface", token: "--surface-2", oklch: "oklch(0.14 0.03 280)", usage: "Cards, panels, ticker rail" },
  { name: "Emerald Signal", token: "--success", oklch: "oklch(0.72 0.18 155)", usage: "Positive deltas, success badges" },
];

function Swatch({ name, oklch, token, usage }: { name: string; oklch: string; token: string; usage: string }) {
  return (
    <div className="rounded-2xl overflow-hidden glass-strong border-gold card-hover">
      <div className="h-24 w-full" style={{ background: oklch }} aria-hidden />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold">{name}</div>
          <code className="text-[10px] text-muted-foreground">{token}</code>
        </div>
        <code className="block mt-2 text-[11px] text-gradient-gold font-mono">{oklch}</code>
        <p className="text-xs text-muted-foreground mt-2">{usage}</p>
      </div>
    </div>
  );
}

function Block({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="relative">
      {eyebrow && (
        <div className="text-[10px] tracking-[0.35em] uppercase text-gradient-gold font-semibold mb-2">{eyebrow}</div>
      )}
      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-6">{title}</h2>
      {children}
    </section>
  );
}

function BrandGuide() {
  return (
    <div className="relative">
      {/* Ambient backdrop */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[900px] h-[600px] rounded-full blur-3xl opacity-40 animate-aurora"
          style={{ background: "radial-gradient(closest-side, oklch(0.65 0.27 295 / 0.55), transparent 70%)" }} />
        <div className="absolute top-80 -right-32 w-[700px] h-[700px] rounded-full blur-3xl opacity-30 animate-aurora-2"
          style={{ background: "radial-gradient(closest-side, oklch(0.78 0.18 220 / 0.45), transparent 70%)" }} />
      </div>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-20 space-y-16">
        {/* Header */}
        <header className="rounded-[2rem] glass-strong border-gold shadow-elegant noise-bg animated-border p-8 sm:p-12">
          <div className="text-[10px] tracking-[0.4em] uppercase text-gradient-gold font-semibold">Style Guide · v1.0</div>
          <h1 className="mt-3 text-5xl sm:text-6xl font-extrabold tracking-tight">
            <span className="text-gradient-luxe">ORVEX</span> Brand Atelier
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
            A connoisseur-grade visual system for the premium AMM DEX on LitVM. Obsidian canvas, neon violet pulse,
            azure liquidity, atelier gold. Quiet typography, generous space, and motion that breathes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-8">
            <BrandMark size="xl" />
            <BrandMark size="lg" />
            <BrandMark size="md" />
            <BrandMark size="sm" />
          </div>
        </header>

        {/* Logo */}
        <Block eyebrow="01 · Logo" title="The Brandmark">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="rounded-2xl glass-strong border-gold p-8 flex items-center justify-center min-h-[180px]">
              <BrandMark size="xl" showTagline={false} />
            </div>
            <div className="rounded-2xl border-gold p-8 flex items-center justify-center min-h-[180px]"
              style={{ background: "var(--gradient-luxe)" }}>
              <BrandMark size="lg" />
            </div>
            <div className="rounded-2xl border-gold p-8 flex items-center justify-center min-h-[180px] bg-background">
              <BrandMark size="md" wordmark="ORVEX" tagline="Premium AMM · LitVM" />
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl">
            The mark sits inside an obsidian halo with an animated gradient frame. Never recolor the mark, never
            stretch, never remove the neon halo. Pair with the wordmark in luxe gradient or solid foreground only.
          </p>
        </Block>

        {/* Color */}
        <Block eyebrow="02 · Color" title="Palette & Tokens">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {palette.map((p) => <Swatch key={p.name} {...p} />)}
          </div>
          <div className="mt-6 grid md:grid-cols-3 gap-5">
            <div className="rounded-2xl p-6 border-gold glass-strong">
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Gradient · Luxe</div>
              <div className="h-16 rounded-xl" style={{ background: "var(--gradient-luxe)" }} />
              <code className="block mt-2 text-[10px] text-muted-foreground">--gradient-luxe</code>
            </div>
            <div className="rounded-2xl p-6 border-gold glass-strong">
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Gradient · Brand</div>
              <div className="h-16 rounded-xl" style={{ background: "var(--gradient-brand)" }} />
              <code className="block mt-2 text-[10px] text-muted-foreground">--gradient-brand</code>
            </div>
            <div className="rounded-2xl p-6 border-gold glass-strong">
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Gradient · Gold</div>
              <div className="h-16 rounded-xl" style={{ background: "var(--gradient-gold)" }} />
              <code className="block mt-2 text-[10px] text-muted-foreground">--gradient-gold</code>
            </div>
          </div>
        </Block>

        {/* Typography */}
        <Block eyebrow="03 · Typography" title="Voice in Type">
          <div className="rounded-2xl glass-strong border-gold p-8 space-y-6">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Display · ExtraBold · Tight</div>
              <p className="text-5xl font-extrabold tracking-tight">Mastering Crypto & Web3</p>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Gradient Headline</div>
              <p className="text-4xl font-extrabold tracking-tight text-gradient-luxe">Building the Future of Decentralized Wealth</p>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Eyebrow · Wide Tracking</div>
              <p className="text-[11px] tracking-[0.35em] uppercase text-gradient-gold font-semibold">Premium AMM · LitVM</p>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Body · Comfortable</div>
              <p className="text-base leading-relaxed text-muted-foreground max-w-2xl">
                Settlements final, liquidity refined, experience uncompromised. Routed through wzkLTC for best execution.
              </p>
            </div>
          </div>
        </Block>

        {/* Motion */}
        <Block eyebrow="04 · Motion" title="Living Surface">
          <div className="grid md:grid-cols-3 gap-5">
            <div className="rounded-2xl glass-strong border-gold p-8 flex items-center justify-center min-h-[160px]">
              <div className="h-16 w-16 rounded-full animate-pulse-glow" style={{ background: "var(--gradient-brand)" }} />
              <div className="absolute mt-24 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">pulse-glow</div>
            </div>
            <div className="rounded-2xl glass-strong border-gold p-8 flex items-center justify-center min-h-[160px] relative overflow-hidden">
              <div className="h-16 w-32 rounded-xl animate-aurora opacity-80" style={{ background: "var(--gradient-luxe)" }} />
              <div className="absolute bottom-3 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">aurora</div>
            </div>
            <div className="rounded-2xl glass-strong border-gold p-8 flex items-center justify-center min-h-[160px] animated-border relative">
              <div className="text-sm font-semibold">animated-border</div>
            </div>
          </div>
        </Block>

        {/* Components */}
        <Block eyebrow="05 · Components" title="Surface Patterns">
          <div className="grid md:grid-cols-3 gap-5">
            <button className="px-6 py-3 rounded-xl bg-gradient-luxe text-primary-foreground font-bold shadow-neon hover:-translate-y-0.5 transition-all">
              Primary · Luxe CTA
            </button>
            <button className="px-6 py-3 rounded-xl glass border-gold font-semibold hover:bg-surface-2 transition">
              Ghost · Glass
            </button>
            <div className="px-4 py-2 rounded-full bg-gradient-gold text-black text-[10px] font-bold tracking-[0.3em] uppercase shadow-gold inline-flex items-center justify-center">
              Premium AMM · LitVM
            </div>
          </div>
        </Block>

        <div className="text-center">
          <Link to="/" className="text-sm text-gradient-gold font-semibold tracking-[0.2em] uppercase">← Back to Atelier</Link>
        </div>
      </section>
    </div>
  );
}