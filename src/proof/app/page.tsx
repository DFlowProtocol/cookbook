"use client";

import {
  useAccounts,
  useDisconnect,
  useModal,
  usePhantom,
  useSolana,
} from "@phantom/react-sdk";
import { AddressType } from "@phantom/browser-sdk";
import { useEffect, useMemo, useState } from "react";
import {
  buildDeepLink,
  buildProofMessage,
  buildRedirectUri,
  encodeSignature,
  verifyWallet,
} from "../lib/proof";

// Configurable endpoints for local dev and production previews.
const proofPortalUrl =
  process.env.NEXT_PUBLIC_PROOF_PORTAL_URL ?? "https://dflow.net/proof";
const verifyBaseUrl =
  process.env.NEXT_PUBLIC_PROOF_VERIFY_URL ?? "https://proof.dflow.net/verify";
const redirectBaseUrl =
  process.env.NEXT_PUBLIC_PROOF_REDIRECT_URL ??
  "http://localhost:3000/callback";

type VerifyState = "unknown" | "verified" | "unverified";

export default function HomePage() {
  const accounts = useAccounts();
  const { open } = useModal();
  const { disconnect, isDisconnecting } = useDisconnect();
  const addresses =
    (accounts as Array<{ addressType: AddressType; address: string }> | null) ??
    null;
  const { isConnected, errors } = usePhantom();
  const { solana, isAvailable } = useSolana();

  // Prefer the Solana address if multiple types are available.
  const walletAddress = useMemo(() => {
    if (!addresses?.length) return null;
    const solanaAddress = addresses.find(
      (address) => address.addressType === AddressType.solana
    );
    return solanaAddress?.address ?? addresses[0]?.address ?? null;
  }, [addresses]);


  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("unknown");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Store the last connected wallet for the callback page.
  useEffect(() => {
    if (!walletAddress || typeof window === "undefined") return;
    window.localStorage.setItem("proof_demo_wallet", walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    if (errors?.connect) {
      // Keep this for user-facing error state only.
      console.warn("Phantom connect error:", errors.connect);
    }
  }, [errors]);

  // Reset derived values when the wallet changes.
  useEffect(() => {
    setTimestamp(null);
    setSignature(null);
    setDeepLink(null);
    setSignError(null);
    setVerifyState("unknown");
    setVerifyError(null);
  }, [walletAddress]);

  // Create a signed deep link for the Proof portal.
  const createDeepLink = async () => {
    if (!walletAddress) {
      setSignError("Connect a wallet to sign the Proof message.");
      return null;
    }
    if (!solana || !isAvailable) {
      setSignError("Phantom Solana provider is not available.");
      return null;
    }

    setIsSigning(true);
    setSignError(null);

    try {
      const nextTimestamp = Date.now();
      const message = buildProofMessage(nextTimestamp);
      const result = await solana.signMessage(message);
      const nextSignature = encodeSignature(result.signature);
      const redirectUri = buildRedirectUri(redirectBaseUrl, walletAddress);
      const nextDeepLink = buildDeepLink({
        wallet: walletAddress,
        signature: nextSignature,
        timestamp: nextTimestamp,
        redirectUri,
        proofPortalUrl,
      });

      setTimestamp(nextTimestamp);
      setSignature(nextSignature);
      setDeepLink(nextDeepLink);

      return nextDeepLink;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Signature failed.";
      setSignError(message);
      return null;
    } finally {
      setIsSigning(false);
    }
  };

  // Open the Proof portal in a new tab.
  const openProofPortal = () => {
    if (!deepLink) return;
    window.open(deepLink, "_blank", "noopener,noreferrer");
  };

  // Check verification status using the public verify endpoint.
  const handleVerify = async () => {
    if (!walletAddress) {
      setVerifyError("Connect a wallet to check verification.");
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const verified = await verifyWallet(walletAddress, verifyBaseUrl);
      setVerifyState(verified ? "verified" : "unverified");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification failed.";
      setVerifyError(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const badgeClass = verifyState === "verified" ? "verified" : "unverified";
  const badgeLabel =
    verifyState === "verified" ? "Verified" : "Unverified";

  return (
    <main className="container">
      <h1>Proof KYC Demo</h1>
      <p className="muted">
        Simple end-to-end flow: connect a wallet, sign the Proof message, open
        the Proof portal, and verify status on return.
      </p>

      <section className="section card">
        <h2>Overview</h2>
        <p className="muted">
          This demo walks through the Proof KYC flow end to end: connect a wallet,
          sign the Proof message, open the Proof portal, and verify status.
        </p>
        <p className="muted">
          It is designed for builders who want a simple, copyable reference
          implementation.
        </p>
      </section>

      <section className="section card">
        <h2>Builder Details</h2>
        <div className="section">
          <div>
            <p className="step-title">Message format</p>
            <div className="code">Proof KYC verification: {"{timestamp}"}</div>
            <p className="muted">Timestamp format: Unix milliseconds (13 digits).</p>
            <p className="muted">
              See{" "}
              <a
                href="https://pond.dflow.net/build/proof/partner-integration"
                target="_blank"
                rel="noreferrer"
              >
                Partner integration
              </a>
              .
            </p>
          </div>
          <div>
            <p className="step-title">Redirect URL</p>
            <div className="code">{redirectBaseUrl}</div>
            <p className="muted">
              See{" "}
              <a
                href="https://pond.dflow.net/build/proof/user-journeys"
                target="_blank"
                rel="noreferrer"
              >
                User journeys
              </a>
              .
            </p>
          </div>
          <div>
            <p className="step-title">Verify endpoint</p>
            <div className="code">{verifyBaseUrl}/{"{address}"}</div>
            <p className="muted">
              See{" "}
              <a
                href="https://pond.dflow.net/build/proof-api/verify-address"
                target="_blank"
                rel="noreferrer"
              >
                Verify address
              </a>
              .
            </p>
          </div>
          <div>
            <p className="step-title">Proof portal</p>
            <div className="code">{proofPortalUrl}</div>
            <p className="muted">
              See{" "}
              <a
                href="https://pond.dflow.net/learn/proof"
                target="_blank"
                rel="noreferrer"
              >
                Proof overview
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="section card">
        <div className="step active">
          {/* Step 1: Connect/Disconnect wallet via Phantom */}
          <p className="step-title">1. Connect a wallet (Phantom Connect)</p>
          <div className="row">
            {isConnected ? (
              <button
                className="button secondary"
                onClick={disconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            ) : (
              <button className="button" onClick={open}>
                Connect Wallet
              </button>
            )}
            {walletAddress && (
              <span className="code gap-3">Wallet: {walletAddress}</span>
            )}
          </div>
        </div>

        <div className={`step ${walletAddress ? "active" : ""}`}>
          {/* Step 2: Sign the Proof message and build the deep link */}
          <p className="step-title">2. Sign the Proof message</p>
          <p className="muted">
            Message format: <span className="code">Proof KYC verification: timestamp</span>
          </p>
          <button
            className="button"
            onClick={createDeepLink}
            disabled={!walletAddress || isSigning}
          >
            {isSigning ? "Signing..." : "Sign message"}
          </button>
          {signError && <p className="muted">Error: {signError}</p>}
          {timestamp && (
            <div className="row spacer-2">
              <span className="code">timestamp: {timestamp}</span>
              {signature && (
                <span className="code">signature: {signature}</span>
              )}
            </div>
          )}
        </div>

        <div className={`step ${deepLink ? "active" : ""}`}>
          {/* Step 3: Open the Proof portal with the deep link */}
          <p className="step-title">3. Open the Proof portal</p>
          {deepLink ? (
            <div className="spacer-2">
              <p className="muted">Generated deep link</p>
              <div className="code">{deepLink}</div>
              <div className="row spacer-2">
                <button className="button" onClick={openProofPortal}>
                  Open Proof portal
                </button>
              </div>
            </div>
          ) : (
            <p className="muted spacer-2">
              Sign the message to generate the deep link.
            </p>
          )}
        </div>

        <div className={`step ${walletAddress ? "active" : ""}`}>
          {/* Step 4: Verify status using the Proof API */}
          <p className="step-title">4. Verify status on return</p>
          <button
            className="button"
            onClick={handleVerify}
            disabled={!walletAddress || isVerifying}
          >
            {isVerifying ? "Checking..." : "Check verification"}
          </button>
          {verifyError && <p className="muted">Error: {verifyError}</p>}
          {!verifyError && verifyState !== "unknown" && (
            <div className="row">
              <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
              <span className="muted">
                Verification status for {walletAddress}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h3>Notes</h3>
          <ul className="muted">
            <li>Redirect URL is read from .env.local.</li>
            <li>Proof portal handles document upload; no mock UI here.</li>
            <li>
              The callback page reads the wallet from the query string or
              local storage to check verification.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
