import { useEffect, useLayoutEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

export type TourStep = {
  /** value of data-tour attribute on the target element */
  target: string;
  title: string;
  body: string;
  /** preferred placement */
  placement?: "top" | "bottom" | "left" | "right";
};

type Rect = { top: number; left: number; width: number; height: number };

export function Walkthrough({
  steps,
  open,
  onClose,
  storageKey,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  /** if set, marks tour as completed in localStorage when finished */
  storageKey?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const step = steps[idx];

  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // measure after a short delay to allow scroll
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    document.body && ro.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const finish = () => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    }
    onClose();
  };
  const next = () => (idx >= steps.length - 1 ? finish() : setIdx(idx + 1));
  const prev = () => setIdx(Math.max(0, idx - 1));

  // Tooltip placement
  const PAD = 12;
  const TIP_W = 340;
  const TIP_H = 200;
  let tipTop = 80;
  let tipLeft = window.innerWidth / 2 - TIP_W / 2;
  if (rect) {
    const placement = step.placement ?? "bottom";
    if (placement === "bottom") {
      tipTop = Math.min(window.innerHeight - TIP_H - PAD, rect.top + rect.height + PAD);
      tipLeft = Math.max(PAD, Math.min(window.innerWidth - TIP_W - PAD, rect.left + rect.width / 2 - TIP_W / 2));
    } else if (placement === "top") {
      tipTop = Math.max(PAD, rect.top - TIP_H - PAD);
      tipLeft = Math.max(PAD, Math.min(window.innerWidth - TIP_W - PAD, rect.left + rect.width / 2 - TIP_W / 2));
    } else if (placement === "left") {
      tipLeft = Math.max(PAD, rect.left - TIP_W - PAD);
      tipTop = Math.max(PAD, Math.min(window.innerHeight - TIP_H - PAD, rect.top + rect.height / 2 - TIP_H / 2));
    } else {
      tipLeft = Math.min(window.innerWidth - TIP_W - PAD, rect.left + rect.width + PAD);
      tipTop = Math.max(PAD, Math.min(window.innerHeight - TIP_H - PAD, rect.top + rect.height / 2 - TIP_H / 2));
    }
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* SVG mask for spotlight */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="orvex-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
                rx={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#orvex-tour-mask)" />
        {rect && (
          <rect
            x={rect.left - 8}
            y={rect.top - 8}
            width={rect.width + 16}
            height={rect.height + 16}
            rx={16}
            fill="none"
            stroke="url(#orvex-tour-stroke)"
            strokeWidth={2}
            className="animate-pulse"
          />
        )}
        <defs>
          <linearGradient id="orvex-tour-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>

      {/* Click-catcher to skip on backdrop click */}
      <button
        aria-label="Skip tour"
        onClick={finish}
        className="absolute inset-0 w-full h-full cursor-default"
        style={{ background: "transparent" }}
      />

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-label={step.title}
        className="absolute glass-strong rounded-2xl border border-emerald-500/30 shadow-2xl p-5"
        style={{ top: tipTop, left: tipLeft, width: TIP_W }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-xl grid place-items-center"
              style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
            >
              <Sparkles className="h-4 w-4 text-black" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-bold">
                Step {idx + 1} of {steps.length}
              </div>
              <div className="font-black text-base leading-tight">{step.title}</div>
            </div>
          </div>
          <button
            onClick={finish}
            aria-label="Close tour"
            className="h-7 w-7 grid place-items-center rounded-full hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.body}</p>

        {/* progress */}
        <div className="flex gap-1 mb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition ${
                i <= idx ? "bg-gradient-to-r from-emerald-500 to-sky-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={prev}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
          <button
            onClick={next}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-black text-xs font-bold shadow-neon"
            style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
          >
            {idx >= steps.length - 1 ? "Finish" : "Next"} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
