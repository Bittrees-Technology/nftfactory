import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import AppProviders from "../components/AppProviders";
import DeployHealthBanner from "../components/DeployHealthBanner";
import HeaderWalletButton from "../components/HeaderWalletButton";
import { resolveWalletConnectProjectId } from "../lib/walletConnect";

export const metadata: Metadata = {
  title: "NFTFactory",
  description: "Mint, publish, and manage NFTs on nftfactory.eth"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const walletConnectProjectId = resolveWalletConnectProjectId();

  return (
    <html lang="en">
      <body>
        <AppProviders walletConnectProjectId={walletConnectProjectId}>
          <main>
            <div className="topBar">
              <nav>
                <div className="navLinks">
                  <Link href="/" className="brandLink">NFTFactory</Link>
                  <Link href="/mint">Mint</Link>
                  <Link href="/profile">Profile</Link>
                  <Link href="/wiki">Wiki</Link>
                </div>
                <HeaderWalletButton />
              </nav>
              <DeployHealthBanner />
            </div>
            {children}
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
