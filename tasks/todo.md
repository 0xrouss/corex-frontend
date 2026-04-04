# Deposit / Withdraw Page

## Plan

- [x] Confirm the Corex deposit and withdraw flow from `fce-weather-api` contracts, runtime handlers, and proxy polling semantics.
- [x] Add frontend contract configuration and minimal ABIs for `CorexCustody`, `CorexInstructionSender`, and ERC-20 approval.
- [x] Add client helpers for deployment-derived metadata, proxy result polling, hex/JSON decoding, and amount parsing.
- [x] Implement a new frontend page that supports:
  - [x] token selection from runtime metadata
  - [x] deposit flow: approve -> custody deposit -> TEE sync
  - [x] withdraw flow: request withdraw -> proxy poll -> custody finalize
  - [x] inline status, errors, and result summaries
- [x] Add the new page to the main navigation and keep styling consistent with the existing frontend surfaces.
- [x] Verify with lint/build or the closest available checks, then record results and any limits.

## Review

- Added `/transfer` with a combined deposit + withdraw workflow driven by the actual Corex custody, instruction sender, and proxy result flow.
- Added server routes so the frontend can read `fce-weather-api` deployment config and poll proxy results without browser CORS assumptions.
- Verification:
  - `npx eslint app/transfer/page.tsx app/api/corex/config/route.ts app/api/corex/proxy-result/[instructionId]/route.ts lib/api.ts lib/corex.ts lib/server/corex-config.ts components/navbar.tsx`
  - `npx tsc --noEmit`
  - `npm run lint` still fails on pre-existing React effect-rule violations in `app/account/page.tsx`, `app/activity/page.tsx`, and `app/orders/page.tsx`.

---

# Task: Surface balances inside transfer page

## Plan

- [x] Reuse the existing account snapshot already loaded by `/transfer`.
- [x] Add a clear balance summary above the deposit/withdraw forms in the existing page style.
- [x] Show the selected token's current available/locked balance inside each action preview.
- [x] Verify the page with targeted lint and typecheck.

## Review

- Added a full-width `Your TEE Balances` section to `/transfer` so the user can see tracked balances without switching to `/account`.
- Added selected-token balance cues to both previews:
  - deposit now shows current available + locked balance before the raw-amount preview
  - withdraw now shows both available and locked amounts for the selected token
- Verification:
  - `npx eslint app/transfer/page.tsx`
  - `npx tsc --noEmit`

---

# Task: Surface on-chain wallet balance for deposits

## Plan

- [x] Read the selected deposit token balance from chain with the existing wagmi public client.
- [x] Show that wallet balance directly inside the deposit preview so the user can see how much is available to deposit.
- [x] Refresh the displayed on-chain balance after a successful deposit.
- [x] Verify the page with targeted lint and typecheck.

## Review

- Added an on-chain `balanceOf(address)` read for the currently selected deposit token in `/transfer`.
- Deposit preview now distinguishes:
  - wallet balance on-chain available to deposit
  - current TEE available/locked balance after prior synced deposits
- The on-chain wallet balance refreshes after a successful `depositAndSync()` so the panel reflects the post-deposit source balance.
- Verification:
  - `npx eslint app/transfer/page.tsx`
  - `npx tsc --noEmit`

---

# Task: Fix frontend instruction-id extraction for withdraw and deposit

## Plan

- [x] Load the live TEE registry address from `CorexInstructionSender` in the frontend.
- [x] Use that registry address when extracting instruction ids from mined receipts instead of relying on log position.
- [x] Keep the existing parser path first and use the registry-address log match as the robust fallback.
- [x] Verify the updated transfer page and helper with targeted lint and typecheck.

## Review

- Added `teeExtensionRegistry()` to the frontend instruction-sender ABI and read it alongside `getSelectedTeeIds()` in `/transfer`.
- Updated receipt extraction to match logs emitted by the actual registry address when ABI event parsing does not yield an instruction id.
- This removes the brittle `requestWithdraw`/`depositAndSync` dependence on the registry event being the last log in the receipt.
- Verification:
  - `npx eslint app/transfer/page.tsx lib/corex.ts`
  - `npx tsc --noEmit`

---

# Task: Switch withdraw flow to offchain EIP-712 POST API

## Plan

- [x] Confirm the exact `POST /withdraw-intent` request/response contract and EIP-712 domain/type from `fce-weather-api`.
- [x] Add frontend helpers and a same-origin Next route for submitting signed withdraw intents.
- [x] Replace `/transfer` withdraw from `requestWithdraw() -> proxy poll -> finalizeWithdraw()` to `sign typed data -> POST /withdraw-intent`.
- [x] Update the withdraw copy, previews, and success state so the UI reflects TEE-submitted finalization.
- [x] Verify with targeted lint and typecheck, then record results and any limits.

## Review

- Added a same-origin `POST /api/corex/withdraw-intent` route that forwards the signed payload to the TEE runtime using the configured Corex API base URL.
- Added shared frontend EIP-712 helpers for the `WithdrawIntent` domain and response typing so the page signs the exact backend contract instead of reconstructing it inline.
- Updated `/transfer` withdraw to:
  - sign the intent in-wallet with nonce `account.withdrawNonce + 1`
  - submit the signed payload over REST
  - treat the returned `finalizeTxHash` as the settlement artifact
  - refresh account/activity after the TEE completes on-chain finalization
- Deposit remains on the existing `approve -> depositAndSync -> proxy poll` path.
- Verification:
  - `npx eslint app/transfer/page.tsx app/api/corex/withdraw-intent/route.ts lib/api.ts lib/corex.ts lib/server/corex-config.ts`
  - `npx tsc --noEmit`

---

# Task: Rename displayed Corex tokens to FXRP / USDT0

## Plan

- [x] Confirm whether the frontend gets token labels dynamically from the TEE or still carries any hardcoded mock labels in docs/fixtures.
- [x] Update frontend-facing docs or fixtures that still show the old mock token names and symbols.
- [x] Verify there are no stale `CBASE` / `CQUOTE` references left in the frontend surfaces that matter to users.

## Review

- Confirmed the frontend UI is already data-driven from the TEE `/markets` response, so the live rename lands through the TEE metadata without needing React component changes.
- Updated the frontend REST API documentation example to show `FXRP` and `USDT0` instead of the old mock token labels.
- Verification:
  - `rg -n "Corex Base Test Token|Corex Quote Test Token|CBASE|CQUOTE|\"Base\", \"BASE\"|\"Quote\", \"QUOTE\"" fce-weather-api frontend -g '!**/node_modules/**' -g '!**/.next/**' -g '!**/tasks/**'`
