import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import AppProviders from "../components/AppProviders";
import DeployHealthBanner from "../components/DeployHealthBanner";
import SiteNavigation from "../components/SiteNavigation";
import { resolveConfiguredWalletConnectProjectId } from "../lib/walletConnect";

export const metadata: Metadata = {
  title: "NFTFactory",
  description: "Launch collections, creator pages, and NFT storefronts on nftfactory.eth"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const walletConnectProjectId = resolveConfiguredWalletConnectProjectId();

  return (
    <html lang="en">
      <body>
        <AppProviders walletConnectProjectId={walletConnectProjectId}>
          <main>
            <a className="skipLink" href="#page-content">Skip to content</a>
            <SiteNavigation />
            <DeployHealthBanner />
            <div id="page-content">
            {children}
            </div>
            <footer className="siteFooter"><span>NFTFactory · Create and share</span><Link href="/wiki">Help & documentation</Link><Link href="/wiki/storage">About storage</Link></footer>
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
