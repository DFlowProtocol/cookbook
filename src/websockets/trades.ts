/**
 * WebSocket Trades Example
 *
 * Subscribes to trade updates for all markets, or for specific tickers if
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
  console.log("Connected to WebSocket (trades)");
  ws.send(JSON.stringify(buildSubscription("trades")));
};

ws.onmessage = (event) => {
  try {
    const message = JSON.parse(parseMessageData(event.data));
    if (message.channel === "trades") {
      console.log("Trade update:", message);
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
