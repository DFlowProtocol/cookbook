/**
 * Track User Positions
 *
 * Tracks user positions in prediction markets.
 */

import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const USER_WALLET_ADDRESS = process.env.USER_WALLET_ADDRESS;
const METADATA_API_BASE_URL =
    process.env.DFLOW_PREDICTION_MARKETS_API_URL ||
    "https://dev-prediction-markets-api.dflow.net";
const SOLANA_RPC_URL =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const MAX_MINTS = 500;

async function getTokenAccounts(walletAddress: string) {
    const connection = new Connection(SOLANA_RPC_URL);
    const userWallet = new PublicKey(walletAddress);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        userWallet,
        { programId: TOKEN_2022_PROGRAM_ID }
    );

    const userTokens = tokenAccounts.value.map(({ account }) => {
        const info = account.data.parsed.info;

        return {
            mint: info.mint,
            rawBalance: info.tokenAmount.amount,
            balance: info.tokenAmount.uiAmount,
            decimals: info.tokenAmount.decimals,
        };
    });

    const nonZeroBalances = userTokens.filter((token) => token.balance > 0);

    console.log('='.repeat(60));
    console.log('NON-ZERO TOKEN BALANCES');
    console.log('='.repeat(60));
    console.table(nonZeroBalances);

    return nonZeroBalances;
}

async function filterOutcomeMints(nonZeroBalances: any[]) {
    const allMintAddresses = nonZeroBalances
        .map((token) => token.mint)
        .filter((mint) => typeof mint === "string" && mint.length > 0)
        .slice(0, MAX_MINTS);

    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/filter_outcome_mints`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: allMintAddresses }),
        }
    );

    if (!response.ok) {
        throw new Error("Failed to filter outcome mints");
    }

    const data = (await response.json()) as { outcomeMints?: string[] };
    const outcomeMints = data.outcomeMints ?? [];
    const outcomeTokens = nonZeroBalances.filter((token) =>
        outcomeMints.includes(token.mint)
    );

    console.log('='.repeat(60));
    console.log('OUTCOME TOKENS');
    console.log('='.repeat(60));
    console.table(outcomeTokens);

    return { outcomeMints, outcomeTokens };
}

async function fetchMarketBatch(outcomeMints: string[]) {
    const safeOutcomeMints = outcomeMints
        .filter((mint) => typeof mint === "string" && mint.length > 0)
        .slice(0, MAX_MINTS);
    const marketsResponse = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/markets/batch`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mints: safeOutcomeMints }),
        }
    );

    if (!marketsResponse.ok) {
        throw new Error("Failed to fetch markets batch");
    }

    const marketsData = (await marketsResponse.json()) as { markets?: any[] };
    const markets = marketsData.markets ?? [];

    const marketsByMint = new Map<string, any>();
    markets.forEach((market: any) => {
        Object.values(market.accounts ?? {}).forEach((account: any) => {
            if (account.yesMint) marketsByMint.set(account.yesMint, market);
            if (account.noMint) marketsByMint.set(account.noMint, market);
        });
    });

    console.log('='.repeat(60));
    console.log('MARKETS BY MINT');
    console.log('='.repeat(60));
    console.table(Array.from(marketsByMint.entries()).map(([mint, market]) => ({
        mint,
        marketTicker: market.ticker,
        marketTitle: market.title,
    })));

    return marketsByMint;
}

function buildPositionRows(outcomeTokens: any[], marketsByMint: Map<string, any>) {
    const positions = outcomeTokens.map((token) => {
        const market = marketsByMint.get(token.mint);
        if (!market) {
            return {
                mint: token.mint,
                balance: token.balance,
                position: "UNKNOWN",
                market: null,
            };
        }

        const accounts = Object.values(market.accounts ?? {});
        const isYesToken = accounts.some((account: any) => account.yesMint === token.mint);
        const isNoToken = accounts.some((account: any) => account.noMint === token.mint);

        return {
            mint: token.mint,
            balance: token.balance,
            decimals: token.decimals,
            position: isYesToken ? "YES" : isNoToken ? "NO" : "UNKNOWN",
            market,
        };
    });

    console.log('='.repeat(60));
    console.log('USER POSITIONS');
    console.log('='.repeat(60));
    console.table(positions.map((pos) => ({
        mint: pos.mint,
        balance: pos.balance,
        decimals: pos.decimals,
        position: pos.position,
        marketTicker: pos.market?.ticker || null,
        marketTitle: pos.market?.title || null,
    })));
}

async function main() {
    if (!USER_WALLET_ADDRESS) {
        throw new Error('USER_WALLET_ADDRESS must be set in .env file');
    }

    const nonZeroBalances = await getTokenAccounts(USER_WALLET_ADDRESS);
    const { outcomeMints, outcomeTokens } = await filterOutcomeMints(nonZeroBalances);
    const marketsByMint = await fetchMarketBatch(outcomeMints);
    buildPositionRows(outcomeTokens, marketsByMint);
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
