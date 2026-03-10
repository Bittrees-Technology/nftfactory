import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import AppProviders from "../components/AppProviders";
import HeaderWalletButton from "../components/HeaderWalletButton";

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
            <div className="topBar">
              <nav>
                <div className="navLinks">
                  <Link href="/" className="brandLink">NFTFactory</Link>
                  <Link href="/mint">Mint</Link>
                  <Link href="/profile">Profile</Link>
                </div>
                <HeaderWalletButton />
              </nav>
            </div>
            {children}
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
