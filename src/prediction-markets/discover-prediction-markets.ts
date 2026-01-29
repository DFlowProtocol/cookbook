/**
 * Discover Prediction Markets
 *
 * Fetches prediction market events (including nested markets) from the DFlow
 * Prediction Markets API and logs key metadata.
 */

import "dotenv/config";

const METADATA_API_BASE_URL =
  process.env.DFLOW_PREDICTION_MARKETS_API_URL ||
  "https://dev-prediction-markets-api.dflow.net";

// Maximum number of events to print. Set to null or -1 to print all events.
const MAX_EVENTS_TO_PRINT: number | null = 3;

type MarketAccount = {
    yesMint?: string;
    noMint?: string;
};

type Market = {
    ticker?: string;
    title?: string;
    status?: string;
    accounts?: Record<string, MarketAccount>;
};

type Event = {
    ticker?: string;
    title?: string;
    subtitle?: string;
    seriesTicker?: string;
    markets?: Market[];
};

// Demo-style parsing: production code should validate response schemas.
async function getEventsWithNestedMarkets() {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&limit=200`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    if (!response.ok) {
        throw new Error("Failed to get events");
    }

    const data = (await response.json()) as { events: any[] };
    const events = data.events;

    events.forEach((event: any) => {
        console.log("Event:", {
            ticker: event.ticker,
            title: event.title,
            subtitle: event.subtitle,
            seriesTicker: event.seriesTicker,
        });

        if (event.markets && event.markets.length > 0) {
            event.markets.forEach((market: any) => {
                const accountValues = Object.values(market.accounts);

                console.log("  Market:", {
                    ticker: market.ticker,
                    title: market.title,
                    status: market.status,
                    accounts: accountValues.map((account: any) => ({
                        yesMint: account.yesMint,
                        noMint: account.noMint,
                    })),
                });
            });
        }
    });
}

async function getActiveMarkets() {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&status=active&limit=200`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    if (!response.ok) {
        throw new Error("Failed to fetch events");
    }

    const data = (await response.json()) as { events: any[] };
    const events = data.events;

    events.forEach((event: any) => {
        if (event.markets && event.markets.length > 0) {
            event.markets.forEach((market: any) => {
                const accountValues = Object.values(market.accounts);

                console.log("Market:", {
                    ticker: market.ticker,
                    title: market.title,
                    status: market.status,
                    accounts: accountValues.map((account: any) => ({
                        yesMint: account.yesMint,
                        noMint: account.noMint,
                    })),
                });
            });
        }
    });
}

async function getInitializedMarkets() {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&status=initialized&limit=200`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    if (!response.ok) {
        throw new Error("Failed to get events");
    }

    const data = (await response.json()) as { events: any[] };
    const events = data.events;

    events.forEach((event: any) => {
        if (event.markets && event.markets.length > 0) {
            event.markets.forEach((market: any) => {
                const accountValues = Object.values(market.accounts);

                console.log("Market:", {
                    ticker: market.ticker,
                    title: market.title,
                    status: market.status,
                    accounts: accountValues.map((account: any) => ({
                        yesMint: account.yesMint,
                        noMint: account.noMint,
                    })),
                });
            });
        }
    });
}

async function getTagsByCategory() {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/tags_by_categories`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    if (!response.ok) {
        throw new Error("Failed to get tags by categories");
    }

    const data = (await response.json()) as { tagsByCategories: Record<string, any[]> };
    const tagsByCategories = data.tagsByCategories;

    Object.entries(tagsByCategories).forEach(
        ([category, tags]: [string, any]) => {
            const tagList = Array.isArray(tags) ? tags.join(", ") : String(tags ?? "");
            console.log(`Tags for ${category}: ${tagList}`);
        }
    );
}

async function filterSeriesByCategoryAndTags(): Promise<string[]> {
    const selectedCategory = "Sports";
    const selectedTag = "Football";

    const responseByCategory = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/series?category=${selectedCategory}`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    const dataByCategory = (await responseByCategory.json()) as { series: any[] };
    const categorizedSeriesTickers = dataByCategory.series.map((s: any) => s.ticker);

    const responseByTag = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/series?tags=${selectedTag}`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    if (!responseByTag.ok) {
        throw new Error("Failed to get series");
    }

    const dataByTag = (await responseByTag.json()) as { series: any[] };
    const taggedSeriesTickers = dataByTag.series.map((s: any) => s.ticker);

    const selectedTags = "Football,Soccer";
    const responseWithBoth = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/series?category=${selectedCategory}&tags=${selectedTags}`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    const dataWithBoth = (await responseWithBoth.json()) as { series: any[] };
    const filteredSeries = dataWithBoth.series;
    const seriesTickers = filteredSeries.map((s: any) => s.ticker);

    console.log("Series tickers by category:", categorizedSeriesTickers);
    console.log("Series tickers by tag:", taggedSeriesTickers);
    console.log("Series tickers by category and tag:", seriesTickers);

    return seriesTickers;
}

async function getEventsBySeriesTickers(seriesTickers: string[]) {
    const selectedSeriesTicker = seriesTickers[0];

    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/events?seriesTickers=${selectedSeriesTicker}&withNestedMarkets=true&limit=100`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    const multipleSeriesTickers = seriesTickers.slice(0, 3).join(",");
    const responseMultiple = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/events?seriesTickers=${multipleSeriesTickers}&withNestedMarkets=true&limit=100`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    if (!response.ok) {
        throw new Error("Failed to get events by series");
    }

    const data = (await response.json()) as { events: any[] };
    const filteredEvents = data.events;

    filteredEvents.forEach((event: any) => {
        console.log("Event:", {
            ticker: event.ticker,
            title: event.title,
            subtitle: event.subtitle,
            seriesTicker: event.seriesTicker,
        });

        if (event.markets && event.markets.length > 0) {
            event.markets.forEach((market: any) => {
                const accountValues = Object.values(market.accounts);

                console.log("  Market:", {
                    ticker: market.ticker,
                    title: market.title,
                    status: market.status,
                    accounts: accountValues.map((account: any) => ({
                        yesMint: account.yesMint,
                        noMint: account.noMint,
                    })),
                });
            });
        }
    });
}




async function main() {
    // await getEventsWithNestedMarkets();
    // await getActiveMarkets();
    // await getInitializedMarkets();
    // await getTagsByCategory();
    const seriesTickers = await filterSeriesByCategoryAndTags();
    await getEventsBySeriesTickers(seriesTickers);
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
