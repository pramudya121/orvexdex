import { useEffect, useRef } from "react";

/**
 * Mouse parallax for the hero ambient blobs.
 * Wrap the hero in a relatively-positioned element and drop this inside.
 * It writes --mx / --my (range -1..1) on the parent so children can use them.
 */
export function HeroParallax({ targetSelector }: { targetSelector?: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = targetSelector
      ? (document.querySelector(targetSelector) as HTMLElement | null)
      : document.body;
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const apply = () => {
      el.style.setProperty("--mx", tx.toFixed(3));
      el.style.setProperty("--my", ty.toFixed(3));
      raf = 0;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [targetSelector]);
  return null;
}

/** 3D tilt on hover for hero visual. */
export function Tilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(1200px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
      });
    };
    const onLeave = () => {
      el.style.transform = "perspective(1200px) rotateY(0deg) rotateX(0deg)";
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{ transition: "transform 320ms cubic-bezier(0.16,1,0.3,1)", transformStyle: "preserve-3d", willChange: "transform" }}
    >
      {children}
    </div>
  );
}

/** Animated count-up for a numeric value. */
export function CountUp({ to, duration = 1400, decimals = 0, suffix, prefix }: { to: number; duration?: number; decimals?: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = `${prefix ?? ""}${to.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${suffix ?? ""}`;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = to * eased;
      el.textContent = `${prefix ?? ""}${v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${suffix ?? ""}`;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, decimals, suffix, prefix]);
  return <span ref={ref} />;
}
