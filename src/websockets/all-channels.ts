/**
 * WebSocket Multi-Channel Example
 *
 * Subscribes to prices, trades, and orderbook updates in a single connection.
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
  console.log("Connected to WebSocket (all channels)");
  ws.send(JSON.stringify(buildSubscription("prices")));
  ws.send(JSON.stringify(buildSubscription("trades")));
  ws.send(JSON.stringify(buildSubscription("orderbook")));
};

ws.onmessage = (event) => {
  try {
    const message = JSON.parse(parseMessageData(event.data));
    switch (message.channel) {
      case "prices":
        console.log("Price update:", message);
        break;
      case "trades":
        console.log("Trade update:", message);
        break;
      case "orderbook":
        console.log("Orderbook update:", message);
        break;
      default:
        console.log("Message:", message);
        break;
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
