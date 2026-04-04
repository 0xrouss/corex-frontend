# Corex Read API

This document describes the REST endpoints exposed by the running Corex TEE
extension for frontend reads.

These endpoints are served by the extension runtime itself, not by the smart
contracts and not by `ext-proxy`.

## Base URL

Local default:

```text
http://127.0.0.1:6680
```

This bind is controlled by `EXTENSION_API_BIND` in `.env`.

Example:

```bash
EXTENSION_API_BIND="127.0.0.1:6680"
```

## CORS

The runtime sets:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

The allowed origin is controlled by `READ_API_ALLOW_ORIGIN` in `.env`.

Example:

```bash
READ_API_ALLOW_ORIGIN="*"
```

## Important Runtime Constraint

This API reads directly from the TEE runtime's in-memory Corex state.

What that means:

- completed orders remain visible with status `FILLED` or `CANCELED`
- active orders remain visible with status `OPEN` or `PARTIAL`
- if the `extension-tee` container restarts, this read model resets
- after a restart, old orders and balances are not persisted unless the state is
  rebuilt through new instructions

Frontend implication:

- treat this API as the live session view of the TEE
- do not assume it is a durable historical source

## Endpoints

### `GET /account`

Returns balances and withdraw nonce for one account.

Query params:

- `account` required, EVM address

Example:

```bash
curl "http://127.0.0.1:6680/account?account=0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb"
```

Response:

```json
{
  "account": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
  "balances": {
    "0xb2b08fadf30c557425a110af97d5ba6cc91800c9": {
      "available": "98",
      "locked": "2"
    },
    "0xaf58512c92ca0c6c1a20f22c6ce43e71fb71183f": {
      "available": "980",
      "locked": "20"
    }
  },
  "withdrawNonce": "1"
}
```

Field notes:

- `balances` is keyed by token address
- `available` and `locked` are decimal strings
- `withdrawNonce` is a decimal string
- if the account has no balances yet, `balances` is an empty object and
  `withdrawNonce` is `"0"`

Errors:

- missing `account`:

```json
{"error":"missing required query parameter: account"}
```

- invalid `account`:

```json
{"error":"invalid account"}
```

### `GET /orders`

Returns all known orders for one account.

Query params:

- `account` required, EVM address
- `status` optional

Supported `status` values:

- `OPEN`
- `PARTIAL`
- `FILLED`
- `CANCELED`

Examples:

```bash
curl "http://127.0.0.1:6680/orders?account=0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb"
```

```bash
curl "http://127.0.0.1:6680/orders?account=0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb&status=OPEN"
```

Response:

```json
{
  "account": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
  "orders": [
    {
      "orderId": "0xdef18ae8ee22fc8c52298c4f4e84d55f7b8f567be7e5f8629d6c369ee12d93b1",
      "clientOrderId": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "user": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
      "marketId": "0x434f524558544553540000000000000000000000000000000000000000000000",
      "side": "SELL",
      "price": "10",
      "initialQty": "2",
      "remainingQty": "0",
      "lockedAmount": "0",
      "status": "FILLED",
      "seq": "4",
      "timeInForce": "GTC"
    }
  ]
}
```

Field notes:

- all numeric values are decimal strings
- `marketId` is the internal `bytes32`-style hex string stored by the runtime
- orders are returned in descending sequence order
- completed orders are still included; they are not removed from the response
  during normal runtime

Errors:

- missing `account`:

```json
{"error":"missing required query parameter: account"}
```

- invalid `account`:

```json
{"error":"invalid account"}
```

## Internal Debug Route

### `GET /state`

This route returns the full serialized Corex runtime state. It is useful for
debugging, but it is broader than what the frontend should normally consume.

Example:

```bash
curl "http://127.0.0.1:6680/state"
```

Notes:

- response shape is:

```json
{
  "stateVersion": "0x...",
  "state": {
    "version": "v1",
    "market": {},
    "globalSeq": "0",
    "balances": {},
    "appliedDeposits": {},
    "orders": {},
    "bidOrderIds": [],
    "askOrderIds": [],
    "withdrawNonces": {},
    "eventLog": [],
    "signPort": "9090"
  }
}
```

- `state` includes market config, balances, deposits, orders, book ids,
  withdraw nonces, and event log
- this is also memory-backed and resets on runtime restart

## Current Scope

The frontend-facing read API currently supports:

- account balances and withdraw nonce
- orders by account
- market and token metadata
- user deposit and withdraw activity

It does not yet expose:

- direct `GET /order?orderId=...`
- pagination
- durable historical queries
- websocket subscriptions

### `GET /markets`

Returns the active Corex market metadata and token metadata exposed by the
running runtime.

Example:

```bash
curl "http://127.0.0.1:6680/markets"
```

Response:

```json
{
  "markets": [
    {
      "marketId": "COREXTEST",
      "marketIdBytes32": "0x434f524558544553540000000000000000000000000000000000000000000000",
      "baseToken": "0xb2b08fadf30c557425a110af97d5ba6cc91800c9",
      "quoteToken": "0xaf58512c92ca0c6c1a20f22c6ce43e71fb71183f",
      "baseDecimals": 18,
      "quoteDecimals": 6
    }
  ],
  "tokens": [
    {
      "address": "0xb2b08fadf30c557425a110af97d5ba6cc91800c9",
      "name": "FXRP",
      "symbol": "FXRP",
      "decimals": 18,
      "role": "BASE"
    },
    {
      "address": "0xaf58512c92ca0c6c1a20f22c6ce43e71fb71183f",
      "name": "USDT0",
      "symbol": "USDT0",
      "decimals": 6,
      "role": "QUOTE"
    }
  ]
}
```

Field notes:

- `marketId` is the human-readable market id when available from deployment
  config
- `marketIdBytes32` is the on-chain/runtime bytes32 representation
- token `name` and `symbol` are present when available from the deployment JSON

### `GET /activity`

Returns deposit and withdraw activity for one account.

Query params:

- `account` required, EVM address

Example:

```bash
curl "http://127.0.0.1:6680/activity?account=0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb"
```

Response:

```json
{
  "account": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
  "deposits": [
    {
      "depositId": "0x8888888888888888888888888888888888888888888888888888888888888888",
      "user": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
      "token": "0xaf58512c92ca0c6c1a20f22c6ce43e71fb71183f",
      "amount": "50",
      "seq": "2"
    }
  ],
  "withdrawals": [
    {
      "user": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
      "token": "0xaf58512c92ca0c6c1a20f22c6ce43e71fb71183f",
      "amount": "5",
      "recipient": "0x00000000000000000000000000000000000000c3",
      "withdrawNonce": "1",
      "authorizedSigner": "0x54f5a7a1d0d37bdc4d1db58675b955bd6cd4c1fb",
      "authorizationDigest": "0x...",
      "teeAuth": "0x...",
      "seq": "3"
    }
  ]
}
```

Field notes:

- `deposits` are derived from the runtime's applied deposit map
- `withdrawals` are derived from the runtime event log
- both lists are returned in descending sequence order
- withdrawals only represent requests that were accepted by the TEE runtime

Errors:

- missing `account`:

```json
{"error":"missing required query parameter: account"}
```

- invalid `account`:

```json
{"error":"invalid account"}
```
