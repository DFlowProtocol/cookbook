import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Proof Demo",
  description: "End-to-end Proof KYC flow demo with Phantom Connect",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
