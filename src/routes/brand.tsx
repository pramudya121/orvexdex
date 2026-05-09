import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import logo from "@/assets/orvex-logo.png";

export const Route = createFileRoute("/brand")({
  component: BrandPage,
  head: () => ({ meta: [
    { title: "Brand & Style Guide — ORVEX" },
    { name: "description", content: "ORVEX visual identity: Midnight Black palette, Neon accents, gradients, and reusable component patterns." },
  ] }),
});

type Swatch = { name: string; varName: string; token: string; note?: string };

const PALETTE: Swatch[] = [
  { name: "Midnight",      varName: "background", token: "bg-background",      note: "Page canvas" },
  { name: "Surface",       varName: "surface",    token: "bg-surface",         note: "Cards" },
  { name: "Surface 2",     varName: "surface-2",  token: "bg-surface-2",       note: "Inputs / inset" },
  { name: "Foreground",    varName: "foreground", token: "bg-foreground",      note: "Primary text" },
  { name: "Muted",         varName: "muted",      token: "bg-muted",           note: "Subtle blocks" },
  { name: "Border",        varName: "border",     token: "bg-border",          note: "Dividers" },
];

const ACCENTS: Swatch[] = [
  { name: "Neon Violet",   varName: "neon-violet", token: "bg-[var(--neon-violet)]", note: "Primary brand" },
  { name: "Neon Cyan",     varName: "neon-cyan",   token: "bg-[var(--neon-cyan)]",   note: "Secondary accent" },
  { name: "Royal Gold",    varName: "gold",        token: "bg-[var(--gold)]",        note: "Premium / value" },
  { name: "Gold Deep",     varName: "gold-deep",   token: "bg-[var(--gold-deep)]",   note: "Gradient stop" },
  { name: "Destructive",   varName: "destructive", token: "bg-destructive",          note: "Errors / remove" },
  { name: "Accent",        varName: "accent",      token: "bg-accent",               note: "Inline pills" },
];

const GRADIENTS = [
  { name: "gradient-brand", className: "bg-gradient-brand" },
  { name: "gradient-gold",  className: "bg-gradient-gold"  },
  { name: "gradient-luxe",  className: "bg-gradient-luxe"  },
];

function BrandPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 animate-fade-in">
      {/* Hero */}
      <div className="glass-strong rounded-3xl p-8 mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-50 pointer-events-none" />
        <div className="relative flex items-start gap-5 flex-wrap">
          <img src={logo} alt="ORVEX" className="h-16 w-16 animate-pulse-glow" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold">Atelier · Brand System</div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gradient-luxe mt-1">ORVEX Style Guide</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-prose">
              Midnight Black canvas, Neon Violet/Cyan brand, Royal Gold for value &amp; premium states.
              Use these tokens across pages — never hard-code colors.
            </p>
          </div>
        </div>
      </div>

      {/* Logo */}
      <Section title="Logo" subtitle="Always pair the mark with the wordmark on the lockup. Minimum size 32px.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Tile label="On Midnight" cls="bg-background">
            <img src={logo} alt="" className="h-14 w-14" />
          </Tile>
          <Tile label="On Surface" cls="bg-surface">
            <img src={logo} alt="" className="h-14 w-14" />
          </Tile>
          <Tile label="On Gradient" cls="bg-gradient-brand">
            <img src={logo} alt="" className="h-14 w-14" />
          </Tile>
        </div>
      </Section>

      {/* Palette */}
      <Section title="Midnight Palette" subtitle="Surfaces and structural tokens.">
        <SwatchGrid items={PALETTE} />
      </Section>

      <Section title="Neon Accents" subtitle="Reserved for action, value, and emphasis.">
        <SwatchGrid items={ACCENTS} />
      </Section>

      <Section title="Gradients" subtitle="Use sparingly on hero CTAs, headlines, and value displays.">
        <div className="grid sm:grid-cols-3 gap-3">
          {GRADIENTS.map((g) => (
            <div key={g.name} className="rounded-2xl overflow-hidden border border-border">
              <div className={`${g.className} h-24`} />
              <div className="p-3 bg-surface-2">
                <code className="text-xs font-mono text-foreground">{g.name}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Typography */}
      <Section title="Typography" subtitle="System sans for UI, gradients for hero copy.">
        <div className="glass rounded-2xl p-6 space-y-3">
          <div className="text-4xl font-bold text-gradient-luxe">Display · text-gradient-luxe</div>
          <div className="text-2xl font-bold text-gradient-gold">Heading · text-gradient-gold</div>
          <div className="text-lg font-semibold">Title · semibold</div>
          <div className="text-sm text-muted-foreground">Body muted · text-muted-foreground</div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-semibold">Eyebrow · uppercase 0.3em</div>
          <div className="font-mono text-sm">Mono · 0x42e4…6128</div>
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons" subtitle="Use brand for primary CTAs, gold for premium emphasis, surface for secondary.">
        <div className="glass rounded-2xl p-6 flex flex-wrap gap-3">
          <button className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold shadow-neon hover:opacity-95 transition">Primary</button>
          <button className="px-4 py-2 rounded-xl bg-gradient-gold text-background font-semibold shadow-gold hover:opacity-95 transition">Premium</button>
          <button className="px-4 py-2 rounded-xl bg-surface-2 border border-border font-semibold hover:border-primary/60 transition">Secondary</button>
          <button className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold hover:opacity-95 transition">Destructive</button>
          <button disabled className="px-4 py-2 rounded-xl bg-surface-2 border border-border font-semibold opacity-40 cursor-not-allowed">Disabled</button>
        </div>
      </Section>

      {/* Pills & badges */}
      <Section title="Pills &amp; Badges">
        <div className="glass rounded-2xl p-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">DETECTED</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">NEW</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">PENDING</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">FAILED</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">SUCCESS</span>
        </div>
      </Section>

      {/* Cards */}
      <Section title="Card Surfaces">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="glass rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">.glass</div>
            <div className="font-bold text-lg mt-1">Default card</div>
          </div>
          <div className="glass-strong rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">.glass-strong</div>
            <div className="font-bold text-lg mt-1">Strong card</div>
          </div>
          <div className="glass rounded-2xl p-5 neon-border">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">.neon-border</div>
            <div className="font-bold text-lg mt-1">Active state</div>
          </div>
        </div>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <div className="glass rounded-2xl p-6 grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2 border border-border focus-within:border-primary/60 transition">
            <span className="text-muted-foreground text-sm">⌕</span>
            <input placeholder="Search…" className="flex-1 bg-transparent outline-none text-sm" />
          </div>
          <input placeholder="Amount" className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none" />
        </div>
      </Section>

      <p className="text-[11px] text-muted-foreground text-center mt-10">
        Tokens defined in <code className="font-mono">src/styles.css</code>. Always reference via tokens, never hex literals.
      </p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, cls, children }: { label: string; cls: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <div className={`${cls} h-28 flex items-center justify-center`}>{children}</div>
      <div className="p-3 bg-surface-2 text-xs font-mono text-muted-foreground">{label}</div>
    </div>
  );
}

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((s) => (
        <div key={s.varName} className="rounded-2xl overflow-hidden border border-border">
          <div className={`${s.token} h-20`} />
          <div className="p-3 bg-surface-2">
            <div className="text-sm font-semibold">{s.name}</div>
            <code className="text-[10px] font-mono text-muted-foreground block truncate">--{s.varName}</code>
            {s.note && <div className="text-[10px] text-muted-foreground mt-0.5">{s.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}