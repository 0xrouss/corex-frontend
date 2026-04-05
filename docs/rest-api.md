# Frontend API Surface

This document explains the API contract as the frontend sees it.

The canonical runtime API is documented in `../../corex-tee/docs/rest-api.md`.
This frontend-specific note focuses on:

- which requests go straight to the TEE runtime
- which requests are proxied through Next.js
- which requests require wallet signatures

## Base URLs

### Browser-visible TEE runtime URL

By default the frontend reads public runtime endpoints from:

```text
http://127.0.0.1:6680
```

Configured through:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:6680
```

### Same-origin Next.js routes

The frontend also exposes internal API routes under:

```text
/api/corex/*
```

These are used whenever the browser should not know about server-side config or
when the frontend needs consistent proxy behavior.

## Route Mapping

| Frontend call | Upstream target | Why it exists |
| --- | --- | --- |
| `GET /api/corex/config` | deployment JSON + env, no direct upstream | resolve chain and contract config on the server |
| `GET /api/corex/account` | `GET /account` | forward signed read-auth headers |
| `GET /api/corex/orders` | `GET /orders` | forward signed read-auth headers |
| `GET /api/corex/activity` | `GET /activity` | forward signed read-auth headers |
| `POST /api/corex/place-order-intent` | `POST /place-order-intent` | same-origin proxy for direct order intent |
| `POST /api/corex/cancel-order-intent` | `POST /cancel-order-intent` | same-origin proxy for direct cancel intent |
| `POST /api/corex/withdraw-intent` | `POST /withdraw-intent` | same-origin proxy for direct withdraw intent |
| `GET /api/corex/proxy-result/:instructionId` | `GET http://127.0.0.1:6676/action/result/:instructionId` | poll ext-proxy for contract-backed writes |

## Public Browser Reads

These requests are made directly from the browser to `NEXT_PUBLIC_API_URL`:

- `GET /markets`
- `GET /state`

Notes:

- `/markets` is expected to be public
- `/state` is debug-only and may fail unless the runtime enables it

## Protected Browser Reads

These reads require a short-lived wallet signature and go through same-origin
Next routes:

- account snapshot
- order list
- activity list

The frontend signs the EIP-712 type:

```text
ReadAuthorization(
  address account,
  string scope,
  uint256 expiresAt
)
```

Domain:

- `name = "Corex TEE"`
- `version = "1"`

Current scope:

- `account-read`

Headers forwarded by the Next routes:

- `X-Corex-Read-Account`
- `X-Corex-Read-Scope`
- `X-Corex-Read-Expires`
- `X-Corex-Read-Signature`

## Direct Signed Intents

When direct mode is enabled in `/trade` or `/transfer`, the frontend signs
EIP-712 typed data and POSTs it to same-origin routes.

### Order intents

Use:

- `POST /api/corex/place-order-intent`
- `POST /api/corex/cancel-order-intent`

Domain:

- `name = "Corex"`
- `version = "1"`
- `chainId = /api/corex/config.chainId`
- `verifyingContract = /api/corex/config.instructionSender`

### Withdraw intent

Use:

- `POST /api/corex/withdraw-intent`

Domain:

- `name = "Corex"`
- `version = "1"`
- `chainId = /api/corex/config.chainId`
- `verifyingContract = /api/corex/config.custodyAddress`

### Nonces

The frontend reads nonces from `GET /api/corex/account`:

- `orderNonce` for place/cancel
- `withdrawNonce` for withdraw

The next signed nonce is always `current + 1`.

## Contract-Backed Writes

Contract-backed mode still exists for:

- deposits
- legacy place/cancel order flow
- legacy withdraw flow

Those flows use wagmi to submit the on-chain transaction, then call:

```text
GET /api/corex/proxy-result/:instructionId
```

The Next route polls `ext-proxy` until the TEE action result is available or
times out.

## Common Failure Modes

- `Project ID is not defined`
  wallet-connect config is missing.
- `Corex instruction sender is not configured`
  the server could not load deployment config.
- read auth rejected
  the wallet changed, the signature expired, or the account/header mismatch was
  detected by the runtime.
- direct intent rejected
  the frontend signed against stale `chainId`, `instructionSender`, or
  `custodyAddress`.
- proxy polling timeout
  the on-chain transaction landed but the runtime or `ext-proxy` did not return
  a settled action result in time.

## Related Docs

- `architecture.md`
- `../README.md`
- `../../corex-tee/docs/rest-api.md`
