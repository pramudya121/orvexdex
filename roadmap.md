# Roadmap

- [x] Add motion-safe 3D tilt/parallax to the faucet hero
- [x] Show on-chain pool liquidity on every faucet token card
- [x] Apply cohesive global visual polish across routes
- [x] Verify faucet and representative routes in the browser
- [x] Complete the Casino admin contract controls
- [x] Upgrade Casino with animated 3D game stages and game-specific motion
- [x] Verify Casino and Casino Admin on desktop and mobile
- [x] Docs page with all contract addresses + ABIs (owner only)
- [x] Launchpad button on home, removed Casino/History pages

## X verification for faucet claims (gate: connect X + follow @ORVEX_LitVM)

- [x] Database table for wallet → X account, follow status, server-only tokens
- [x] X OAuth 2.0 (PKCE) connect flow + /auth/x/callback page
- [x] Server-side follow check against @ORVEX_LitVM with token refresh + "Check follow" re-check
- [x] Faucet: X verification card, Claim All locked until X connected and following
- [ ] Owner adds X_CLIENT_ID + X_CLIENT_SECRET secrets (waiting on user values from the X Developer Portal)
- [ ] Owner registers callback URLs in the X Developer Portal User authentication settings
- [ ] End-to-end test with a real X account
