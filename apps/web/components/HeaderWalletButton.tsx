"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getEnabledAppChainIds } from "../lib/chains";

export default function HeaderWalletButton() {
  const supportedChainIds = getEnabledAppChainIds();

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
        const currentChainId = typeof chain?.id === "number" ? chain.id : null;
        const connected = Boolean(ready && account && chain);
        const unsupportedConfiguredNetwork = Boolean(
          connected && currentChainId !== null && !supportedChainIds.includes(currentChainId)
        );

        function onClick() {
          if (!connected) {
            openConnectModal();
            return;
          }
          if (chain?.unsupported || unsupportedConfiguredNetwork) {
            openChainModal();
            return;
          }
          openAccountModal();
        }

        const title = !connected
          ? "Connect wallet"
          : unsupportedConfiguredNetwork || chain?.unsupported
              ? "Select a supported network"
              : `Wallet connected on ${chain?.name || "Unknown network"}`;

        const ariaLabel = !connected
          ? "Open wallet login"
          : unsupportedConfiguredNetwork || chain?.unsupported
              ? "Open network selector"
              : "Open wallet account";

        return (
          <button
            type="button"
            className={`headerWalletButton ${connected ? "walletConnected" : ""}`}
            onClick={onClick}
            aria-label={ariaLabel}
            title={title}
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
