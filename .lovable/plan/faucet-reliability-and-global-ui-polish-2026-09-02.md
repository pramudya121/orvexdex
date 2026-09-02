# Faucet Reliability and Global UI Polish

## Goal
Finish the faucet transaction and cooldown experience so every claim state is clear, actions cannot be submitted when invalid, and the page remains render-safe. Then standardize shared UI styling across the app without changing contract business logic.

## Implementation

### 1. Complete faucet transaction lifecycle
- Model the claim flow explicitly as wallet confirmation, submitted/pending, mined, or failed.
- Keep the mined result visible instead of immediately removing the panel, with the transaction hash linked to the explorer.
- Prevent duplicate submissions while the wallet prompt or an on-chain receipt is pending.
- Refresh faucet reads and reserves after confirmation, while safely resetting captcha state.

### 2. Make cooldown and eligibility live
- Render a per-token progress bar from the contract's `lastClaimed` and `cooldown` values using a client-safe one-second clock.
- Auto-disable each claim button when disconnected, captcha is incomplete, the token is unconfigured, reserve is insufficient, max claims are reached, cooldown is active, or another claim is in progress.
- Apply equivalent aggregate eligibility to “Claim All,” with a concise reason shown in its label/status.
- Guard bigint arithmetic and loading/undefined values so partial RPC responses cannot crash rendering.

### 3. Standardize premium UI foundations
- Refine the shared Button variants and sizes for consistent height, radius, focus ring, disabled state, loading affordance, and premium primary/outline/ghost treatments.
- Add global typography, form-control, content-width, section-spacing, and reduced-motion rules using existing semantic tokens.
- Replace the most visible raw action buttons in shared shell/faucet UI with the design-system Button while preserving behavior and accessibility.
- Normalize header, error-state, toast, and footer spacing/text hierarchy so every route inherits a consistent visual rhythm.

### 4. Verify
- Validate faucet disconnected, captcha-invalid, cooldown, maxed-out, insufficient-reserve, pending, success, and failure states.
- Check representative routes on desktop and mobile for overflow, spacing, focus states, runtime errors, and reduced-motion behavior.

## Technical Notes
- No contract, ABI, address, or backend changes.
- Existing semantic color tokens remain authoritative; no raw component colors are introduced.
- Contract reads stay on-chain through wagmi and are refreshed after mined receipts.
