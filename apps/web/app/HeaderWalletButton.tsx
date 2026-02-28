"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function HeaderWalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        function onClick() {
          if (!connected) {
            openConnectModal();
            return;
          }
          if (chain.unsupported) {
            openChainModal();
            return;
          }
          openAccountModal();
        }

        return (
          <button
            type="button"
            className={`headerWalletButton ${connected ? "walletConnected" : ""}`}
            onClick={onClick}
            aria-label={connected ? "Open wallet account" : "Open wallet login"}
            title={connected ? "Wallet connected" : "Connect wallet"}
          >
            <span className="walletGlyph" aria-hidden="true">
              <span className="walletDot" />
              <span className="walletStem" />
            </span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
