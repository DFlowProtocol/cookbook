# DFlow Cookbook

A collection of code recipes to get you up and running with DFlow quickly.

## Setup

### Environment Variables

Rename `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

- `DFLOW_TRADE_API_URL` — Trade API URL (if blank, defaults to dev endpoint).
- `DFLOW_PREDICTION_MARKETS_API_URL` — Metadata API URL (if blank, defaults to dev endpoint).
- `DFLOW_API_KEY` — API key (required for WebSocket endpoints).
- `DFLOW_PREDICTION_MARKETS_WS_URL` — Private WebSocket endpoint (required for WebSocket scripts).
- `USER_WALLET_ADDRESS` — Wallet address for the track‑positions script.
- `SOLANA_RPC_URL` — Solana RPC endpoint for signing/submitting transactions.
- `DFLOW_SETTLEMENT_MINT` — Settlement mint for prediction markets (defaults to USDC).

### Solana Private Key

For scripts that require signing transactions, export the `SOLANA_PRIVATE_KEY` environment variable.

Format: Base58 string (e.g., `'YourBase58PrivateKeyHere'`) or JSON array (e.g., `[1,2,3,...]`)

**Note**: The private key contains both the private and public key. You don't need to provide the public key separately.

Example:

```bash
export SOLANA_PRIVATE_KEY='YourBase58PrivateKeyHere'
tsx src/trading/imperative-trade.ts
```

## Proof Demo (Next.js)

The Proof KYC demo lives in `src/proof`. See [Proof README](/src/proof/README.md) for notes.

## Scripts

| Script                                                  | What it does                                                        | Needs `SOLANA_PRIVATE_KEY` | Needs real funds |
| ------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | ---------------- |
| `src/prediction-markets/prediction-market-lifecycle.ts` | Finds a market, prints its orderbook, buys 1 contract, and sells it | Yes                        | Yes (minimum)    |
| `src/prediction-markets/discover-prediction-markets.ts` | Fetches and prints events, markets, tags, and series                | No                         | No               |
| `src/prediction-markets/track-user-positions.ts`        | Reads wallet token accounts and maps outcome positions              | No                         | No               |
| `src/trading/imperative-trade.ts`                       | GET `/order`, sign, and submit to Solana RPC                        | Yes                        | Yes              |
| `src/trading/declarative-trade.ts`                      | Request a quote, sign, submit, and monitor a trade intent           | Yes                        | Yes              |
| `src/websockets/prices.ts`                              | WebSocket price updates                                             | No                         | No               |
| `src/websockets/trades.ts`                              | WebSocket trade updates                                             | No                         | No               |
| `src/websockets/orderbook.ts`                           | WebSocket orderbook updates                                         | No                         | No               |
| `src/websockets/all-channels.ts`                        | WebSocket prices + trades + orderbook                               | No                         | No               |

> [!INFO]
> To run any script, use `tsx path/to/script.ts`. Trading scripts and the lifecycle script submit transactions, so you’ll need `SOLANA_PRIVATE_KEY` and a wallet funded with the settlement mint (default USDC). These demos use the minimum size possible (1 contract), so costs are mostly Solana fees plus the contract price.
>
> WebSocket scripts require a private endpoint and API key. Request access at https://pond.dflow.net/build/api-key.

### WebSocket Examples

Set these env vars (no defaults):

- `DFLOW_PREDICTION_MARKETS_WS_URL`
- `DFLOW_API_KEY`
- `DFLOW_WS_TICKERS` (optional, comma-separated list of market tickers)

Run examples:

```bash
tsx src/websockets/prices.ts
tsx src/websockets/trades.ts
tsx src/websockets/orderbook.ts
tsx src/websockets/all-channels.ts
```

The API key is sent in the `x-api-key` header during the WebSocket handshake.

### CLI Helper

`src/index.ts` is a small CLI that lists available scripts and can run them by name.

```bash
# list scripts
npm run dev

# run a script (dev)
npm run dev -- run imperative-trade
# run a websocket script
npm run dev -- run ws-prices

# after build
npm run build
npm start -- run imperative-trade
```
