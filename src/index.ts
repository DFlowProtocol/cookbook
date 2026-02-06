import { Command } from "commander";
import { spawn } from "node:child_process";

type ScriptInfo = {
  name: string;
  path: string;
  description: string;
  needsPrivateKey: boolean;
};

const scripts: ScriptInfo[] = [
  {
    name: "prediction-market-lifecycle",
    path: "src/prediction-markets/prediction-market-lifecycle.ts",
    description: "Finds a market, prints orderbook, buys + sells 1 contract",
    needsPrivateKey: true,
  },
  {
    name: "discover-prediction-markets",
    path: "src/prediction-markets/discover-prediction-markets.ts",
    description: "Fetches events, markets, tags, and series metadata",
    needsPrivateKey: false,
  },
  {
    name: "track-user-positions",
    path: "src/prediction-markets/track-user-positions.ts",
    description: "Maps wallet outcome-token positions",
    needsPrivateKey: false,
  },
  {
    name: "imperative-trade",
    path: "src/trading/imperative-trade.ts",
    description: "GET /order, sign, and submit to Solana RPC",
    needsPrivateKey: true,
  },
  {
    name: "declarative-trade",
    path: "src/trading/declarative-trade.ts",
    description: "Quote, sign intent, submit, and monitor",
    needsPrivateKey: true,
  },
  {
    name: "ws-prices",
    path: "src/websockets/prices.ts",
    description: "WebSocket prices stream",
    needsPrivateKey: false,
  },
  {
    name: "ws-trades",
    path: "src/websockets/trades.ts",
    description: "WebSocket trades stream",
    needsPrivateKey: false,
  },
  {
    name: "ws-orderbook",
    path: "src/websockets/orderbook.ts",
    description: "WebSocket orderbook stream",
    needsPrivateKey: false,
  },
  {
    name: "ws-all",
    path: "src/websockets/all-channels.ts",
    description: "WebSocket prices + trades + orderbook streams",
    needsPrivateKey: false,
  },
];

function getScriptByName(name: string) {
  return scripts.find((script) => script.name === name);
}

function runScript(scriptName: string, scriptArgs: string[]) {
  const script = getScriptByName(scriptName);
  if (!script) {
    console.error(`Unknown script: ${scriptName}`);
    printScripts();
    process.exitCode = 1;
    return;
  }

  console.log(`Running: ${script.name}`);
  console.log(`  ${script.path}`);
  if (script.needsPrivateKey) {
    console.log("  Requires SOLANA_PRIVATE_KEY");
  }
  if (script.name.startsWith("ws-")) {
    console.log("  Requires DFLOW_API_KEY for websocket auth");
  }
  if (scriptArgs.length > 0) {
    console.log(`  Args: ${scriptArgs.join(" ")}`);
  }

  const child = spawn("tsx", [script.path, ...scriptArgs], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

function printScripts() {
  console.log("Available DFlow cookbook scripts:");
  console.table(
    scripts.map((script) => ({
      name: script.name,
      path: script.path,
      "needs SOLANA_PRIVATE_KEY": script.needsPrivateKey ? "yes" : "no",
      description: script.description,
    }))
  );
  console.log("Run a script with:");
  console.log("  tsx path/to/script.ts");
  console.log("See README.md for environment setup.");
}

const program = new Command();

program
  .name("dflow")
  .description("DFlow cookbook CLI helper (lists available scripts).")
  .version("0.1.0");

program
  .command("list")
  .description("List available cookbook scripts")
  .action(printScripts);

program
  .command("help-scripts")
  .description("Show script list and run instructions")
  .action(printScripts);

program
  .command("run")
  .description("Run a cookbook script by name")
  .argument("<script>", "script name (see list)")
  .argument("[args...]", "arguments forwarded to the script")
  .action(runScript);

program.parse(process.argv);

if (process.argv.length <= 2) {
  printScripts();
}
