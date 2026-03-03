"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, type Address, type Hex } from "viem";
import {
  encodeCancelListing,
  encodeCreateListing,
  encodeSetApprovalForAll,
  toWeiBigInt
} from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import {
  fetchActiveListings,
  fetchCollectionTokens,
  fetchCollectionsByOwner,
  logPaymentTokenUsage
} from "../../lib/indexerApi";
import { getAppChain } from "../../lib/chains";
import { ipfsToGatewayUrl, useNftMetadataPreview } from "../../lib/nftMetadata";
import TxStatus, { type TxState } from "./TxStatus";
import ListingCard, { type ListingRow } from "./ListingCard";

type Standard = "ERC721" | "ERC1155";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_LISTING_DAYS = 365;

type OwnedMintRow = {
  key: string;
  tokenId: string;
  contractAddress: string;
  standard: Standard;
  source: "shared" | "custom";
  metadataCid: string;
  mediaCid: string | null;
  mintedAt: string;
  activeListingId: string | null;
};

type ContractOption = {
  address: string;
  label: string;
};

type InventorySort = "newest" | "oldest";

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function truncateAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatContractLabel(
  address: string,
  items: OwnedMintRow[],
  config: ReturnType<typeof getContractsConfig>
): string {
  const sample = items.find((item) => item.contractAddress.toLowerCase() === address.toLowerCase());
  if (!sample) return truncateAddress(address);
  if (address.toLowerCase() === config.shared721.toLowerCase()) return "NFTFactory Shared ERC-721";
  if (address.toLowerCase() === config.shared1155.toLowerCase()) return "NFTFactory Shared ERC-1155";
  return `Creator Collection ${truncateAddress(address)}`;
}

function InventoryTokenCard({
  item,
  ipfsGateway,
  selected,
  onSelect
}: {
  item: OwnedMintRow;
  ipfsGateway: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const metadataUrl = ipfsToGatewayUrl(item.metadataCid, ipfsGateway);
  const mediaUrl = ipfsToGatewayUrl(item.mediaCid, ipfsGateway);
  const preview = useNftMetadataPreview({
    metadataUri: item.metadataCid,
    mediaUri: item.mediaCid,
    gateway: ipfsGateway
  });

  const mediaTypeLabel = preview.imageUrl ? "Image" : preview.audioUrl ? "Audio" : "Metadata";
  const title = preview.name || `Token #${item.tokenId}`;
  const description = preview.description || "No metadata description available.";

  return (
    <div
      role="button"
      tabIndex={0}
      className={`selectionButton feedCard${selected ? " selectionButtonActive" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="feedCardHero">
        <div className="feedCardMedia">
          {preview.imageUrl ? (
            <img src={preview.imageUrl} alt={title} className="feedCardImage" loading="lazy" />
          ) : preview.audioUrl ? (
            <div className="feedCardMediaFallback">
              <span className="feedCardFallbackLabel">Audio</span>
              <audio controls src={preview.audioUrl} className="feedCardAudio" onClick={(e) => e.stopPropagation()}>
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className="feedCardMediaFallback">
              <div className="feedCardFallbackCopy">
                <span className="feedCardFallbackLabel">NFT</span>
                <strong>Token #{item.tokenId}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="feedCardContent">
          <div className="feedCardTop">
            <span className="feedCardStatus">{mediaTypeLabel}</span>
          </div>
          <div className="feedCardBody">
            <div className="feedCardMain">
              <p className="feedCardEyebrow">
                {item.source === "shared" ? "NFTFactory shared" : "Creator collection"} · {item.standard}
              </p>
              <h3 className="feedCardTitle">{title}</h3>
              <p className="feedCardMetaLine">{description}</p>
              <p className="feedCardMetaLine">Created {new Date(item.mintedAt).toLocaleString()}</p>
            </div>
            <div className="feedCardFacts">
              <div className="feedFact">
                <span className="feedFactLabel">Token</span>
                <span className="detailValue">#{item.tokenId}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Status</span>
                <span className="detailValue">{item.activeListingId ? `Listed #${item.activeListingId}` : "Ready to list"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="feedCardLinks">
        <span className="row">
          {metadataUrl ? (
            <a href={metadataUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink" onClick={(e) => e.stopPropagation()}>
              Metadata
            </a>
          ) : null}
          {mediaUrl ? (
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink" onClick={(e) => e.stopPropagation()}>
              Media
            </a>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export default function ListClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [selectedContract, setSelectedContract] = useState("");
  const [inventorySort, setInventorySort] = useState<InventorySort>("newest");
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<string[]>([]);
  const [erc1155Amount, setErc1155Amount] = useState("1");
  const [paymentTokenType, setPaymentTokenType] = useState<"ETH" | "ERC20">("ETH");
  const [erc20TokenAddress, setErc20TokenAddress] = useState("");
  const [priceInput, setPriceInput] = useState("0.01");
  const [listingDays, setListingDays] = useState("7");
  const [state, setState] = useState<TxState>({ status: "idle" });
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [editingListing, setEditingListing] = useState<ListingRow | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [ownedMints, setOwnedMints] = useState<OwnedMintRow[]>([]);
  const [mintInventoryLoading, setMintInventoryLoading] = useState(false);
  const [mintInventoryError, setMintInventoryError] = useState("");

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

  useEffect(() => {
    void loadListings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnedMints(): Promise<void> {
      if (!address) {
        setOwnedMints([]);
        setMintInventoryError("");
        return;
      }

      setMintInventoryLoading(true);
      setMintInventoryError("");
      try {
        const normalizedOwner = address.toLowerCase();
        const collections = await fetchCollectionsByOwner(address);
        if (cancelled) return;
        const byKey = new Map<string, OwnedMintRow>();

        const addRow = (row: OwnedMintRow): void => {
          byKey.set(row.key, row);
        };

        const tokenResults = await Promise.allSettled(
          (collections.collections || []).map((collection) => fetchCollectionTokens(collection.contractAddress))
        );
        if (cancelled) return;

        for (const result of tokenResults) {
          if (result.status !== "fulfilled") continue;
          for (const token of result.value.tokens || []) {
            if (token.ownerAddress.toLowerCase() !== normalizedOwner) continue;
            const contractAddress = token.collection.contractAddress;
            const normalizedContract = contractAddress.toLowerCase();
            const rowSource =
              normalizedContract === config.shared721.toLowerCase() || normalizedContract === config.shared1155.toLowerCase()
                ? "shared"
                : "custom";
            addRow({
              key: `${normalizedContract}:${token.tokenId}`,
              tokenId: token.tokenId,
              contractAddress,
              standard: token.collection.standard === "ERC1155" ? "ERC1155" : "ERC721",
              source: rowSource,
              metadataCid: token.metadataCid,
              mediaCid: token.mediaCid,
              mintedAt: token.mintedAt,
              activeListingId: token.activeListing?.listingId || null
            });
          }
        }

        setOwnedMints([...byKey.values()]);
      } catch (err) {
        if (!cancelled) {
          setOwnedMints([]);
          setMintInventoryError(err instanceof Error ? err.message : "Failed to load owned NFTs.");
        }
      } finally {
        if (!cancelled) setMintInventoryLoading(false);
      }
    }

    void loadOwnedMints();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const filteredOwnedMints = useMemo(
    () => ownedMints.filter((item) => item.standard === standard),
    [ownedMints, standard]
  );

  const contractOptions = useMemo<ContractOption[]>(() => {
    const unique = new Map<string, OwnedMintRow[]>();
    for (const item of filteredOwnedMints) {
      const key = item.contractAddress.toLowerCase();
      const existing = unique.get(key) || [];
      existing.push(item);
      unique.set(key, existing);
    }
    return [...unique.entries()].map(([key, items]) => ({
      address: items[0].contractAddress,
      label: formatContractLabel(items[0].contractAddress, items, config)
    }));
  }, [config, filteredOwnedMints]);

  useEffect(() => {
    if (contractOptions.length === 0) {
      setSelectedContract("");
      setSelectedTokenKeys([]);
      return;
    }
    if (!selectedContract || !contractOptions.some((item) => item.address.toLowerCase() === selectedContract.toLowerCase())) {
      setSelectedContract(contractOptions[0].address);
    }
  }, [contractOptions, selectedContract]);

  useEffect(() => {
    setSelectedTokenKeys([]);
  }, [selectedContract, standard]);

  const availableTokens = useMemo(
    () => {
      const rows = filteredOwnedMints.filter(
        (item) =>
          item.contractAddress.toLowerCase() === selectedContract.toLowerCase()
      );
      const sorted = [...rows];
      sorted.sort((a, b) => {
        const aTime = new Date(a.mintedAt).getTime();
        const bTime = new Date(b.mintedAt).getTime();
        return inventorySort === "newest" ? bTime - aTime : aTime - bTime;
      });
      return sorted;
    },
    [filteredOwnedMints, inventorySort, selectedContract]
  );

  const selectedTokens = useMemo(
    () => availableTokens.filter((item) => selectedTokenKeys.includes(item.key)),
    [availableTokens, selectedTokenKeys]
  );

  const listingExpiryDate = useMemo(() => {
    const parsedDays = Number.parseInt(listingDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0) return null;
    const expiresAt = Date.now() + parsedDays * 24 * 60 * 60 * 1000;
    return new Date(expiresAt);
  }, [listingDays]);

  async function loadListings(): Promise<void> {
    setListingsLoading(true);
    setListingsError("");
    try {
      if (!address) {
        setMyListings([]);
        return;
      }

      const account = address.toLowerCase();
      const listingRows = new Map<number, ListingRow>();

      let cursor = 0;
      let page = 0;
      let canLoadMore = true;
      while (canLoadMore && page < 10) {
        const response = await fetchActiveListings(cursor, 100, account);
        for (const item of response.items) {
          if (!item.token || !item.token.collection) continue;

          const listingId = Number.parseInt(item.listingId, 10) || item.id || 0;
          if (listingRows.has(listingId)) continue;

          listingRows.set(listingId, {
            id: listingId,
            seller: item.sellerAddress as Address,
            nft: item.collectionAddress as Address,
            tokenId: BigInt(item.tokenId),
            amount: BigInt(item.amountRaw || "1"),
            standard: item.standard,
            paymentToken: item.paymentToken as Address,
            price: BigInt(item.priceRaw),
            expiresAt: BigInt(item.expiresAtRaw || "0"),
            active: item.active !== false,
            metadataCid: item.token.metadataCid,
            mediaCid: item.token.mediaCid,
            mintedAt: item.token.mintedAt,
            mintTxHash: item.token.mintTxHash || null
          });
        }

        canLoadMore = response.canLoadMore;
        cursor = response.nextCursor;
        page += 1;
      }

      const nextListings = [...listingRows.values()].sort((a, b) => b.id - a.id);
      setMyListings(nextListings);
    } catch (err) {
      setListingsError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setListingsLoading(false);
    }
  }

  async function sendTransaction(to: `0x${string}`, data: `0x${string}`, value?: bigint): Promise<`0x${string}`> {
    if (!walletClient || !walletClient.account) throw new Error("Connect wallet first.");
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      to: to as Address,
      data: data as Hex,
      value
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`): Promise<void> {
    if (!publicClient) {
      throw new Error("Public client unavailable. Reconnect wallet and try again.");
    }
    await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
  }

  function toggleSelectedToken(key: string): void {
    setSelectedTokenKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  }

  function startListingUpdate(item: ListingRow): void {
    const nextStandard = item.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721";
    const nextContract = item.nft;
    const nextKey = `${item.nft.toLowerCase()}:${item.tokenId.toString()}`;
    const remainingMs = Math.max(24 * 60 * 60 * 1000, Number(item.expiresAt) * 1000 - Date.now());
    const nextDays = Math.min(MAX_LISTING_DAYS, Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))));

    setEditingListing(item);
    setStandard(nextStandard);
    setSelectedContract(nextContract);
    setSelectedTokenKeys([nextKey]);
    setErc1155Amount(item.amount.toString());
    if (item.paymentToken === ZERO_ADDRESS) {
      setPaymentTokenType("ETH");
      setErc20TokenAddress("");
      setPriceInput(formatEther(item.price));
    } else {
      setPaymentTokenType("ERC20");
      setErc20TokenAddress(item.paymentToken);
      setPriceInput(item.price.toString());
    }
    setListingDays(nextDays.toString());
    setState({
      status: "idle",
      message: `Editing listing #${item.id}. Submitting will cancel the current listing and create a replacement.`
    });
  }

  function clearListingUpdate(): void {
    setEditingListing(null);
    setState((current) =>
      current.status === "idle"
        ? { status: "idle" }
        : current
    );
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setState({ status: "idle" });

    if (!isConnected) {
      setState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    const submitContract = editingListing ? editingListing.nft : selectedContract;
    const submitStandard = editingListing
      ? (editingListing.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721")
      : standard;
    if (!isAddress(submitContract)) {
      setState({ status: "error", message: "Select a collection contract first." });
      return;
    }
    if (!editingListing && selectedTokens.length === 0) {
      setState({ status: "error", message: "Select at least one NFT to list." });
      return;
    }
    if (editingListing && selectedTokens.length > 1) {
      setState({ status: "error", message: "Updating a listing only supports one NFT at a time." });
      return;
    }

    const parsedAmount = submitStandard === "ERC721" ? 1 : Number.parseInt(erc1155Amount, 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setState({ status: "error", message: "Amount must be a positive integer." });
      return;
    }

    const parsedDays = Number.parseInt(listingDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > MAX_LISTING_DAYS) {
      setState({ status: "error", message: `Listing length must be between 1 and ${MAX_LISTING_DAYS} days.` });
      return;
    }

    const paymentToken =
      paymentTokenType === "ETH"
        ? (ZERO_ADDRESS as `0x${string}`)
        : ((isAddress(erc20TokenAddress) ? erc20TokenAddress : "") as `0x${string}`);
    if (paymentTokenType === "ERC20" && !isAddress(erc20TokenAddress)) {
      setState({ status: "error", message: "Enter a valid ERC20 token address." });
      return;
    }

    let priceWei: bigint;
    try {
      if (paymentTokenType === "ETH") {
        priceWei = toWeiBigInt(priceInput);
      } else {
        const normalized = priceInput.trim();
        if (!/^[0-9]+$/.test(normalized)) {
          throw new Error("ERC20 price must be a whole number in raw token units.");
        }
        priceWei = BigInt(normalized);
      }
    } catch {
      setState({ status: "error", message: "Price is invalid." });
      return;
    }
    if (priceWei <= 0n) {
      setState({ status: "error", message: "Price must be greater than zero." });
      return;
    }

    try {
      if (editingListing) {
        setCancelingId(editingListing.id);
        setState({ status: "pending", message: `Canceling listing #${editingListing.id} before replacement...` });
        const cancelTx = await sendTransaction(
          config.marketplace as `0x${string}`,
          encodeCancelListing(BigInt(editingListing.id)) as `0x${string}`
        );
        await waitForReceipt(cancelTx);
      }

      setState({ status: "pending", message: "Approving marketplace for selected collection..." });
      const approvalTx = await sendTransaction(
        submitContract as `0x${string}`,
        encodeSetApprovalForAll(config.marketplace as `0x${string}`, true) as `0x${string}`
      );
      await waitForReceipt(approvalTx);

      let latestHash = approvalTx;
      const tokensToList = editingListing
        ? [{ tokenId: editingListing.tokenId.toString() }]
        : selectedTokens;
      for (let index = 0; index < tokensToList.length; index += 1) {
        const token = tokensToList[index];
        setState({
          status: "pending",
          hash: latestHash,
          message: `Creating listing ${index + 1} of ${tokensToList.length}...`
        });
        const listingTx = await sendTransaction(
          config.marketplace as `0x${string}`,
          encodeCreateListing(
            submitContract as `0x${string}`,
            BigInt(token.tokenId),
            BigInt(parsedAmount),
            submitStandard,
            paymentToken,
            priceWei,
            BigInt(parsedDays)
          ) as `0x${string}`
        );
        latestHash = listingTx;
        await waitForReceipt(listingTx);
      }

      if (paymentTokenType === "ERC20" && paymentToken !== ZERO_ADDRESS) {
        try {
          await logPaymentTokenUsage({
            tokenAddress: paymentToken,
            sellerAddress: address || "",
            listingIds: tokensToList.map((item) => item.tokenId)
          });
        } catch {
          // Token logging is best-effort and should not fail the listing flow.
        }
      }

      setState({
        status: "success",
        hash: latestHash,
        message:
          editingListing
            ? `Listing #${editingListing.id} was replaced successfully.`
            : selectedTokens.length === 1
              ? "Listing submitted successfully."
              : `${selectedTokens.length} listings submitted successfully.`
      });
      setEditingListing(null);
      setSelectedTokenKeys([]);
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Listing failed" });
    } finally {
      setCancelingId(null);
    }
  }

  async function onCancelListing(listingId: number): Promise<void> {
    if (!isConnected) {
      setState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }

    try {
      setCancelingId(listingId);
      setState({ status: "pending", message: `Canceling listing #${listingId}...` });
      const txHash = await sendTransaction(
        config.marketplace as `0x${string}`,
        encodeCancelListing(BigInt(listingId)) as `0x${string}`
      );
      await waitForReceipt(txHash);
      setState({ status: "success", hash: txHash, message: `Cancellation submitted for listing #${listingId}.` });
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Cancel failed" });
    } finally {
      setCancelingId(null);
    }
  }

  async function copyText(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1200);
    } catch {
      // no-op
    }
  }
  const selectedContractLabel = selectedContract
    ? formatContractLabel(selectedContract, availableTokens, config)
    : "";

  return (
    <section className="wizard">
      <form className="wizard" onSubmit={onSubmit}>
        <div className="card formCard">
          <h3>1. Select NFT</h3>
          <p className="hint">Choose a standard, then select one or more NFTs already in this wallet from NFTFactory shared or custom collections.</p>
          <div className="gridMini">
            <label>
              Standard
              <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                <option value="ERC721">ERC721</option>
                <option value="ERC1155">ERC1155</option>
              </select>
            </label>
          </div>
          <p className="hint">
            {isConnected
              ? `Connected wallet: ${address}`
              : "Connect a wallet from the header to load owned NFTs that can be listed."}
          </p>
          {wrongNetwork ? <p className="hint">Use the header wallet button to select {appChain.name} before listing.</p> : null}
          {contractOptions.length > 1 ? (
            <div className="gridMini">
              <label>
                Collection contract
                <select value={selectedContract} onChange={(e) => setSelectedContract(e.target.value)}>
                  {contractOptions.map((option) => (
                    <option key={option.address} value={option.address}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inventory sort
                <select value={inventorySort} onChange={(e) => setInventorySort(e.target.value as InventorySort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>
          ) : contractOptions.length === 1 ? (
            <div className="selectionCard">
              <span className="detailLabel">Collection Contract</span>
              <p className="detailValue">{contractOptions[0].label}</p>
              <p className="mono">{contractOptions[0].address}</p>
            </div>
          ) : (
            <p className="hint">
              {mintInventoryLoading
                ? "Loading owned NFTs..."
                : "No owned NFTs from the selected NFTFactory contracts match this standard yet."}
            </p>
          )}
          {mintInventoryError ? <p className="error">{mintInventoryError}</p> : null}
          {selectedContract ? (
            <>
              <p className="sectionLead">Selected collection: {selectedContractLabel}</p>
              {contractOptions.length <= 1 && availableTokens.length > 1 ? (
                <div className="row">
                  <label>
                    Inventory sort
                    <select value={inventorySort} onChange={(e) => setInventorySort(e.target.value as InventorySort)}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="compactList compactSelectionGrid">
                {availableTokens.length > 0 ? (
                  availableTokens.map((item) => {
                    const selected = selectedTokenKeys.includes(item.key);
                    return (
                      <InventoryTokenCard
                        key={item.key}
                        item={item}
                        ipfsGateway={ipfsGateway}
                        selected={selected}
                        onSelect={() => toggleSelectedToken(item.key)}
                      />
                    );
                  })
                ) : (
                  <p className="hint">No indexed NFTs were found for this collection yet.</p>
                )}
              </div>
            </>
          ) : null}
          {standard === "ERC1155" ? (
            <label>
              Copies per listing
              <input value={erc1155Amount} onChange={(e) => setErc1155Amount(e.target.value)} inputMode="numeric" placeholder="1" />
            </label>
          ) : null}
        </div>

        <div className="card formCard">
          <h3>2. Create Listing</h3>
          <p className="hint">Set the payment asset, choose the fixed price, and choose how long the listing should stay live.</p>
          {editingListing ? (
            <div className="selectionCard">
              <span className="detailLabel">Editing Listing</span>
              <p className="detailValue">#{editingListing.id} for token #{editingListing.tokenId.toString()}</p>
              <p className="hint">Submitting this form will cancel the current listing and create a replacement with the updated terms.</p>
              <div className="row">
                <button type="button" className="miniBtn" onClick={clearListingUpdate}>
                  Clear Update Mode
                </button>
              </div>
            </div>
          ) : null}
          <div className="gridMini">
            <label>
              Payment asset
              <select value={paymentTokenType} onChange={(e) => setPaymentTokenType(e.target.value as "ETH" | "ERC20")}>
                <option value="ETH">ETH</option>
                <option value="ERC20">Custom ERC20</option>
              </select>
            </label>
            {paymentTokenType === "ERC20" ? (
              <label>
                ERC20 contract
                <input value={erc20TokenAddress} onChange={(e) => setErc20TokenAddress(e.target.value)} placeholder="0x..." />
              </label>
            ) : null}
            <label>
              {paymentTokenType === "ETH" ? "Price per NFT (ETH)" : "Price per NFT (token units)"}
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={paymentTokenType === "ETH" ? "0.01" : "1000000"}
              />
            </label>
            <label>
              Listing length (days)
              <input value={listingDays} onChange={(e) => setListingDays(e.target.value)} inputMode="numeric" placeholder="7" />
            </label>
          </div>
          <p className="hint">
            Expiration: {listingExpiryDate ? listingExpiryDate.toLocaleString() : "Enter a valid duration"} (minimum 1 day, maximum {MAX_LISTING_DAYS} days)
          </p>
          {paymentTokenType === "ERC20" ? (
            <p className="hint">
              Custom ERC20 payment tokens are logged automatically so trusted tokens can be approved and suspicious ones can be flagged in admin.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!isConnected || wrongNetwork || state.status === "pending" || (!editingListing && selectedTokens.length === 0)}
          >
            {state.status === "pending"
              ? "Submitting..."
              : editingListing
                ? `Update Listing #${editingListing.id}`
                : selectedTokens.length > 1
                ? `Create ${selectedTokens.length} Listings`
                : "Create Listing"}
          </button>
          <TxStatus state={state} />
        </div>

        <div className="card formCard">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3>3. My Active Listings</h3>
            <button type="button" onClick={loadListings} disabled={listingsLoading}>
              {listingsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {!isConnected ? <p className="hint">Connect a wallet to view and manage live listings for this address.</p> : null}
          {listingsError ? <p className="error">{listingsError}</p> : null}
          {isConnected && myListings.length === 0 && !listingsLoading ? (
            <p className="hint">No active listings are live for this wallet yet.</p>
          ) : null}
          {myListings.length > 0 ? (
            <div className="listTable">
              {myListings.map((item) => (
                <ListingCard
                  key={item.id}
                  item={item}
                  ipfsGateway={ipfsGateway}
                  chainId={config.chainId}
                  currentAddress={address}
                  wrongNetwork={wrongNetwork}
                  isConnected={isConnected}
                  isBuying={false}
                  isCanceling={cancelingId === item.id}
                  copiedKey={copiedKey}
                  onBuy={(_item) => undefined}
                  onCancel={onCancelListing}
                  onUpdate={startListingUpdate}
                  onCopy={copyText}
                  variant="mine"
                />
              ))}
            </div>
          ) : null}
          {myListings.length > 0 ? (
            <p className="hint">
              Each listing stays independent, so any single listing can be canceled by ID even if it was created in the same batch.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
