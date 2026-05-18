import logo from "@/assets/orvex-logo.png";

type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, { box: string; img: string; title: string; sub: string; gap: string }> = {
  sm: { box: "h-7 w-7", img: "h-4 w-4", title: "text-sm tracking-[0.22em]", sub: "text-[7px] tracking-[0.3em]", gap: "gap-2" },
  md: { box: "h-10 w-10", img: "h-6 w-6", title: "text-lg tracking-[0.22em]", sub: "text-[8px] tracking-[0.3em]", gap: "gap-2.5" },
  lg: { box: "h-12 w-12", img: "h-7 w-7", title: "text-2xl tracking-[0.28em]", sub: "text-[10px] tracking-[0.35em]", gap: "gap-3" },
  xl: { box: "h-16 w-16", img: "h-10 w-10", title: "text-3xl tracking-[0.3em]", sub: "text-[11px] tracking-[0.4em]", gap: "gap-4" },
};

interface BrandMarkProps {
  size?: Size;
  showWordmark?: boolean;
  showTagline?: boolean;
  className?: string;
  tagline?: string;
  wordmark?: string;
}

/**
 * Premium neon ORVEX brandmark.
 * - Logo sits inside a glowing obsidian halo with animated gradient border
 * - Wordmark uses the brand luxe gradient
 * - Tagline is whisper-quiet, uppercase, wide tracking
 */
export function BrandMark({
  size = "md",
  showWordmark = true,
  showTagline = true,
  className = "",
  tagline = "Atelier · DEX",
  wordmark = "ORVEX",
}: BrandMarkProps) {
  const s = sizes[size];
  return (
    <span className={`inline-flex items-center ${s.gap} group ${className}`}>
      <span className="relative inline-flex">
        {/* Soft neon halo */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-xl blur-md opacity-60 group-hover:opacity-90 transition-opacity ${s.box}`}
          style={{ background: "radial-gradient(closest-side, oklch(0.65 0.27 295 / 0.85), transparent 70%)" }}
        />
        {/* Animated gradient frame */}
        <span
          className={`relative ${s.box} rounded-xl bg-background/80 backdrop-blur-md inline-flex items-center justify-center animated-border shadow-neon`}
        >
          <img src={logo} alt={`${wordmark} logo`} className={`${s.img} animate-pulse-glow`} loading="eager" decoding="async" />
        </span>
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className={`font-bold ${s.title} text-gradient-luxe-anim`}>{wordmark}</span>
          {showTagline && (
            <span className={`uppercase ${s.sub} text-muted-foreground mt-1`}>{tagline}</span>
          )}
        </span>
      )}
    </span>
  );
}

export default BrandMark;