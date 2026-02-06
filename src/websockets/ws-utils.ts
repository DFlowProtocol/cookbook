import "dotenv/config";
// WebSocket credentials are private and must be provided via .env.
const API_KEY = process.env.DFLOW_API_KEY;
const WS_URL = process.env.DFLOW_PREDICTION_MARKETS_WS_URL;

const CREDS_HELP_URL = "https://pond.dflow.net/build/api-key";

export function requireWebSocketConfig() {
  // Keep demo output clean and fail early if creds are missing.
  if (!WS_URL || !API_KEY) {
    console.error("Missing websocket credentials.");
    console.error("Set DFLOW_PREDICTION_MARKETS_WS_URL and DFLOW_API_KEY.");
    console.error(`Request credentials at ${CREDS_HELP_URL}`);
    process.exit(1);
  }

  return {
    url: WS_URL,
    headers: {
      "x-api-key": API_KEY,
    },
  };
}

export function buildSubscription(channel: "prices" | "trades" | "orderbook") {
  const tickers = process.env.DFLOW_WS_TICKERS
    ? process.env.DFLOW_WS_TICKERS.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // If no tickers provided, subscribe to all markets for the channel.
  if (tickers.length > 0) {
    return { type: "subscribe", channel, tickers };
  }
  return { type: "subscribe", channel, all: true };
}

export function parseMessageData(data: string | ArrayBuffer | Buffer): string {
  // ws may emit strings, ArrayBuffer, or Buffer depending on runtime.
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return data.toString("utf8");
}

