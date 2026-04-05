# Frontend Architecture

This document explains how the frontend is wired to the Corex TEE stack in
this workspace.

## Design Goals

- keep browser code simple and typed against the live Corex contract
- avoid hardcoding deployment addresses into page components
- use same-origin Next.js routes for flows that need server-side config or
  header forwarding
- support both contract-backed writes and direct signed intent writes without
  duplicating all page logic

## Runtime Boundaries

| Surface | Lives in | Responsibility |
| --- | --- | --- |
| React pages | `app/**/page.tsx` | render screens, request signatures, submit actions |
| Next.js API routes | `app/api/corex/**` | proxy selected backend calls and hide server-only config |
| Shared Corex helpers | `lib/corex.ts` | ABIs, typed-data builders, parsing helpers, amount conversion |
| Read auth helper | `lib/corex-read-auth.ts` | build and cache signed `ReadAuthorization` payloads |
| Server config loader | `lib/server/corex-config.ts` | load deployment JSON and env overrides |
| TEE runtime | `../corex-tee/go` | execute reads, verify intents, submit withdraw finalization |
| ext-proxy | `../corex-tee/docker-compose.yaml` | expose `/action/result/:instructionId` for contract-backed writes |

## Config Resolution

The frontend does not assume fixed deployment addresses. It resolves them at
request time through `loadCorexFrontendConfig()`.

### Deployment file default

If `COREX_DEPLOYMENT_FILE` is unset, the server looks for:

```text
../corex-tee/config/coston2/corex-deployment.json
```

### Precedence

For values such as `instructionSender`, `custodyAddress`, `chainId`, and market
ids, the server uses:

1. explicit env override
2. deployment JSON
3. hardcoded fallback when one exists

Important examples:

- `COREX_INSTRUCTION_SENDER` overrides deployment JSON
- `COREX_CUSTODY_ADDRESS` overrides deployment JSON
- `COREX_CHAIN_ID` overrides deployment JSON, otherwise falls back to `114`
- `COREX_API_URL` overrides `NEXT_PUBLIC_API_URL`
- `COREX_PROXY_URL` overrides `NEXT_PUBLIC_COREX_PROXY_URL`

The frontend pages fetch `/api/corex/config`, not the deployment JSON directly.

## Read Paths

### Public reads

These browser requests go directly to the TEE runtime base URL:

- `GET /markets`
- `GET /state`

This is handled in `lib/api.ts` with `NEXT_PUBLIC_API_URL`.

### Protected reads

Account-scoped reads go through same-origin Next.js routes because they need
signed headers and should not duplicate proxy logic in every page:

| Frontend route | Upstream TEE route |
| --- | --- |
| `GET /api/corex/account` | `GET /account` |
| `GET /api/corex/orders` | `GET /orders` |
| `GET /api/corex/activity` | `GET /activity` |

The signed header contract is:

- `X-Corex-Read-Account`
- `X-Corex-Read-Scope`
- `X-Corex-Read-Expires`
- `X-Corex-Read-Signature`

The EIP-712 read-auth domain is fixed:

- `name = "Corex TEE"`
- `version = "1"`

The current scope is fixed to `account-read`.

## Write Paths

### Contract-backed mode

The browser submits an on-chain transaction with wagmi:

1. user confirms wallet transaction
2. frontend waits for the transaction receipt
3. frontend extracts the TEE instruction id from the registry event
4. frontend polls `/api/corex/proxy-result/:instructionId`
5. the Next route polls `ext-proxy` until the TEE action settles

This is still the only deposit path.

### Direct signed-intent mode

The browser signs EIP-712 typed data, then posts JSON to a same-origin route.

| Frontend route | Upstream TEE route | Verifying contract |
| --- | --- | --- |
| `POST /api/corex/place-order-intent` | `POST /place-order-intent` | `instructionSender` |
| `POST /api/corex/cancel-order-intent` | `POST /cancel-order-intent` | `instructionSender` |
| `POST /api/corex/withdraw-intent` | `POST /withdraw-intent` | `custodyAddress` |

The typed-data domain for direct intents is:

- `name = "Corex"`
- `version = "1"`
- `chainId = config.chainId`
- `verifyingContract = instructionSender` for order intents
- `verifyingContract = custodyAddress` for withdraw intents

## Nonce Model

The frontend relies on runtime nonce counters exposed by `GET /account`:

- `orderNonce` for direct place/cancel order intents
- `withdrawNonce` for direct withdraw intents

The next usable nonce is always `current + 1`.

Contract-backed order and withdraw flows do not consume these direct-intent
nonces, but they still mutate the same in-memory state and balances.

## Page Responsibilities

| Page | Core responsibilities |
| --- | --- |
| `/markets` | public market/token inspection |
| `/trade` | market view, signed protected reads, place/cancel actions, direct-mode toggle |
| `/orders` | protected account order history |
| `/account` | protected balance view and nonce display |
| `/transfer` | deposits, withdraws, activity preview, direct-mode toggle |
| `/activity` | protected deposit and withdrawal history |
| `/state` | raw debug dump of runtime state |

## Persistence and Local State

- the direct-mode preference is stored in `localStorage` under
  `corex:direct-eip712-enabled`
- read auth is cached briefly in `localStorage` under `corex-read-auth:v2:*`
- wallet connection state is managed by wagmi / AppKit cookie storage

## Known Constraints

- the runtime read model is session state, not durable history
- stale deployment JSON breaks typed-data verification
- `NEXT_PUBLIC_API_URL` must be browser-reachable from the machine running the
  frontend
- `/state` is intentionally dangerous and should stay a debug-only path

## Related Docs

- `rest-api.md`
- `../README.md`
- `../../corex-tee/docs/rest-api.md`
- `../../corex-tee/docs/architecture.md`
