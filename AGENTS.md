# AGENTS.md

## Project Overview
ORVEX — a TanStack Start (SSR via Nitro) + Vite + React 19 DEX app on the LitVM LiteForge chain.
Uses bun as the package manager (`bun.lock`), Supabase (hosted) for auth/DB, and wagmi/viem for Web3.

## Running in Base44
- `docker compose -f docker-compose.base44.yml up -d` starts the dev server.
- The `web` service uses `oven/bun:1.2`, bind-mounts the repo at `/app`, runs `bun install --frozen-lockfile` then `bun run dev -- --host 0.0.0.0 --port 5173`.
- Port 5173 (container) → 3000 (host). Preview is on port 3000.
- Vite config has `server.host: true` and `server.allowedHosts: true` so the preview's external hostname works.

## Environment
- `.env` (in repo, not gitignored) contains Supabase anon/publishable keys — these are public and safe.
- Compose loads `.env` via `env_file` so both client (`import.meta.env.VITE_*`) and server (`process.env.*`) see them.
- `/run/base44/app.env` is loaded last (platform-managed secrets) for optional `SUPABASE_SERVICE_ROLE_KEY` and AI gateway key.

## Optional Secrets (not required to boot)
- `SUPABASE_SERVICE_ROLE_KEY` — needed only for `/admin` server-side operations (bypasses RLS). Lazy-loaded via Proxy, app boots fine without it.
- Lovable AI Gateway key — needed only for the `/ai` chat server functions. Lazy-loaded, app boots fine without it.

## Verification
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` returns SSR HTML.
- Dev server serves live source modules (not a prebuilt bundle).
