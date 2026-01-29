/**
 * Prediction Market Lifecycle (API Demo)
 *
 * Goal: find a market with volume > 1m using the Metadata API.
 */

import "dotenv/config";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
// @ts-ignore - bs58 types not available but package exists
import bs58 from "bs58";

const API_KEY = process.env.DFLOW_API_KEY;
const METADATA_API_BASE_URL =
  process.env.DFLOW_PREDICTION_MARKETS_API_URL ||
  "https://dev-prediction-markets-api.dflow.net";
const TRADE_API_BASE_URL =
  process.env.DFLOW_TRADE_API_URL || "https://dev-quote-api.dflow.net";
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const MIN_VOLUME = 1_000_000;
const MAX_TRADE_AMOUNT =
  Number(process.env.DFLOW_MAX_TRADE_AMOUNT ?? "1000000"); // 1 USDC (6 decimals)
const SLIPPAGE_BPS = Number(process.env.DFLOW_SLIPPAGE_BPS ?? "50");
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SETTLEMENT_MINT =
  process.env.DFLOW_SETTLEMENT_MINT || DEFAULT_USDC_MINT;

type MarketAccount = {
  yesMint?: string;
  noMint?: string;
};

type Market = {
  ticker?: string;
  title?: string;
  status?: string;
  volume?: number;
  accounts?: Record<string, MarketAccount>;
};

type Event = {
  ticker?: string;
  title?: string;
  markets?: Market[];
};

// Demo-style parsing: production code should validate response schemas.
async function getEvents(): Promise<Event[]> {
  const response = await fetch(
    `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&limit=200`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `Events request failed: ${response.status} ${response.statusText}`,
      errorText ? `| ${errorText}` : ""
    );
    return [];
  }

  const bodyText = await response.text();

  if (!bodyText) {
    console.error("Events request returned an empty body.");
    return [];
  }

  const data = JSON.parse(bodyText) as { events?: Event[] };
  const events = data.events ?? [];
  console.log(`Events returned: ${events.length}`);
  return events;
}

function getMarketsForEvent(event: Event): Market[] {
  return event.markets ?? [];
}

async function getOrderbookForMaket(market: Market): Promise<any> {
  const response = await fetch(
    `${METADATA_API_BASE_URL}/api/v1/orderbook/${market.ticker}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `Orderbook request failed: ${response.status} ${response.statusText}`,
      errorText ? `| ${errorText}` : ""
    );
    return null;
  }

  const bodyText = await response.text();
  if (!bodyText) {
    console.error("Orderbook request returned an empty body.");
    return null;
  }

  return JSON.parse(bodyText);
}

function getKeypair(): Keypair {
  const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
  // Demo only: never log keys; use secure key management in production.

  if (!privateKeyStr) {
    throw new Error(
      "SOLANA_PRIVATE_KEY environment variable is required.\n" +
        "Format: Base58 string or JSON array, e.g., [1,2,3,...]"
    );
  }

  if (privateKeyStr.trim().startsWith("[")) {
    const secretKey = new Uint8Array(JSON.parse(privateKeyStr));
    return Keypair.fromSecretKey(secretKey);
  }

  const secretKey = bs58.decode(privateKeyStr);
  return Keypair.fromSecretKey(secretKey);
}

function getOutcomeMintForMarket(
  market: Market,
  side: "yes" | "no",
  settlementMint: string
): string | null {
  const accounts = market.accounts ?? {};
  const preferredAccount = accounts[settlementMint];
  const fallbackAccount = Object.values(accounts)[0];
  const account = preferredAccount ?? fallbackAccount;

  if (!account) return null;
  return side === "yes" ? account.yesMint ?? null : account.noMint ?? null;
}

function getTopActiveMarket(markets: Market[]): Market | null {
  const activeMarkets = markets.filter((m) => m.status === "active");
  return activeMarkets.reduce<Market | null>((best, current) => {
    if (!best) return current;
    const bestVolume = Number(best.volume ?? 0);
    const currentVolume = Number(current.volume ?? 0);
    return currentVolume > bestVolume ? current : best;
  }, null);
}

async function fetchOrder(params: {
  userPublicKey: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}): Promise<{
  transaction?: string;
  inAmount?: string;
  outAmount?: string;
  errorCode?: string;
} | null> {
  const queryParams = new URLSearchParams();
  queryParams.append("inputMint", params.inputMint);
  queryParams.append("outputMint", params.outputMint);
  queryParams.append("amount", params.amount.toString());
  queryParams.append("slippageBps", params.slippageBps.toString());
  queryParams.append("userPublicKey", params.userPublicKey);

  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }

  const response = await fetch(
    `${TRADE_API_BASE_URL}/order?${queryParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText) as { msg?: string; code?: string };
      console.error(
        `Order request failed: ${response.status} ${response.statusText}`,
        parsed.msg ? `| ${parsed.msg}` : ""
      );
      return { errorCode: parsed.code ?? "request_failed" };
    } catch {
      const isZeroOut = errorText.toLowerCase().includes("zero out amount");
      console.error(
        `Order request failed: ${response.status} ${response.statusText}`,
        errorText ? `| ${errorText}` : ""
      );
      return { errorCode: isZeroOut ? "zero_out_amount" : "request_failed" };
    }
  }

  return (await response.json()) as { transaction: string };
}

async function sendTransaction(
  connection: Connection,
  tx: VersionedTransaction
) {
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });

  console.log(`Transaction sent: ${signature}`);
  await connection.confirmTransaction(signature, "confirmed");
  console.log("Transaction confirmed");
}

async function executeOrderForMarket(
  market: Market,
  orderbook: any,
  connection: Connection,
  keypair: Keypair
): Promise<string | null> {
  const yesBidsMap = orderbook?.yes_bids ?? {};
  const noBidsMap = orderbook?.no_bids ?? {};

  const yesPrices = Object.keys(yesBidsMap)
    .map(Number)
    .filter((price) => Number.isFinite(price) && price > 0);
  const noPrices = Object.keys(noBidsMap)
    .map(Number)
    .filter((price) => Number.isFinite(price) && price > 0);

  const yesBestBid = yesPrices.length ? Math.max(...yesPrices) : null;
  const noBestBid = noPrices.length ? Math.max(...noPrices) : null;

  if (yesBestBid === null && noBestBid === null) {
    console.log("Orderbook is empty. Cannot price a 1-contract buy.");
    return null;
  }

  const side: "yes" | "no" =
    yesBestBid !== null && noBestBid !== null
      ? yesBestBid <= noBestBid
        ? "yes"
        : "no"
      : yesBestBid !== null
        ? "yes"
        : "no";

  const outputMint = getOutcomeMintForMarket(market, side, SETTLEMENT_MINT);
  if (!outputMint) {
    console.log("No outcome mint found for market.");
    return null;
  }

  // Demo values: make these configurable and validate in production.
  const maxAmount = MAX_TRADE_AMOUNT;
  const slippageBps = SLIPPAGE_BPS;

  console.log(
    `Requesting order for 1 contract (${side.toUpperCase()} @ best bid)...`
  );
  console.log(`Outcome mint: ${outputMint}`);
  const estimate = await fetchOrder({
    userPublicKey: keypair.publicKey.toBase58(),
    inputMint: SETTLEMENT_MINT,
    outputMint,
    amount: maxAmount,
    slippageBps,
  });

  const estimateOut = Number(estimate?.outAmount ?? 0);
  const estimateIn = Number(estimate?.inAmount ?? maxAmount);
  if (!estimateOut) {
    return null;
  }

  const scaledAmount = Math.ceil((1_000_000 * estimateIn) / estimateOut);
  if (scaledAmount > maxAmount) {
    console.log("1 contract costs more than 1 USDC. Skipping trade.");
    return null;
  }

  const order = await fetchOrder({
    userPublicKey: keypair.publicKey.toBase58(),
    inputMint: SETTLEMENT_MINT,
    outputMint,
    amount: scaledAmount,
    slippageBps,
  });

  if (!order?.transaction) {
    return null;
  }

  if (Number(order.outAmount) !== 1_000_000) {
    console.log("Order did not return exactly 1 contract. Skipping trade.");
    return null;
  }

  const inAmountUsdc = scaledAmount / 1_000_000;
  console.log(`Estimated cost: ${inAmountUsdc} USDC`);

  console.log("Order received, signing transaction...");
  const transactionBuffer = Buffer.from(order.transaction, "base64");
  const tx = VersionedTransaction.deserialize(transactionBuffer);
  tx.sign([keypair]);

  console.log("Submitting transaction to Solana...");
  await sendTransaction(connection, tx);
  return outputMint;
}

async function sellOutcomeToken(
  outcomeMint: string,
  connection: Connection,
  keypair: Keypair
) {
  // Demo values: make these configurable and validate in production.
  const amount = 1_000_000; // 1 contract (6 decimals)
  const slippageBps = SLIPPAGE_BPS;

  console.log("Requesting order to sell 1 contract...");
  const order = await fetchOrder({
    userPublicKey: keypair.publicKey.toBase58(),
    inputMint: outcomeMint,
    outputMint: SETTLEMENT_MINT,
    amount,
    slippageBps,
  });

  if (!order?.transaction) {
    return;
  }

  console.log("Order received, signing transaction...");
  const transactionBuffer = Buffer.from(order.transaction, "base64");
  const tx = VersionedTransaction.deserialize(transactionBuffer);
  // Demo only: validate transaction contents before signing in production.
  tx.sign([keypair]);

  console.log("Submitting transaction to Solana...");
  await sendTransaction(connection, tx);
}

async function main() {
  console.log(`Using endpoint: ${METADATA_API_BASE_URL}`);
  console.log(`Looking for a market with volume > ${MIN_VOLUME.toLocaleString()}`);

  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const keypair = getKeypair();

  const events = await getEvents();

  for (const event of events) {
    const markets = getMarketsForEvent(event);

    for (const market of markets) {
      const volume = Number(market.volume ?? 0);

      console.log(`Volume: ${volume}`);
      console.table([
        {
          eventTicker: event.ticker,
          eventTitle: event.title,
          marketTicker: market.ticker,
          marketTitle: market.title,
          status: market.status,
          volume,
        },
      ]);

      if (volume > MIN_VOLUME) {
        console.log("Found market with volume > 1m:", market.ticker);
        console.log(`Markets for event: ${event.ticker ?? "unknown"}`);
        console.table(
          markets.map((m) => ({
            marketTicker: m.ticker,
            marketTitle: m.title,
            status: m.status,
            volume: Number(m.volume ?? 0),
          }))
        );

        const topMarket = getTopActiveMarket(markets);

        if (!topMarket) {
          console.log("No active markets found for this event.");
          return;
        }

        console.log(
          `Orderbook for top active market: ${topMarket.ticker ?? "unknown"}`
        );
        const orderbook = await getOrderbookForMaket(topMarket);
        if (orderbook) {
          const yesBidsMap = orderbook.yes_bids ?? {};
          const noBidsMap = orderbook.no_bids ?? {};

          const yesBids = Object.entries(yesBidsMap).map(([price, size]) => ({
            price,
            size,
          }));
          const noBids = Object.entries(noBidsMap).map(([price, size]) => ({
            price,
            size,
          }));

          console.log("Orderbook YES Bids");
          console.table(yesBids);

          console.log("Orderbook NO Bids");
          console.table(noBids);
        }

        const outcomeMint = await executeOrderForMarket(
          topMarket,
          orderbook,
          connection,
          keypair
        );
        if (outcomeMint) {
          await sellOutcomeToken(outcomeMint, connection, keypair);
        }
        return;
      }
    }
  }

  console.log("No market with volume > 1m found in this batch.");
}

main().catch((error) => {
  if (error instanceof Error && error.message.includes("SOLANA_PRIVATE_KEY")) {
    console.error(
      "Missing SOLANA_PRIVATE_KEY. Set it in .env as a base58 string or JSON array."
    );
    process.exit(1);
  }

  console.error("Error:", error);
  process.exit(1);
});
