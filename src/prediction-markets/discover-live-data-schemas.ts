/**
 * Discover Live Data Schemas
 *
 * Crawls the DFlow Prediction Markets API to discover all liveData type
 * schemas for events (sports, etc.) and generates:
 *
 *   generated/
 *     live-data-types.ts          — TypeScript interfaces, discriminated union, and type guards
 *     examples/<type>.json        — Full JSON response sampled from the API
 *     templates/<type>.json       — Structural template with type placeholders instead of values
 *
 * The liveData.details field varies by type (e.g., basketball_game,
 * football_game, tennis_tournament_singles). Because these schemas
 * originate upstream and may change, this script lets you regenerate
 * up-to-date types at any time.
 *
 * Usage:
 *   tsx src/prediction-markets/discover-live-data-schemas.ts                  # discover all Sports types
 *   tsx src/prediction-markets/discover-live-data-schemas.ts Sports           # same — Sports category
 *   tsx src/prediction-markets/discover-live-data-schemas.ts Basketball Golf  # specific sport tags only
 *   tsx src/prediction-markets/discover-live-data-schemas.ts --all            # crawl every category
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.DFLOW_PREDICTION_MARKETS_API_URL ||
  "https://dev-prediction-markets-api.dflow.net";
const API_KEY = process.env.DFLOW_API_KEY;

/** Polite delay between API calls (ms) to avoid hammering the server. */
const DELAY_MS = 100;

/** How many samples to collect per liveData type for accurate type inference. */
const MAX_SAMPLES_PER_TYPE = 5;

/**
 * How many events to fetch per series batch. We only need a few per series to
 * discover the liveData type — fetching all events would be wasteful.
 */
const EVENTS_PER_BATCH = 10;

/**
 * Minimum events to check before allowing early stopping. Ensures we've
 * looked at enough diversity before concluding no new types will appear.
 */
const MIN_EVENTS_BEFORE_EARLY_STOP = 100;

/** Hard cap on total events to check, keeping runtime reasonable. */
const MAX_EVENTS_TO_CHECK = 500;

/**
 * Once we go this many events without discovering a new type, we assume
 * we've found them all and stop early.
 */
const EVENTS_AFTER_LAST_NEW_TYPE = 100;

/** Output directory for all generated files (relative to repo root). */
const OUTPUT_DIR = "generated";

/** Path for the TypeScript types file. */
const TYPES_OUTPUT_PATH = path.join(OUTPUT_DIR, "live-data-types.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build request headers, including the API key if configured. */
function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["x-api-key"] = API_KEY;
  return h;
}

/** Fetch JSON from the Prediction Markets API with error handling. */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${url}\n${body}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Fetch the full category → tags mapping (e.g., Sports → [Basketball, Football, ...]). */
async function getTagsByCategories(): Promise<
  Record<string, string[] | null>
> {
  const data = await fetchJson<{
    tagsByCategories: Record<string, string[] | null>;
  }>(`${API_BASE}/api/v1/tags_by_categories`);
  return data.tagsByCategories;
}

/** Fetch series tickers for a given category (e.g., "Sports"). */
async function getSeriesByCategory(
  category: string
): Promise<{ ticker: string }[]> {
  const data = await fetchJson<{ series: { ticker: string }[] }>(
    `${API_BASE}/api/v1/series?category=${encodeURIComponent(category)}`
  );
  return data.series ?? [];
}

/** Fetch series tickers for one or more tags (e.g., ["Basketball", "Golf"]). */
async function getSeriesByTags(
  tags: string[]
): Promise<{ ticker: string }[]> {
  const data = await fetchJson<{ series: { ticker: string }[] }>(
    `${API_BASE}/api/v1/series?tags=${tags.map(encodeURIComponent).join(",")}`
  );
  return data.series ?? [];
}

/** Fetch events, optionally filtered by series tickers. */
async function getEvents(params: {
  seriesTickers?: string;
  limit?: number;
}): Promise<{ ticker: string; title?: string; competition?: string }[]> {
  const qs = new URLSearchParams();
  qs.set("withNestedMarkets", "false");
  if (params.seriesTickers) qs.set("seriesTickers", params.seriesTickers);
  if (params.limit) qs.set("limit", params.limit.toString());
  const data = await fetchJson<{ events: any[] }>(
    `${API_BASE}/api/v1/events?${qs.toString()}`
  );
  return data.events ?? [];
}

/**
 * Fetch live data for a specific event. Returns an array because some events
 * (e.g., multi-leg tournaments) can have multiple live data entries.
 */
async function getLiveDataByEvent(
  eventTicker: string
): Promise<
  { type: string; details: Record<string, unknown>; milestone_id: string }[]
> {
  const data = await fetchJson<{ live_datas: any[] }>(
    `${API_BASE}/api/v1/live_data/by-event/${encodeURIComponent(eventTicker)}`
  );
  return data.live_datas ?? [];
}

// ---------------------------------------------------------------------------
// Type inference engine
//
// We infer TypeScript types from actual JSON values. Multiple samples of the
// same liveData type are merged to build a complete picture:
//   - Fields present in all samples → required
//   - Fields present in some samples → optional (marked with ?)
//   - Conflicting value types (e.g., number in one sample, null in another)
//     are represented as unions (e.g., number | null)
// ---------------------------------------------------------------------------

/** Represents an inferred TypeScript type. */
type InferredType =
  | { kind: "primitive"; type: "string" | "number" | "boolean" }
  | { kind: "null" }
  | { kind: "array"; elementType: InferredType }
  | { kind: "object"; fields: Map<string, FieldInfo> }
  | { kind: "union"; types: InferredType[] };

/** A field within an inferred object type. Tracks how many samples contained it. */
type FieldInfo = { type: InferredType; occurrences: number };

/** Infer an InferredType from a single runtime value. */
function inferType(value: unknown): InferredType {
  if (value === null || value === undefined) return { kind: "null" };
  if (typeof value === "string") return { kind: "primitive", type: "string" };
  if (typeof value === "number") return { kind: "primitive", type: "number" };
  if (typeof value === "boolean")
    return { kind: "primitive", type: "boolean" };

  if (Array.isArray(value)) {
    if (value.length === 0)
      return { kind: "array", elementType: { kind: "null" } };
    // Merge all element types to handle heterogeneous arrays.
    const elementTypes = value.map(inferType);
    const merged = elementTypes.reduce(mergeTypes);
    return { kind: "array", elementType: merged };
  }

  if (typeof value === "object") {
    const fields = new Map<string, FieldInfo>();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields.set(k, { type: inferType(v), occurrences: 1 });
    }
    return { kind: "object", fields };
  }

  return { kind: "primitive", type: "string" }; // fallback for unexpected types
}

/** Recursively flatten nested unions into a flat list. */
function flattenUnion(t: InferredType): InferredType[] {
  if (t.kind === "union") return t.types.flatMap(flattenUnion);
  return [t];
}

/** Deduplicate a list of types by kind (and subtype for primitives). */
function dedup(types: InferredType[]): InferredType[] {
  const seen = new Set<string>();
  return types.filter((t) => {
    const key =
      t.kind === "primitive"
        ? `p:${t.type}`
        : t.kind === "null"
          ? "null"
          : t.kind === "array"
            ? "array"
            : "object";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Merge two inferred types into one that covers both. Used when the same field
 * has different types across samples (e.g., number in one, null in another →
 * number | null).
 */
function mergeTypes(a: InferredType, b: InferredType): InferredType {
  // Identical nulls or identical primitives — no change needed.
  if (a.kind === "null" && b.kind === "null") return a;
  if (
    a.kind === "primitive" &&
    b.kind === "primitive" &&
    a.type === b.type
  )
    return a;

  // Both arrays → merge their element types recursively.
  if (a.kind === "array" && b.kind === "array") {
    return {
      kind: "array",
      elementType: mergeTypes(a.elementType, b.elementType),
    };
  }

  // Both objects → merge their field sets (see mergeObjectTypes).
  if (a.kind === "object" && b.kind === "object") {
    return mergeObjectTypes(a, b);
  }

  // Different kinds: flatten into a union, deduplicate, and consolidate
  // any object types that ended up in the union.
  const allTypes = dedup([...flattenUnion(a), ...flattenUnion(b)]);

  const objects = allTypes.filter((t) => t.kind === "object") as Extract<
    InferredType,
    { kind: "object" }
  >[];
  const nonObjects = allTypes.filter((t) => t.kind !== "object");

  const mergedObj =
    objects.length > 1
      ? objects.reduce((acc, o) => mergeObjectTypes(acc, o) as any)
      : objects[0];

  const result = mergedObj ? [...nonObjects, mergedObj] : nonObjects;
  return result.length === 1 ? result[0] : { kind: "union", types: result };
}

/**
 * Merge two object types field-by-field. Fields present in both objects have
 * their types merged; fields present in only one object are kept but their
 * occurrence count reflects that they're not universal.
 */
function mergeObjectTypes(
  a: Extract<InferredType, { kind: "object" }>,
  b: Extract<InferredType, { kind: "object" }>
): InferredType {
  const merged = new Map<string, FieldInfo>();
  const allKeys = new Set([...a.fields.keys(), ...b.fields.keys()]);

  for (const key of allKeys) {
    const aField = a.fields.get(key);
    const bField = b.fields.get(key);
    if (aField && bField) {
      merged.set(key, {
        type: mergeTypes(aField.type, bField.type),
        occurrences: aField.occurrences + bField.occurrences,
      });
    } else if (aField) {
      merged.set(key, { ...aField });
    } else if (bField) {
      merged.set(key, { ...bField });
    }
  }
  return { kind: "object", fields: merged };
}

/**
 * Merge multiple liveData.details samples into a single inferred type.
 * Fields that appear in fewer samples than the total are marked optional
 * (via the occurrences counter) in the generated TypeScript output.
 */
function mergeMultipleSamples(
  samples: Record<string, unknown>[]
): InferredType {
  if (samples.length === 0) return { kind: "object", fields: new Map() };
  return samples.map(inferType).reduce(mergeTypes);
}

// ---------------------------------------------------------------------------
// TypeScript code generation
// ---------------------------------------------------------------------------

/**
 * Convert an InferredType to a TypeScript type string.
 * @param t            The inferred type to convert.
 * @param indent       Current indentation level (for nested objects).
 * @param totalSamples Total number of samples — used to determine if a field
 *                     should be optional (appears in fewer than totalSamples).
 */
function typeToTs(
  t: InferredType,
  indent: number,
  totalSamples: number
): string {
  const pad = "  ".repeat(indent);

  switch (t.kind) {
    case "null":
      return "null";
    case "primitive":
      return t.type;
    case "array": {
      const el = typeToTs(t.elementType, indent, totalSamples);
      // Use Array<T> syntax for complex element types, T[] for simple ones.
      return t.elementType.kind === "object" || t.elementType.kind === "union"
        ? `Array<${el}>`
        : `${el}[]`;
    }
    case "object": {
      if (t.fields.size === 0) return "Record<string, unknown>";
      const lines: string[] = ["{"];
      for (const [key, field] of t.fields) {
        const optional =
          field.occurrences < totalSamples && totalSamples > 1 ? "?" : "";
        const valStr = typeToTs(field.type, indent + 1, totalSamples);
        lines.push(`${pad}  ${key}${optional}: ${valStr};`);
      }
      lines.push(`${pad}}`);
      return lines.join("\n");
    }
    case "union": {
      return t.types
        .map((ut) => typeToTs(ut, indent, totalSamples))
        .join(" | ");
    }
  }
}

/** Convert a snake_case type name to PascalCase (e.g., basketball_game → BasketballGame). */
function snakeToPascal(s: string): string {
  return s
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/** Convert a snake_case type name to a human-readable label (e.g., basketball_game → Basketball Game). */
function humanLabel(typeName: string): string {
  return typeName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Output generation
// ---------------------------------------------------------------------------

/** Collected data for a single liveData type. */
interface TypeEntry {
  /** Raw details objects sampled from the API (up to MAX_SAMPLES_PER_TYPE). */
  samples: Record<string, unknown>[];
  /** Event tickers the samples came from, for attribution in generated comments. */
  eventTickers: string[];
}

/**
 * Strip values from a JSON object, replacing them with type placeholders
 * like "<string>", "<number>", "<boolean>". Arrays are reduced to a single
 * representative element so the template shows the structure without noise.
 */
function toTemplate(obj: unknown): unknown {
  if (obj === null) return "<null>";
  if (obj === undefined) return "<undefined>";
  if (typeof obj === "string") return "<string>";
  if (typeof obj === "number") return "<number>";
  if (typeof obj === "boolean") return "<boolean>";
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [];
    return [toTemplate(obj[0])];
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = toTemplate(v);
    }
    return result;
  }
  return "<unknown>";
}

/**
 * Generate the TypeScript source for live-data-types.ts, containing:
 *   - One interface per liveData type (e.g., BasketballGameDetails)
 *   - A discriminated union type (LiveData) for type-safe switching
 *   - Type guard functions (e.g., isBasketballGame())
 */
function generateTypesFile(typeMap: Map<string, TypeEntry>): string {
  const lines: string[] = [];
  const timestamp = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");

  // File header
  lines.push("/**");
  lines.push(" * DFlow Live Data Type Schemas");
  lines.push(` * Auto-generated on ${timestamp}`);
  lines.push(
    ` * Types discovered: ${[...typeMap.keys()].join(", ")}`
  );
  lines.push(" *");
  lines.push(
    " * These types describe the liveData.details object for each event type."
  );
  lines.push(
    " * Live data is available via the DFlow Prediction Markets API:"
  );
  lines.push(" *   GET /api/v1/live_data/by-event/{event_ticker}");
  lines.push(" *   GET /api/v1/live_data/by-mint/{mint_address}");
  lines.push(" *   GET /api/v1/live_data?milestoneIds=...");
  lines.push(" *");
  lines.push(
    " * To regenerate, run: tsx src/prediction-markets/discover-live-data-schemas.ts"
  );
  lines.push(" */");
  lines.push("");

  // --- Per-type interfaces ---
  const interfaceNames: { typeName: string; interfaceName: string }[] = [];

  for (const [typeName, { samples, eventTickers }] of typeMap) {
    const interfaceName = snakeToPascal(typeName) + "Details";
    interfaceNames.push({ typeName, interfaceName });

    const merged = mergeMultipleSamples(samples);

    lines.push(`/**`);
    lines.push(` * ${humanLabel(typeName)} — live data details.`);
    lines.push(
      ` * Inferred from ${samples.length} sample(s): ${eventTickers.slice(0, 3).join(", ")}${eventTickers.length > 3 ? ", ..." : ""}`
    );
    lines.push(` */`);
    lines.push(
      `export interface ${interfaceName} ${typeToTs(merged, 0, samples.length)}`
    );
    lines.push("");
  }

  // --- Discriminated union ---
  lines.push(
    "// ---------------------------------------------------------------------------"
  );
  lines.push("// Discriminated union — switch on ld.type to narrow the details");
  lines.push(
    "// ---------------------------------------------------------------------------"
  );
  lines.push("");
  lines.push("export type LiveData =");
  interfaceNames.forEach(({ typeName, interfaceName }, i) => {
    const end = i === interfaceNames.length - 1 ? ";" : "";
    lines.push(
      `  | { type: "${typeName}"; details: ${interfaceName}; milestone_id: string }${end}`
    );
  });
  lines.push("");

  // --- Type guards ---
  lines.push(
    "// ---------------------------------------------------------------------------"
  );
  lines.push("// Type guards");
  lines.push(
    "// ---------------------------------------------------------------------------"
  );
  lines.push("");

  for (const { typeName } of interfaceNames) {
    const guardName = "is" + snakeToPascal(typeName);
    lines.push(
      `export function ${guardName}(ld: LiveData): ld is Extract<LiveData, { type: "${typeName}" }> {`
    );
    lines.push(`  return ld.type === "${typeName}";`);
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const crawlAll = args.includes("--all");
  const requestedFilters = args.filter((a) => !a.startsWith("--"));

  console.log("DFlow Live Data Schema Discovery");
  console.log("=".repeat(50));
  console.log(`API: ${API_BASE}`);
  console.log("");

  // ---- Step 1: Discover all available categories and tags ----
  console.log("Step 1: Fetching categories and tags...");
  const tagsByCategories = await getTagsByCategories();

  const allCategories = Object.keys(tagsByCategories);
  const allTags = Object.values(tagsByCategories)
    .flat()
    .filter(Boolean) as string[];

  console.log(`  Categories: ${allCategories.join(", ")}`);
  console.log("");

  // ---- Determine what to crawl based on CLI args ----
  let targetCategories: string[] = [];
  let targetTags: string[] = [];

  if (crawlAll) {
    // --all flag: crawl every category
    targetCategories = allCategories;
    console.log("Mode: crawling ALL categories");
  } else if (requestedFilters.length > 0) {
    // Specific filters provided: match against categories and tags
    for (const filter of requestedFilters) {
      if (allCategories.includes(filter)) {
        targetCategories.push(filter);
      } else if (allTags.includes(filter)) {
        targetTags.push(filter);
      } else {
        console.warn(
          `  Warning: "${filter}" not found as a category or tag, skipping.`
        );
      }
    }
    console.log(
      `Mode: filtered — categories: [${targetCategories.join(", ")}], tags: [${targetTags.join(", ")}]`
    );
  } else {
    // Default: just Sports, which covers the most common live data types
    targetCategories = ["Sports"];
    console.log("Mode: default (Sports category)");
  }
  console.log("");

  // ---- Step 2: Find series for each category/tag ----
  console.log("Step 2: Finding series...");
  const seriesTickerSet = new Set<string>();

  for (const category of targetCategories) {
    const series = await getSeriesByCategory(category);
    for (const s of series) seriesTickerSet.add(s.ticker);
    await sleep(DELAY_MS);
  }

  if (targetTags.length > 0) {
    const series = await getSeriesByTags(targetTags);
    for (const s of series) seriesTickerSet.add(s.ticker);
  }

  const seriesTickers = [...seriesTickerSet];
  console.log(`  Found ${seriesTickers.length} series`);
  console.log("");

  // ---- Step 3: Fetch a sample of events from each series ----
  console.log("Step 3: Fetching events...");
  const eventMap = new Map<string, { ticker: string; title?: string }>();

  const BATCH_SIZE = 10;
  for (let i = 0; i < seriesTickers.length; i += BATCH_SIZE) {
    const batch = seriesTickers.slice(i, i + BATCH_SIZE).join(",");
    const events = await getEvents({
      seriesTickers: batch,
      limit: EVENTS_PER_BATCH,
    });
    for (const e of events) {
      if (!eventMap.has(e.ticker)) {
        eventMap.set(e.ticker, { ticker: e.ticker, title: e.title });
      }
    }
    await sleep(DELAY_MS);
  }

  const uniqueEvents = [...eventMap.values()];
  console.log(`  Found ${uniqueEvents.length} unique events`);
  console.log("");

  // ---- Step 4: Crawl live data for each event ----
  // Not every event has live data — only games/matches that are in-progress
  // or recently completed. We check each event and collect what we find.
  console.log("Step 4: Fetching live data for each event...");
  const typeMap = new Map<string, TypeEntry>();
  let checked = 0;
  let found = 0;
  let lastNewTypeAt = 0;

  for (const event of uniqueEvents) {
    checked++;

    // Log progress every 25 events
    if (checked % 25 === 0) {
      const typesSoFar = [...typeMap.keys()].join(", ") || "(none yet)";
      console.log(
        `  Progress: ${checked}/${uniqueEvents.length} events checked | ${found} hits | types: ${typesSoFar}`
      );
    }

    try {
      const liveDatas = await getLiveDataByEvent(event.ticker);

      for (const ld of liveDatas) {
        if (!ld.type || !ld.details) continue;
        found++;

        // First time seeing this type — create an entry
        if (!typeMap.has(ld.type)) {
          typeMap.set(ld.type, { samples: [], eventTickers: [] });
          lastNewTypeAt = checked;
          console.log(
            `  New type discovered: ${ld.type} (from ${event.ticker})`
          );
        }

        // Collect samples up to the cap for robust type inference
        const entry = typeMap.get(ld.type)!;
        if (entry.samples.length < MAX_SAMPLES_PER_TYPE) {
          entry.samples.push(ld.details);
          entry.eventTickers.push(event.ticker);
        }
      }
    } catch {
      // Event may not have live data — that's expected, just move on.
    }

    await sleep(DELAY_MS);

    // Hard cap: stop after checking enough events to keep runtime reasonable
    if (checked >= MAX_EVENTS_TO_CHECK) {
      console.log(
        `  Reached max events limit (${MAX_EVENTS_TO_CHECK}). Stopping.`
      );
      break;
    }

    // Early stop: if we haven't discovered a new type in a while, we've
    // likely found them all. No need to keep crawling.
    if (
      typeMap.size > 0 &&
      checked >= MIN_EVENTS_BEFORE_EARLY_STOP &&
      checked - lastNewTypeAt >= EVENTS_AFTER_LAST_NEW_TYPE
    ) {
      console.log(
        `  No new types in ${EVENTS_AFTER_LAST_NEW_TYPE} events (${typeMap.size} types found). Stopping early.`
      );
      break;
    }
  }

  console.log("");
  console.log(
    `Done crawling. Checked ${checked} events, found ${found} live data entries.`
  );
  console.log(
    `Discovered ${typeMap.size} type(s): ${[...typeMap.keys()].join(", ") || "(none)"}`
  );
  console.log("");

  if (typeMap.size === 0) {
    console.log(
      "No live data types found. This can happen if no events are currently live or recently completed."
    );
    console.log("Try again later, or try: --all to crawl every category.");
    process.exit(0);
  }

  // ---- Step 5: Write output files ----
  console.log("Step 5: Generating output files...");

  const examplesDir = path.join(OUTPUT_DIR, "examples");
  const templatesDir = path.join(OUTPUT_DIR, "templates");

  fs.mkdirSync(examplesDir, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });

  // Write TypeScript interfaces
  const tsOutput = generateTypesFile(typeMap);
  fs.writeFileSync(TYPES_OUTPUT_PATH, tsOutput, "utf-8");
  console.log(`  Types:     ${TYPES_OUTPUT_PATH}`);

  // Write JSON example and template for each discovered type
  for (const [typeName, { samples }] of typeMap) {
    // Example: full real data from the first sample
    const fullExample = {
      type: typeName,
      details: samples[0],
      milestone_id: "<milestone-uuid>",
    };

    // Template: structure only, values replaced with type placeholders
    const template = {
      type: typeName,
      details: toTemplate(samples[0]),
      milestone_id: "<string>",
    };

    const examplePath = path.join(examplesDir, `${typeName}.json`);
    const templatePath = path.join(templatesDir, `${typeName}.json`);

    fs.writeFileSync(
      examplePath,
      JSON.stringify(fullExample, null, 2) + "\n",
      "utf-8"
    );
    fs.writeFileSync(
      templatePath,
      JSON.stringify(template, null, 2) + "\n",
      "utf-8"
    );

    console.log(`  Example:   ${examplePath}`);
    console.log(`  Template:  ${templatePath}`);
  }

  console.log("");

  // ---- Summary ----
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("=".repeat(50));
  console.log("");

  for (const [typeName, { samples, eventTickers }] of typeMap) {
    const merged = mergeMultipleSamples(samples);
    const interfaceName = snakeToPascal(typeName) + "Details";
    console.log(
      `${interfaceName} (${typeName}) — ${samples.length} sample(s)`
    );
    console.log(`  Events: ${eventTickers.join(", ")}`);
    if (merged.kind === "object") {
      for (const [key, field] of merged.fields) {
        const opt = field.occurrences < samples.length ? " (optional)" : "";
        const ts = typeToTs(field.type, 0, samples.length);
        // Keep console summary concise: collapse multi-line types
        const short = ts.includes("\n") ? "{...}" : ts;
        console.log(`    ${key}: ${short}${opt}`);
      }
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
