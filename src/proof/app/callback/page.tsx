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
        <p className="step-title">Verification status</p>
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
