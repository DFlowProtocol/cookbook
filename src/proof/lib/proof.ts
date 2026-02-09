import bs58 from "bs58";

// Proof message format required by the portal.
export function buildProofMessage(timestamp: number) {
  return `Proof KYC verification: ${timestamp}`;
}

// Signatures come back as bytes; encode to base58 for the deep link.
export function encodeSignature(signature: Uint8Array | string) {
  if (typeof signature === "string") {
    return signature;
  }
  return bs58.encode(signature);
}

// Preserve the wallet on the callback URL for verification checks.
export function buildRedirectUri(baseRedirectUri: string, wallet: string) {
  const url = new URL(baseRedirectUri);
  url.searchParams.set("wallet", wallet);
  return url.toString();
}

export function buildDeepLink({
  wallet,
  signature,
  timestamp,
  redirectUri,
  proofPortalUrl,
}: {
  wallet: string;
  signature: string;
  timestamp: number;
  redirectUri: string;
  proofPortalUrl: string;
}) {
  const params = new URLSearchParams({
    wallet,
    signature,
    timestamp: timestamp.toString(),
    redirect_uri: redirectUri,
  });
  return `${proofPortalUrl}?${params.toString()}`;
}

// Public verify endpoint for gating features by wallet status.
export async function verifyWallet(address: string, verifyBaseUrl: string) {
  const url = verifyBaseUrl.endsWith("/")
    ? `${verifyBaseUrl}${address}`
    : `${verifyBaseUrl}/${address}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Verify failed: ${response.status}`);
  }
  const data = (await response.json()) as { verified: boolean };
  return data.verified;
}
