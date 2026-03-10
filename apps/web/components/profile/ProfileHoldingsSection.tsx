"use client";

import Link from "next/link";
import ListingManagementClient from "./ListingManagementClient";
import SectionCardHeader from "../SectionCardHeader";
import StatusStack from "../StatusStack";
import { getAppChain } from "../../lib/chains";
import type { LoadState } from "../../lib/loadState";
import { isLoadStateLoading } from "../../lib/loadState";
import { buildSectionLoadStatusItems } from "../../lib/loadStateSections";
import { toExplorerAddress, truncateAddress } from "../../lib/marketplace";
import type { ApiProfileViewResponse } from "../../lib/profileViewApi";
import {
  getOwnerHoldingPresentation,
  normalizeOwnerHoldingAmountRaw
} from "../../lib/ownerHoldingPresentation";

type ProfileHolding = ApiProfileViewResponse["holdings"][number];

type ProfileHoldingsSectionProps = {
  holdingsLoadState: LoadState;
  holdingsStatus: string;
  filteredCreatorHoldings: ProfileHolding[];
  configChainId: number;
  canEditProfile: boolean;
  primaryOwnerAddress: string | null;
  mintProfileParam: string;
  selectedChainFilter: "all" | number;
};

export default function ProfileHoldingsSection({
  holdingsLoadState,
  holdingsStatus,
  filteredCreatorHoldings,
  configChainId,
  canEditProfile,
  primaryOwnerAddress,
  mintProfileParam,
  selectedChainFilter
}: ProfileHoldingsSectionProps) {
  return (
    <>
      <div className="card formCard">
        <h3>Holdings Snapshot</h3>
        <p className="sectionLead">
          Owner-scoped indexed holdings across the resolved wallets for this profile. `Held`, `Listed`, and `Available`
          come from the same owner holdings model used by listing management.
        </p>
        <StatusStack
          items={buildSectionLoadStatusItems({
            keyPrefix: "holdings",
            loadState: holdingsLoadState,
            loadingMessage: "Loading indexed holdings...",
            hintMessage: holdingsStatus
          })}
        />
        {!isLoadStateLoading(holdingsLoadState) && filteredCreatorHoldings.length === 0 ? (
          <p className="hint">No indexed holdings were found for the resolved wallets yet.</p>
        ) : null}
        {filteredCreatorHoldings.length > 0 ? (
          <div className="listTable">
            {filteredCreatorHoldings.map((holding) => {
              if (!holding.collection) return null;
              const ownerHolding = getOwnerHoldingPresentation({
                standard: holding.collection.standard,
                tokenId: holding.tokenId,
                ensSubname: holding.collection.ensSubname,
                draftName: holding.draftName || null,
                draftDescription: holding.draftDescription || null,
                heldAmountRaw: holding.heldAmountRaw || null,
                reservedAmountRaw: normalizeOwnerHoldingAmountRaw(holding.reservedAmountRaw),
                availableAmountRaw: normalizeOwnerHoldingAmountRaw(holding.availableAmountRaw),
                mintedAmountRaw: holding.mintedAmountRaw || null,
                activeListing: holding.activeListing
                  ? {
                      listingId: holding.activeListing.listingId,
                      paymentToken: holding.activeListing.paymentToken,
                      priceRaw: holding.activeListing.priceRaw
                    }
                  : null
              });
              const holdingChainId = holding.collection.chainId || configChainId;
              const contractExplorer = toExplorerAddress(holding.collection.contractAddress, holdingChainId);

              return (
                <article
                  key={`${holding.ownerAddress.toLowerCase()}:${holding.collection.contractAddress.toLowerCase()}:${holding.tokenId}`}
                  className="listRow profileListingRow"
                >
                  <span>
                    <strong>{ownerHolding.title}</strong>
                  </span>
                  <span>{ownerHolding.description}</span>
                  <span>
                    <strong>Status</strong> {ownerHolding.statusLabel}
                  </span>
                  <span>
                    <strong>Standard</strong> {holding.collection.standard}
                  </span>
                  <span>
                    <strong>Token</strong> #{holding.tokenId}
                  </span>
                  <span>
                    <strong>Held</strong> {ownerHolding.heldAmountLabel}
                  </span>
                  {ownerHolding.reservedAmountLabel ? (
                    <span>
                      <strong>Listed</strong> {ownerHolding.reservedAmountLabel}
                    </span>
                  ) : null}
                  {ownerHolding.availableAmountLabel ? (
                    <span>
                      <strong>Available</strong> {ownerHolding.availableAmountLabel}
                    </span>
                  ) : null}
                  <span>
                    <strong>Owner</strong> {truncateAddress(holding.ownerAddress)}
                  </span>
                  <span>
                    <strong>Chain</strong> {getAppChain(holdingChainId).name}
                  </span>
                  {ownerHolding.collectionIdentity ? (
                    <span>
                      <strong>Collection</strong> {ownerHolding.collectionIdentity}
                    </span>
                  ) : null}
                  {contractExplorer ? (
                    <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                      Contract {truncateAddress(holding.collection.contractAddress)}
                    </a>
                  ) : (
                    <span className="mono">Contract {truncateAddress(holding.collection.contractAddress)}</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {canEditProfile && primaryOwnerAddress ? (
        <div id="listing-management" className="wizard">
          <div className="card formCard">
            <SectionCardHeader
              title="Listing Management"
              description="Manage inventory and Marketplace V2 listings directly from this profile. Collection tools stay in Mint, but listing actions now live here."
              descriptionClassName="sectionLead"
              actions={
                <>
                  <Link
                    href={`/mint?view=view&profile=${encodeURIComponent(mintProfileParam)}`}
                    className="ctaLink secondaryLink"
                  >
                    View collection
                  </Link>
                  <Link
                    href={`/mint?view=manage&profile=${encodeURIComponent(mintProfileParam)}`}
                    className="ctaLink secondaryLink"
                  >
                    Manage collection
                  </Link>
                </>
              }
            />
          </div>
          <ListingManagementClient embedded ownerAddress={primaryOwnerAddress} chainFilter={selectedChainFilter} />
        </div>
      ) : null}
    </>
  );
}
