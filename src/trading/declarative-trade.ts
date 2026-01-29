/**
 * Declarative Trade Example (from docs)
 *
 * Request quote -> Sign intent -> Submit intent -> Monitor intent
 * NOTE: Based on documentation snippet; trading endpoints may change.
 */

import "dotenv/config";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { monitorOrder } from "@dflow-protocol/swap-api-utils";
import bs58 from "bs58";

const SOL = process.env.DFLOW_INPUT_MINT || "So11111111111111111111111111111111111111112";
const USDC =
  process.env.DFLOW_OUTPUT_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Demo values: make these configurable and validate in production.
// Match the imperative example: 0.0001 SOL, 0.5% slippage
const amount = Number(process.env.DFLOW_INPUT_AMOUNT ?? "100000"); // lamports
const slippageBps = Number(process.env.DFLOW_SLIPPAGE_BPS ?? "50");

// Base URL for the DFlow Trading API (dev)
const TRADE_API_BASE_URL = process.env.DFLOW_TRADE_API_URL || "https://dev-quote-api.dflow.net";
const API_KEY = process.env.DFLOW_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

function maskKey(key?: string) {
  if (!key) return "unset";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Order status constants
const ORDER_STATUS = {
  CLOSED: "CLOSED",
  PENDING_CLOSE: "PENDING_CLOSE",
  OPEN_EXPIRED: "OPEN_EXPIRED",
  OPEN_FAILED: "OPEN_FAILED",
} as const;
type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

interface Fill {
  qtyIn: bigint;
  qtyOut: bigint;
}

interface MonitorOrderResult {
  status: OrderStatus;
  fills: Fill[];
  transactionError?: string;
}

interface MonitorOrderParams {
  connection: Connection;
  intent: { openTransaction: string };
  signedOpenTransaction: Transaction;
  submitIntentResponse: unknown;
}

// Simple HeadersInit alias for Node environment
type HeadersInit = Record<string, string>;

async function parseJsonOrThrow(response: Response, label: string) {
  const text = await response.text();
  if (!text) {
    throw new Error(`${label}: empty response body`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: failed to parse JSON: ${err}`);
  }
}

// Get private key from environment variable
// Format: Base58 string (e.g., 'YourBase58PrivateKeyHere') or JSON array (e.g., [1,2,3,...])
function getKeypair(): Keypair {
  const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
  // Demo only: never log keys; use secure key management in production.

  if (!privateKeyStr) {
    throw new Error(
      "SOLANA_PRIVATE_KEY environment variable is required.\n" +
      "Format: Base58 string or JSON array, e.g., [1,2,3,...]"
    );
  }

  try {
    if (privateKeyStr.trim().startsWith("[")) {
      const secretKey = new Uint8Array(JSON.parse(privateKeyStr));
      return Keypair.fromSecretKey(secretKey);
    } else {
      const secretKey = bs58.decode(privateKeyStr);
      return Keypair.fromSecretKey(secretKey);
    }
  } catch (error) {
    throw new Error(`Failed to parse private key: ${error}`);
  }
}

async function main() {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const keypair = getKeypair();

  console.log("Declarative trade params:");
  console.log("  RPC:", SOLANA_RPC_URL);
  console.log("  Quote API:", TRADE_API_BASE_URL);
  console.log("  API key:", maskKey(API_KEY));
  console.log("  Wallet:", keypair.publicKey.toBase58());

  // REQUEST QUOTE (intent)
  const queryParams = new URLSearchParams();
  queryParams.append("inputMint", SOL);
  queryParams.append("outputMint", USDC);
  queryParams.append("amount", amount.toString());
  queryParams.append("userPublicKey", keypair.publicKey.toBase58());
  queryParams.append("slippageBps", slippageBps.toString());

  const headers: HeadersInit = {};
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }
  const intentResponse = await fetch(
    `${TRADE_API_BASE_URL}/intent?${queryParams.toString()}`,
    { headers }
  );

  if (!intentResponse.ok) {
    const errorText = await intentResponse.text();
    throw new Error(`Failed to request intent: ${intentResponse.status} ${errorText}`);
  }
  const intentData = (await parseJsonOrThrow(intentResponse, "intent response")) as { openTransaction: string };

  // SIGN THE INTENT
  const transaction = intentData.openTransaction;
  const transactionBytes = Buffer.from(transaction, "base64");
  const openTransaction = Transaction.from(transactionBytes);
  // Demo only: validate transaction contents before signing in production.
  openTransaction.sign(keypair);
  // SUBMIT INTENT
  const submitHeaders: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    submitHeaders["x-api-key"] = API_KEY;
  }

  const response = await fetch(`${TRADE_API_BASE_URL}/submit-intent`, {
    method: "POST",
    headers: submitHeaders,
    body: JSON.stringify({
      quoteResponse: intentData,
      signedOpenTransaction: Buffer.from(openTransaction.serialize()).toString(
        "base64"
      ),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to submit intent: ${response.status} ${errorText}`);
  }
  const submitIntentData = (await parseJsonOrThrow(response, "submit intent response")) as any;

  // MONITOR INTENT
  if (!submitIntentData?.orderAddress || !submitIntentData?.programId) {
    console.error("submitIntentData missing orderAddress/programId:", submitIntentData);
    return;
  }
  const result = await monitorOrder({
    connection,
    intent: intentData as { openTransaction: string },
    signedOpenTransaction: openTransaction,
    submitIntentResponse: submitIntentData,
  });


  switch (result.status) {
    case ORDER_STATUS.CLOSED: {
      if (result.fills.length > 0) {
        const qtyIn = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyIn, 0n);
        const qtyOut = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyOut, 0n);
        console.log(`Order succeeded: sent ${qtyIn}, received ${qtyOut}`);
      } else {
        console.log("Order failed");
      }
      break;
    }
    case ORDER_STATUS.PENDING_CLOSE: {
      if (result.fills.length > 0) {
        const qtyIn = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyIn, 0n);
        const qtyOut = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyOut, 0n);
        console.log(`Order succeeded: sent ${qtyIn}, received ${qtyOut}`);
      } else {
        console.log("Order failed");
      }
      break;
    }
    case ORDER_STATUS.OPEN_EXPIRED: {
      console.log("Transaction expired. Try again with a higher slippage tolerance.");
      break;
    }
    case ORDER_STATUS.OPEN_FAILED: {
      console.log("Order failed", result.transactionError);
      break;
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
