/**
 * Imperative Trade Example
 *
 * Demonstrates the imperative swap flow:
 * 1. GET /order (with userPublicKey to receive transaction)
 * 2. Sign transaction
 * 3. Submit to Solana RPC
 */

import "dotenv/config";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
// @ts-ignore - bs58 types not available but package exists
import bs58 from "bs58";

const API_KEY = process.env.DFLOW_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TRADE_API_BASE_URL = process.env.DFLOW_TRADE_API_URL || "https://dev-quote-api.dflow.net";

const INPUT_MINT = process.env.DFLOW_INPUT_MINT || "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = process.env.DFLOW_OUTPUT_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const INPUT_AMOUNT = Number(process.env.DFLOW_INPUT_AMOUNT ?? "100000");
const SLIPPAGE_BPS = Number(process.env.DFLOW_SLIPPAGE_BPS ?? "50");
const DEXES = process.env.DFLOW_DEXES ? process.env.DFLOW_DEXES.split(",") : ["Raydium AMM"];

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
        // Try JSON array format first
        if (privateKeyStr.trim().startsWith("[")) {
            const secretKey = new Uint8Array(JSON.parse(privateKeyStr));
            return Keypair.fromSecretKey(secretKey);
        } else {
            // Assume base58 format
            const secretKey = bs58.decode(privateKeyStr);
            return Keypair.fromSecretKey(secretKey);
        }
    } catch (error) {
        throw new Error(`Failed to parse private key: ${error}`);
    }
}

async function fetchOrder(params: {
    userPublicKey: string;
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
    dexes?: string[];
}): Promise<{ transaction: string }> {
    // Demo only: use URLSearchParams to avoid encoding/injection issues.
    const dexesParam = params.dexes && params.dexes.length > 0 ? `&dexes=${params.dexes.join(",")}` : "";
    const url = `${TRADE_API_BASE_URL}/order?` +
        `inputMint=${params.inputMint}` +
        `&outputMint=${params.outputMint}` +
        `&amount=${params.amount}` +
        `&slippageBps=${params.slippageBps}` +
        `&userPublicKey=${params.userPublicKey}` +
        dexesParam;

    const headers: Record<string, string> = {};
    if (API_KEY) {
        headers["x-api-key"] = API_KEY;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch order. Status: ${response.statusText}. Error: ${errorText}`);
    }

    return (await response.json()) as { transaction: string };
}

async function sendTransaction(connection: Connection, tx: VersionedTransaction) {
    const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
    });

    console.log(`Transaction sent: ${signature}`);

    await connection.confirmTransaction(signature, "confirmed");
    console.log("Transaction confirmed");
}

async function main() {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const keypair = getKeypair();

    console.log("Imperative trade params:");
    console.log("  RPC:", SOLANA_RPC_URL);
    console.log("  Quote API:", process.env.TRADE_API_BASE_URL);
    console.log("  API key:", API_KEY ? `${API_KEY.slice(0, 4)}...` : "unset");
    console.log("  Wallet:", keypair.publicKey.toBase58());

    // Demo values: make these configurable and validate in production.
    const inputMint = INPUT_MINT; // SOL by default
    const outputMint = OUTPUT_MINT; // USDC by default
    const inputAmount = INPUT_AMOUNT; // 0.0001 SOL (9 decimals)
    const slippageBps = SLIPPAGE_BPS; // 0.5%
    const dexes = DEXES; // single venue for deterministic path by default

    console.log("Fetching order...");
    const order = await fetchOrder({
        userPublicKey: keypair.publicKey.toBase58(),
        inputMint,
        outputMint,
        amount: inputAmount,
        slippageBps,
        dexes,
    });

    console.log("Order received, signing transaction...");
    // Demo only: validate transaction contents before signing in production.
    const transactionBuffer = Buffer.from(order.transaction, "base64");
    const tx = VersionedTransaction.deserialize(transactionBuffer);
    tx.sign([keypair]);

    console.log("Submitting transaction to Solana...");
    await sendTransaction(connection, tx);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
