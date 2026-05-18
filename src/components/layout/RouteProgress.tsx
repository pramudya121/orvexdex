import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

/**
 * Slim top-of-page neon progress bar that reflects router navigation state.
 * Gives the app a "loaded" feeling on every route change without layout shift.
 */
export function RouteProgress() {
  const status = useRouterState({ select: (s) => s.status });
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    if (status === "pending") {
      setVisible(true);
      setWidth(8);
      const grow = () => {
        setWidth((w) => (w < 90 ? w + Math.max(0.6, (92 - w) * 0.06) : w));
        tick.current = window.setTimeout(grow, 180);
      };
      grow();
    } else {
      if (tick.current) window.clearTimeout(tick.current);
      setWidth(100);
      const t = window.setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 260);
      return () => window.clearTimeout(t);
    }
    return () => {
      if (tick.current) window.clearTimeout(tick.current);
    };
  }, [status]);

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[2px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 260ms ease" }}
    >
      <div
        className="h-full bg-gradient-luxe shadow-neon"
        style={{
          width: `${width}%`,
          transition: "width 220ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </div>
  );
}

export default RouteProgress;
