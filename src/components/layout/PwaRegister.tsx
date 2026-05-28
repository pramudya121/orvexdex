import { useEffect } from "react";

/** Register the ORVEX service worker for offline shell + PWA install. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Skip on localhost dev to avoid stale caches during HMR.
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
