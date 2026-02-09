# Proof Demo (Next.js)

This demo shows the full Proof KYC flow with [Phantom Connect](https://phantom.com/connect):

1. Connect wallet
2. Sign the Proof message
3. Open the Proof portal
4. Verify status on callback

## What is Proof?

[Proof](https://pond.dflow.net/learn/proof) is an identity verification service that links verified real-world identities
to Solana wallets. Partner apps can redirect users to Proof for KYC and then check
verification status via the Proof API.

## Page breakdown

### `app/page.tsx`

- Overview + Builder Details sections (message format, redirect URL, verify endpoint, Proof portal).
- Step 1: Connect/Disconnect wallet via Phantom.
- Step 2: **PROOF interaction:** signs the Proof message and **builds the Proof deep link**.
- Step 3: **PROOF interaction:** opens the Proof portal in a new tab.
- Step 4: **PROOF interaction:** calls the Proof verification API to check wallet status.

### `app/callback/page.tsx`

- Reads the wallet address from `redirect_uri` query params or local storage.
- **PROOF interaction:** calls the Proof verification API to show verified/unverified status.

## Prerequisites

Get a Phantom Connect App ID from https://phantom.com/portal and allowlist your
`NEXT_PUBLIC_PHANTOM_REDIRECT_URL`.

## Setup

```bash
cd src/proof
cp .env.example .env.local
npm install
npm run dev
```

## Environment variables

- `NEXT_PUBLIC_PHANTOM_APP_ID` — Phantom Portal app ID
- `NEXT_PUBLIC_PHANTOM_REDIRECT_URL` — Callback URL (allowlist in Phantom Portal)
- `NEXT_PUBLIC_PROOF_PORTAL_URL` — Proof portal base URL
- `NEXT_PUBLIC_PROOF_VERIFY_URL` — Proof verify base URL

## Notes

- Supports embedded wallets (Google/Apple) and injected Phantom.
- The Proof portal handles document upload; this demo only links to it.
- "Open Proof portal" opens the deep link in a new tab.
