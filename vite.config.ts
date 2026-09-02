import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  optimizeDeps: {
    // Pre-bundle these at startup so Vite never re-optimizes mid-render
    // (late discovery forces a reload that can null out React's dispatcher).
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@supabase/supabase-js",
      "wagmi",
      "viem",
      "@tanstack/react-query",
    ],
  },
});
