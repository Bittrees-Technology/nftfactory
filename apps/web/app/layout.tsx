import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import AppProviders from "./providers";

export const metadata: Metadata = {
  title: "NFTFactory",
  description: "Mint, publish, and manage NFTs on nftfactory.eth"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <main>
            <nav>
              <Link href="/">NFTFactory</Link>
              <Link href="/mint">Mint</Link>
              <Link href="/list">List</Link>
              <Link href="/discover">Discover</Link>
              <Link href="/admin">Admin</Link>
            </nav>
            {children}
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
