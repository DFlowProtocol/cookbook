"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { verifyWallet } from "../../lib/proof";

const verifyBaseUrl =
  process.env.NEXT_PUBLIC_PROOF_VERIFY_URL ?? "https://proof.dflow.net/verify";

type VerifyState = "idle" | "verified" | "unverified" | "error";

export default function CallbackPage() {
  const searchParams = useSearchParams();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Capture every query parameter Proof sends back on the redirect.
  const allParams = Array.from(searchParams.entries());
  const statusParam = searchParams.get("status");

  useEffect(() => {
    const walletFromQuery = searchParams.get("wallet");
    if (walletFromQuery) {
      setWalletAddress(walletFromQuery);
      return;
    }

    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("proof_demo_wallet");
    setWalletAddress(stored);
  }, [searchParams]);

  useEffect(() => {
    if (!walletAddress) return;

    let isMounted = true;
    const run = async () => {
      try {
        const verified = await verifyWallet(walletAddress, verifyBaseUrl);
        if (!isMounted) return;
        setVerifyState(verified ? "verified" : "unverified");
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : "Verification failed.";
        setErrorMessage(message);
        setVerifyState("error");
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [walletAddress]);

  return (
    <main className="container">
      <h1>Proof Callback</h1>
      <p className="muted">
        Returned from Proof. This page checks the verification status for the
        wallet that initiated the deep link.
      </p>

      <section className="section card">
        <p className="step-title">Wallet</p>
        <div className="code">{walletAddress ?? "Missing wallet address"}</div>
      </section>

      <section className="section card">
        <p className="step-title">Redirect query parameters</p>
        <p className="muted">
          All query parameters returned by Proof on the redirect URL:
        </p>
        {allParams.length === 0 ? (
          <div className="code">No query parameters</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {allParams.map(([key, value]) => (
              <div
                key={key}
                className="code"
                style={key === "status" ? { border: "1px solid #4ade80" } : undefined}
              >
                <strong>{key}</strong>: {value}
              </div>
            ))}
          </div>
        )}
        {statusParam !== null ? (
          <p className="muted" style={{ marginTop: "8px" }}>
            Proof returned <strong>status={statusParam}</strong> on the redirect.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: "8px" }}>
            Proof did <strong>not</strong> include a &quot;status&quot; parameter on the redirect.
          </p>
        )}
      </section>

      <section className="section card">
        <p className="step-title">Verification status (from API)</p>
        {verifyState === "idle" && (
          <span className="badge neutral">Waiting for wallet...</span>
        )}
        {verifyState === "verified" && (
          <span className="badge verified">Verified</span>
        )}
        {verifyState === "unverified" && (
          <span className="badge unverified">Unverified</span>
        )}
        {verifyState === "error" && (
          <>
            <span className="badge unverified">Error</span>
            <p className="muted">Error: {errorMessage}</p>
          </>
        )}
      </section>

      <section className="section">
        <a className="button secondary" href="/">
          Back to demo
        </a>
      </section>
    </main>
  );
}
