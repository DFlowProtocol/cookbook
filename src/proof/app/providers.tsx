"use client";

import { PhantomProvider, darkTheme } from "@phantom/react-sdk";
import { AddressType } from "@phantom/browser-sdk";
import React from "react";

// Phantom Connect configuration for embedded + injected providers.
const phantomAppId = process.env.NEXT_PUBLIC_PHANTOM_APP_ID ?? "";
const phantomRedirectUrl = process.env.NEXT_PUBLIC_PHANTOM_REDIRECT_URL ?? "";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PhantomProvider
      config={{
        providers: ["injected", "google", "apple"],
        appId: phantomAppId,
        addressTypes: [AddressType.solana],
        authOptions: phantomRedirectUrl
          ? { redirectUrl: phantomRedirectUrl }
          : undefined,
      }}
      theme={darkTheme}
      appName="Proof Demo"
    >
      {children}
    </PhantomProvider>
  );
}
