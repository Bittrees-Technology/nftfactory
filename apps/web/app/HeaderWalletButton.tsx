"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getAppChain } from "../lib/chains";
import { getContractsConfig } from "../lib/contracts";

export default function HeaderWalletButton() {
  const config = getContractsConfig();
  const expectedChain = getAppChain(config.chainId);

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
        const wrongConfiguredNetwork = Boolean(connected && chain.id !== config.chainId);

        function onClick() {
          if (!connected) {
            openConnectModal();
            return;
          }
          if (chain.unsupported || wrongConfiguredNetwork) {
            openChainModal();
            return;
          }
          openAccountModal();
        }

        const title = !connected
          ? "Connect wallet"
          : wrongConfiguredNetwork
            ? `Select ${expectedChain.name} in your wallet`
            : chain.unsupported
              ? "Select a supported network"
              : "Wallet connected";

        const ariaLabel = !connected
          ? "Open wallet login"
          : wrongConfiguredNetwork
            ? `Open network selector for ${expectedChain.name}`
            : chain.unsupported
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
