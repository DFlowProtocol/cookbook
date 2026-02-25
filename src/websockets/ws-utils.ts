import "dotenv/config";

const DEV_WS_URL = "wss://dev-prediction-markets-api.dflow.net/api/v1/ws";

const useDev = process.argv.includes("--dev");

export function getWebSocketUrl(): string {
  if (useDev) {
    console.log("Using dev WebSocket URL (--dev flag)");
    return DEV_WS_URL;
  }

  const envUrl = process.env.DFLOW_PREDICTION_MARKETS_WS_URL;
  if (envUrl) {
    return envUrl;
  }

  console.log("DFLOW_PREDICTION_MARKETS_WS_URL not set, using dev URL");
  return DEV_WS_URL;
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

