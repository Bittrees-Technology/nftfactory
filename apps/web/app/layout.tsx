import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import AppProviders from "./providers";
import HeaderWalletButton from "./HeaderWalletButton";

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
                  <Link href="/list">List</Link>
                  <Link href="/discover">Discover</Link>
                  <Link href="/profile">Profile</Link>
                  <Link href="/admin">Admin</Link>
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
