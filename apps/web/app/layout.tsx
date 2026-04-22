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
                <div className="brandCluster">
                  <Link href="/" className="brandLink">NFTFactory</Link>
                  <p className="brandMeta">Creator-owned mint, profile, and collection operations in one surface.</p>
                </div>
                <div className="navLinks">
                  <Link href="/" className="navPill">Home</Link>
                  <Link href="/mint" className="navPill">Mint</Link>
                  <Link href="/profile" className="navPill">Profile</Link>
                  <Link href="/wiki" className="navPill">Wiki</Link>
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
