/**
 * WebSocket Prices Example
 *
 * Subscribes to price updates for all markets, or for specific tickers if
 * DFLOW_WS_TICKERS is set.
 */

import "dotenv/config";
import WebSocket from "ws";
import {
  buildSubscription,
  requireWebSocketConfig,
  parseMessageData,
} from "./ws-utils";

const { url, headers } = requireWebSocketConfig();
console.log("Connecting to WebSocket", url);
const ws = new WebSocket(url, { headers });

ws.onopen = () => {
  console.log("Connected to WebSocket (prices)");
  ws.send(JSON.stringify(buildSubscription("prices")));
};

ws.onmessage = (event) => {
  try {
    const message = JSON.parse(parseMessageData(event.data));
    if (message.channel === "prices") {
      console.log("Price update:", message);
    }
  } catch (error) {
    console.error("Failed to parse message:", error);
  }
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = (event) => {
  console.log("WebSocket connection closed", {
    code: event?.code,
    reason: event?.reason,
  });
};
