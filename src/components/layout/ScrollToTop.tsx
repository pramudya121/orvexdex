import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

/** Scroll to top whenever the pathname changes (smooth, respects reduced motion). */
export function ScrollToTop() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduce ? "auto" : "smooth" });
  }, [pathname]);
  return null;
}

export default ScrollToTop;
