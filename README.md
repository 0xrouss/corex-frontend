# Corex Frontend

The frontend is a Next.js 16 / React 19 operator and trader UI for the Corex
TEE stack that lives in the sibling `corex-tee/` project.

It is not a generic mock dashboard. The app is wired to the live Corex runtime
and deployment artifacts in this workspace:

- wallet connectivity uses Reown AppKit + wagmi on Flare testnet
- market metadata and debug state come from the running TEE runtime
- account, orders, and activity reads require short-lived EIP-712 wallet auth
- deposits use the on-chain `CorexInstructionSender` flow
- trade cancel/place and withdraw can use direct EIP-712 intents submitted to
  the TEE through same-origin Next.js API routes

## How It Fits Together

The working local stack looks like this:

```text
wallet
  |
  +--> frontend (Next.js)
         |
         +--> /api/corex/config
         |      reads deployment + env overrides
         |
         +--> /api/corex/account|orders|activity
         |      forwards signed read-auth headers to the TEE runtime
         |
         +--> /api/corex/place-order-intent|cancel-order-intent|withdraw-intent
         |      forwards signed EIP-712 write intents to the TEE runtime
         |
         +--> /api/corex/proxy-result/:instructionId
         |      polls ext-proxy action results for contract-backed writes
         |
         +--> direct browser fetches to GET /markets and GET /state
                on the running TEE runtime
```

The frontend expects `corex-tee` to be the backend source of truth. By default,
server-side config loads:

```text
../corex-tee/config/coston2/corex-deployment.json
```

If that file is missing or stale, the config route fails and the write flows
cannot build typed-data domains correctly.

## Route Map

| Route | Purpose | Requirements |
| --- | --- | --- |
| `/markets` | Public market and token metadata from the TEE runtime | running TEE read API |
| `/trade` | Place and cancel orders, view open orders, switch between contract-backed and direct signed order flow | wallet connected, Corex config loaded |
| `/orders` | Account-scoped order history with status filter | wallet connected, read auth signature |
| `/account` | Per-token available/locked balances plus order and withdraw nonces | wallet connected, read auth signature |
| `/transfer` | Deposit via contract flow, withdraw via contract or direct signed intent, activity preview | wallet connected |
| `/activity` | Deposit and withdraw activity log | wallet connected, read auth signature |
| `/state` | Full serialized runtime state for debugging | `COREX_ENABLE_DEBUG_STATE=true` in the TEE runtime |

## Supported User Flows

### 1. Public discovery

`/markets` loads `GET /markets` directly from the TEE runtime using
`NEXT_PUBLIC_API_URL`.

### 2. Protected reads

`/account`, `/orders`, `/activity`, and the account-aware parts of `/trade` and
`/transfer` request a short-lived EIP-712 signature from the connected wallet.
The frontend caches that authorization briefly in `localStorage`, then forwards
the headers through same-origin Next routes:

- `GET /api/corex/account`
- `GET /api/corex/orders`
- `GET /api/corex/activity`

The TEE validates:

- account address matches the query parameter
- scope is `account-read`
- signature has not expired

### 3. Contract-backed writes

These flows submit on-chain transactions with wagmi, then poll `ext-proxy`
until the TEE action result is available:

- deposit on `/transfer`
- legacy order place/cancel on `/trade`
- legacy withdraw request on `/transfer`

This mode depends on:

- `instructionSender`
- `feeWei`
- the proxy result endpoint exposed by `corex-tee`

### 4. Direct EIP-712 intents

`/trade` and `/transfer` also support direct signed intents. In this mode the
frontend signs typed data in-wallet, then POSTs the payload to the TEE through
same-origin routes:

- `POST /api/corex/place-order-intent`
- `POST /api/corex/cancel-order-intent`
- `POST /api/corex/withdraw-intent`

The toggle is persisted in browser storage under
`corex:direct-eip712-enabled`.

Important behavior:

- direct order intents consume `orderNonce`
- direct withdraw intents consume `withdrawNonce`
- deposit remains contract-backed even when direct mode is enabled

## Quick Start

### 1. Start the backend first

Bring up the sibling TEE stack and make sure these are healthy:

- TEE runtime read API on `http://127.0.0.1:6680`
- ext-proxy on `http://127.0.0.1:6676`
- deployment file at `../corex-tee/config/coston2/corex-deployment.json`

See `../corex-tee/README.md` and `../corex-tee/docs/operator-runbook.md`.

### 2. Configure frontend env

```bash
cp .env.example .env
```

Minimum required value:

```bash
NEXT_PUBLIC_PROJECT_ID=<reown-project-id>
```

Common local values:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://127.0.0.1:6680
COREX_PROXY_URL=http://127.0.0.1:6676
COREX_DEPLOYMENT_FILE=../corex-tee/config/coston2/corex-deployment.json
COREX_FEE_WEI=1000000000000
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Config Reference

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_PROJECT_ID` | client | required Reown / WalletConnect project id |
| `NEXT_PUBLIC_APP_URL` | client | wallet app metadata URL shown during connection |
| `NEXT_PUBLIC_API_URL` | client + server fallback | public TEE read API base URL |
| `COREX_API_URL` | server | server-only override for TEE base URL |
| `COREX_PROXY_URL` | server | ext-proxy base URL for action result polling |
| `NEXT_PUBLIC_COREX_PROXY_URL` | server fallback | optional browser-exposed fallback for proxy base URL |
| `COREX_DEPLOYMENT_FILE` | server | deployment JSON path used to discover chain and contract addresses |
| `COREX_FEE_WEI` | server | default fee attached to contract-backed instruction sends |
| `COREX_INSTRUCTION_SENDER` | server | optional explicit override for instruction sender address |
| `COREX_CUSTODY_ADDRESS` | server | optional explicit override for custody address |
| `COREX_CHAIN_ID` | server | optional explicit override for typed-data chain id |
| `COREX_WITHDRAW_SIGNER_ADDRESS` | server | optional explicit override for displayed authorized signer |
| `COREX_MARKET_ID` | server | optional explicit market id override |
| `COREX_MARKET_ID_BYTES32` | server | optional explicit bytes32 market id override |
| `EXTENSION_ID` | server | optional surfaced extension id from deployment config |

Config precedence is documented in `docs/architecture.md`.

## Repo Layout

| Path | Purpose |
| --- | --- |
| `app/` | route pages and Next.js API handlers |
| `app/api/corex/` | same-origin proxy surface for config, protected reads, direct intents, and proxy polling |
| `components/` | wallet and UI primitives |
| `config/` | Reown / wagmi adapter setup |
| `context/` | AppKit, wagmi, and React Query providers |
| `lib/corex.ts` | typed-data builders, contract ABIs, amount helpers, proxy-result helpers |
| `lib/corex-read-auth.ts` | protected-read EIP-712 auth builder and cache |
| `lib/server/corex-config.ts` | server-side deployment/env resolution |
| `lib/server/corex-read-proxy.ts` | read-auth header forwarding to the TEE runtime |
| `docs/rest-api.md` | frontend-facing route mapping and runtime contract summary |
| `docs/architecture.md` | architecture, config precedence, and write-mode details |

## Operational Constraints

- The TEE read model is in-memory. A restart resets balances, orders, activity,
  and both nonce counters unless the runtime is rebuilt by new instructions.
- `/state` is a debug surface. It is expected to fail unless the backend enables
  it explicitly.
- Protected reads are wallet-bound. If the user changes wallets or the auth
  expires, the frontend must re-sign.
- Direct intents only work when the frontend and TEE agree on `chainId`,
  `instructionSender`, and `custodyAddress`. That is why the deployment JSON is
  load-bearing.

## Troubleshooting

- `Project ID is not defined`
  `NEXT_PUBLIC_PROJECT_ID` is missing.
- `Corex instruction sender is not configured`
  the deployment JSON is missing, unreadable, or does not contain the Corex
  deployment output.
- Account pages return read-auth errors
  the wallet signature expired, the account changed, or the TEE runtime is using
  a different EIP-712 read-auth domain than the frontend expects.
- Contract-backed flows time out waiting for proxy result
  `ext-proxy` is unhealthy, the TEE stack is not processing actions, or the
  instruction id could not be recovered from the receipt.
- Direct intents fail with signature mismatch
  the frontend is signing against stale `chainId`, `instructionSender`, or
  `custodyAddress` config.

## Further Reading

- `docs/architecture.md`
- `docs/rest-api.md`
- `../corex-tee/README.md`
- `../corex-tee/docs/operator-runbook.md`
- `../corex-tee/docs/rest-api.md`
