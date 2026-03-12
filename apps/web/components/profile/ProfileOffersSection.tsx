"use client";

import type { Address } from "viem";
import { getAppChain } from "../../lib/chains";
import type { ActionState } from "../../lib/actionState";
import type { LoadState } from "../../lib/loadState";
import {
  formatOfferPrice,
  toExplorerAddress,
  truncateAddress,
  type MarketplaceOffer
} from "../../lib/marketplace";
import { buildSectionLoadStatusItems } from "../../lib/loadStateSections";
import StatusStack from "../StatusStack";
import {
  formatEditionBalance,
  formatOfferAddressList,
  formatOfferRecipientBalances,
  formatOfferUnixTimestamp,
  getOfferRecipientBalance,
  getOfferRecipients
} from "./profileOffers";

type ProfileOffersSectionProps = {
  offerMarketplace: Address | null;
  offerLoadState: LoadState;
  offerLoadHint: string;
  offerActionState: ActionState;
  creatorOffersReceived: MarketplaceOffer[];
  creatorOffersMade: MarketplaceOffer[];
  offerRecipients: Record<number, Address[]>;
  offerHoldingBalances: Record<string, string>;
  connectedAddressLower: string;
  isConnected: boolean;
  chainId: number;
  actingOfferId: number | null;
  acceptOffer: (offer: MarketplaceOffer) => Promise<void>;
  cancelOffer: (offer: MarketplaceOffer) => Promise<void>;
};

export default function ProfileOffersSection({
  offerMarketplace,
  offerLoadState,
  offerLoadHint,
  offerActionState,
  creatorOffersReceived,
  creatorOffersMade,
  offerRecipients,
  offerHoldingBalances,
  connectedAddressLower,
  isConnected,
  chainId,
  actingOfferId,
  acceptOffer,
  cancelOffer
}: ProfileOffersSectionProps) {
  return (
    <div className="card formCard">
      <h3>Offers</h3>
      {!offerMarketplace ? (
        <p className="sectionLead">
          Wallet-to-wallet offers need `NEXT_PUBLIC_MARKETPLACE_ADDRESS`. No marketplace address is configured.
        </p>
      ) : (
        <>
          <p className="sectionLead">
            Active offers tied to this profile. Indexed ownership and ERC-1155 balances are used first, with on-chain fallback only for unresolved rows.
          </p>
          <StatusStack
            items={buildSectionLoadStatusItems({
              keyPrefix: "offers",
              loadState: offerLoadState,
              loadingMessage: "Loading active offers...",
              hintMessage: offerLoadHint,
              actionState: offerActionState
            })}
          />

          <div className="profileShell">
            <section className="card profileIdentityCard">
              <p className="eyebrow">Received</p>
              <h3>Received Offers</h3>
              {creatorOffersReceived.length === 0 ? (
                <p className="hint">No active offers currently target tokens owned by this profile’s resolved wallets.</p>
              ) : (
                <div className="listTable">
                  {creatorOffersReceived.map((offer) => {
                    const recipients = getOfferRecipients(offer, offerRecipients);
                    const hasConnectedRecipient = isConnected && recipients.some((item) => item.toLowerCase() === connectedAddressLower);
                    const connectedRecipientBalance = hasConnectedRecipient
                      ? getOfferRecipientBalance(offer, connectedAddressLower, offerHoldingBalances)
                      : null;
                    const hasEnoughConnectedBalance =
                      offer.standard.toUpperCase() !== "ERC1155" ||
                      connectedRecipientBalance === null ||
                      connectedRecipientBalance >= offer.quantity;
                    const canAccept = Boolean(hasConnectedRecipient && hasEnoughConnectedBalance);
                    const indexedBalanceSummary = formatOfferRecipientBalances(offer, recipients, offerHoldingBalances);
                    const contractExplorer = toExplorerAddress(offer.nft, offer.chainId);

                    return (
                      <article key={`received-${offer.id}`} className="listRow profileListingRow">
                        <span>
                          <strong>Offer</strong> #{offer.id}
                        </span>
                        <span>
                          <strong>Standard</strong> {offer.standard}
                        </span>
                        <span>
                          <strong>Token</strong> #{offer.tokenId.toString()}
                        </span>
                        <span>
                          <strong>Quantity</strong> {offer.quantity.toString()}
                        </span>
                        <span>
                          <strong>Price</strong> {formatOfferPrice(offer)}
                        </span>
                        <span>
                          <strong>Buyer</strong> {truncateAddress(offer.buyer)}
                        </span>
                        <span>
                          <strong>Recipients</strong> {formatOfferAddressList(recipients)}
                        </span>
                        {indexedBalanceSummary ? (
                          <span>
                            <strong>Indexed balances</strong> {indexedBalanceSummary}
                          </span>
                        ) : null}
                        <span>
                          <strong>Expires</strong> {formatOfferUnixTimestamp(offer.expiresAt)}
                        </span>
                        <span>
                          <strong>Chain</strong> {getAppChain(offer.chainId).name}
                        </span>
                        {contractExplorer ? (
                          <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                            Contract {truncateAddress(offer.nft)}
                          </a>
                        ) : (
                          <span className="mono">Contract {truncateAddress(offer.nft)}</span>
                        )}
                        <div className="row">
                          <button
                            type="button"
                            onClick={() => void acceptOffer(offer)}
                            disabled={actingOfferId === offer.id || !canAccept}
                          >
                            {actingOfferId === offer.id
                              ? "Accepting..."
                              : chainId !== offer.chainId
                                ? `Switch to ${getAppChain(offer.chainId).name}`
                                : "Accept offer"}
                          </button>
                          {!isConnected ? <span className="hint">Connect a current owner wallet to accept.</span> : null}
                          {isConnected && !hasConnectedRecipient ? <span className="hint">Connect one of the current owner wallets to accept.</span> : null}
                          {isConnected && hasConnectedRecipient && !hasEnoughConnectedBalance ? (
                            <span className="hint">
                              Connected wallet balance is {connectedRecipientBalance ? formatEditionBalance(connectedRecipientBalance) : "unavailable"}, but this offer needs {formatEditionBalance(offer.quantity)}.
                            </span>
                          ) : null}
                          {isConnected && hasConnectedRecipient && hasEnoughConnectedBalance && connectedRecipientBalance !== null ? (
                            <span className="hint">Connected wallet balance: {formatEditionBalance(connectedRecipientBalance)}.</span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card profileFeatureCard">
              <p className="eyebrow">Made</p>
              <h3>Offers Made</h3>
              {creatorOffersMade.length === 0 ? (
                <p className="hint">No active offers have been created from this profile’s resolved wallets yet.</p>
              ) : (
                <div className="listTable">
                  {creatorOffersMade.map((offer) => {
                    const canCancel = isConnected && connectedAddressLower === offer.buyer.toLowerCase();
                    const recipients = getOfferRecipients(offer, offerRecipients);
                    const indexedBalanceSummary = formatOfferRecipientBalances(offer, recipients, offerHoldingBalances);
                    const contractExplorer = toExplorerAddress(offer.nft, offer.chainId);
                    return (
                      <article key={`made-${offer.id}`} className="listRow profileListingRow">
                        <span>
                          <strong>Offer</strong> #{offer.id}
                        </span>
                        <span>
                          <strong>Standard</strong> {offer.standard}
                        </span>
                        <span>
                          <strong>Token</strong> #{offer.tokenId.toString()}
                        </span>
                        <span>
                          <strong>Quantity</strong> {offer.quantity.toString()}
                        </span>
                        <span>
                          <strong>Price</strong> {formatOfferPrice(offer)}
                        </span>
                        <span>
                          <strong>Payment</strong> {offer.paymentToken.toLowerCase() === "0x0000000000000000000000000000000000000000" ? "ETH" : truncateAddress(offer.paymentToken)}
                        </span>
                        <span>
                          <strong>Expires</strong> {formatOfferUnixTimestamp(offer.expiresAt)}
                        </span>
                        {indexedBalanceSummary ? (
                          <span>
                            <strong>Indexed balances</strong> {indexedBalanceSummary}
                          </span>
                        ) : null}
                        <span>
                          <strong>Chain</strong> {getAppChain(offer.chainId).name}
                        </span>
                        {contractExplorer ? (
                          <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                            Contract {truncateAddress(offer.nft)}
                          </a>
                        ) : (
                          <span className="mono">Contract {truncateAddress(offer.nft)}</span>
                        )}
                        <div className="row">
                          <button
                            type="button"
                            onClick={() => void cancelOffer(offer)}
                            disabled={actingOfferId === offer.id || !canCancel}
                          >
                            {actingOfferId === offer.id
                              ? "Canceling..."
                              : chainId !== offer.chainId
                                ? `Switch to ${getAppChain(offer.chainId).name}`
                                : "Cancel offer"}
                          </button>
                          {!isConnected ? <span className="hint">Connect the buyer wallet to cancel.</span> : null}
                          {isConnected && !canCancel ? <span className="hint">Connect the wallet that created this offer to cancel it.</span> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
