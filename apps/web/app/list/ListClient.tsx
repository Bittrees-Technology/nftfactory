"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import {
  encodeCancelListing,
  encodeCreateListing,
  encodeSetApprovalForAll,
  toWeiBigInt
} from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import { fetchActiveListingsBatch } from "../../lib/marketplace";
import { fetchMintFeed, type ApiMintFeedItem } from "../../lib/indexerApi";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import TxStatus, { type TxState } from "./TxStatus";
import ListingCard, { type ListingRow } from "./ListingCard";

type Standard = "ERC721" | "ERC1155";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_SCAN_LIMIT = 200;

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

function toGatewayUrl(cid: string | null | undefined, gateway: string): string | null {
  if (!cid) return null;
  return `${gateway}/${cid}`;
}

export default function ListClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [source, setSource] = useState<"shared" | "custom">("shared");
  const [selectedContract, setSelectedContract] = useState("");
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<string[]>([]);
  const [erc1155Amount, setErc1155Amount] = useState("1");
  const [paymentTokenType, setPaymentTokenType] = useState<"ETH" | "ERC20">("ETH");
  const [erc20TokenAddress, setErc20TokenAddress] = useState("");
  const [priceInput, setPriceInput] = useState("0.01");
  const [listingDays, setListingDays] = useState("7");
  const [state, setState] = useState<TxState>({ status: "idle" });
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [scanDepth, setScanDepth] = useState("200");
  const [ownedMints, setOwnedMints] = useState<OwnedMintRow[]>([]);
  const [mintInventoryLoading, setMintInventoryLoading] = useState(false);
  const [mintInventoryError, setMintInventoryError] = useState("");

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const parsedScanDepth = Number.parseInt(scanDepth, 10);
  const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

  useEffect(() => {
    void loadListings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const response = await fetchMintFeed(0, 100);
        if (cancelled) return;
        const normalizedOwner = address.toLowerCase();
        const next = response.items
          .filter((item) => item.ownerAddress.toLowerCase() === normalizedOwner)
          .map((item) => {
            const contractAddress = item.collection.contractAddress;
            const normalizedContract = contractAddress.toLowerCase();
            const rowSource =
              normalizedContract === config.shared721.toLowerCase() || normalizedContract === config.shared1155.toLowerCase()
                ? "shared"
                : "custom";
            return {
              key: `${contractAddress.toLowerCase()}:${item.tokenId}`,
              tokenId: item.tokenId,
              contractAddress,
              standard: item.collection.standard === "ERC1155" ? "ERC1155" : "ERC721",
              source: rowSource,
              metadataCid: item.metadataCid,
              mediaCid: item.mediaCid,
              mintedAt: item.mintedAt,
              activeListingId: item.activeListing?.listingId || null
            } satisfies OwnedMintRow;
          });
        setOwnedMints(next);
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
  }, [address, config.shared721, config.shared1155]);

  const filteredOwnedMints = useMemo(
    () => ownedMints.filter((item) => item.standard === standard && item.source === source),
    [ownedMints, standard, source]
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
  }, [selectedContract, source, standard]);

  const availableTokens = useMemo(
    () =>
      filteredOwnedMints.filter(
        (item) =>
          item.contractAddress.toLowerCase() === selectedContract.toLowerCase()
      ),
    [filteredOwnedMints, selectedContract]
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
      const limit = Number.isInteger(parsedScanDepth) && parsedScanDepth > 0 ? parsedScanDepth : DEFAULT_SCAN_LIMIT;
      const result = await fetchActiveListingsBatch({
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        marketplace: config.marketplace as Address,
        limit
      });
      const active = result.listings;
      if (address) {
        const account = address.toLowerCase();
        setMyListings(
          active
            .filter((row) => row.seller.toLowerCase() === account)
            .map((row) => ({ ...row }))
        );
      } else {
        setMyListings([]);
      }
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
    if (!isAddress(selectedContract)) {
      setState({ status: "error", message: "Select a collection contract first." });
      return;
    }
    if (selectedTokens.length === 0) {
      setState({ status: "error", message: "Select at least one NFT to list." });
      return;
    }

    const parsedAmount = standard === "ERC721" ? 1 : Number.parseInt(erc1155Amount, 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setState({ status: "error", message: "Amount must be a positive integer." });
      return;
    }

    const parsedDays = Number.parseInt(listingDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
      setState({ status: "error", message: "Listing length must be at least 1 day." });
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
      setState({ status: "pending", message: "Approving marketplace for selected collection..." });
      const approvalTx = await sendTransaction(
        selectedContract as `0x${string}`,
        encodeSetApprovalForAll(config.marketplace as `0x${string}`, true) as `0x${string}`
      );
      await waitForReceipt(approvalTx);

      let latestHash = approvalTx;
      for (let index = 0; index < selectedTokens.length; index += 1) {
        const token = selectedTokens[index];
        setState({
          status: "pending",
          hash: latestHash,
          message: `Creating listing ${index + 1} of ${selectedTokens.length}...`
        });
        const listingTx = await sendTransaction(
          config.marketplace as `0x${string}`,
          encodeCreateListing(
            selectedContract as `0x${string}`,
            BigInt(token.tokenId),
            BigInt(parsedAmount),
            standard,
            paymentToken,
            priceWei,
            BigInt(parsedDays)
          ) as `0x${string}`
        );
        latestHash = listingTx;
        await waitForReceipt(listingTx);
      }

      setState({
        status: "success",
        hash: latestHash,
        message:
          selectedTokens.length === 1
            ? "Listing submitted successfully."
            : `${selectedTokens.length} listings submitted successfully.`
      });
      setSelectedTokenKeys([]);
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Listing failed" });
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

  const explorerBase = getExplorerBaseUrl(config.chainId);

  return (
    <section className="wizard">
      <form className="wizard" onSubmit={onSubmit}>
        <div className="card formCard">
          <h3>1. Select NFT</h3>
          <p className="hint">Choose the collection, then select one or more NFTs you already own to list.</p>
          <div className="gridMini">
            <label>
              Standard
              <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                <option value="ERC721">ERC721</option>
                <option value="ERC1155">ERC1155</option>
              </select>
            </label>
            <label>
              Source
              <select value={source} onChange={(e) => setSource(e.target.value as "shared" | "custom")}>
                <option value="shared">Shared contract</option>
                <option value="custom">Custom collection</option>
              </select>
            </label>
            <label>
              Scan depth
              <select value={scanDepth} onChange={(e) => setScanDepth(e.target.value)}>
                <option value="100">Last 100</option>
                <option value="200">Last 200</option>
                <option value="500">Last 500</option>
                <option value="1000">Last 1000</option>
              </select>
            </label>
          </div>
          <p className="hint">
            {isConnected
              ? `Connected wallet: ${address}`
              : "Connect a wallet from the header to load owned NFTs that can be listed."}
          </p>
          {wrongNetwork ? <p className="hint">Use the header wallet button to select {appChain.name} before listing.</p> : null}
          <div className="compactList">
            {contractOptions.length > 0 ? (
              contractOptions.map((option) => {
                const isActive = option.address.toLowerCase() === selectedContract.toLowerCase();
                return (
                  <button
                    key={option.address}
                    type="button"
                    className={`selectionButton${isActive ? " selectionButtonActive" : ""}`}
                    onClick={() => setSelectedContract(option.address)}
                  >
                    <strong>{option.label}</strong>
                    <span className="mono">{option.address}</span>
                  </button>
                );
              })
            ) : (
              <p className="hint">
                {mintInventoryLoading
                  ? "Loading owned NFTs..."
                  : "No indexed owned NFTs match this source and standard yet. Mint first, then return here to list."}
              </p>
            )}
          </div>
          {mintInventoryError ? <p className="error">{mintInventoryError}</p> : null}
          {selectedContract ? (
            <>
              <p className="sectionLead">Selected collection: {selectedContractLabel}</p>
              <div className="compactList">
                {availableTokens.length > 0 ? (
                  availableTokens.map((item) => {
                    const selected = selectedTokenKeys.includes(item.key);
                    const metadataUrl = toGatewayUrl(item.metadataCid, ipfsGateway);
                    const mediaUrl = toGatewayUrl(item.mediaCid, ipfsGateway);
                    return (
                      <div
                        key={item.key}
                        role="button"
                        tabIndex={0}
                        className={`selectionButton${selected ? " selectionButtonActive" : ""}`}
                        onClick={() => toggleSelectedToken(item.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelectedToken(item.key);
                          }
                        }}
                      >
                        <strong>Token #{item.tokenId}</strong>
                        <span>{new Date(item.mintedAt).toLocaleString()}</span>
                        <span>{item.activeListingId ? `Already listed (#${item.activeListingId})` : "Ready to list"}</span>
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
          <p className="hint">Set a fixed price, choose how long the listing should stay live, then publish one or more listings.</p>
          <label>
            Payment token
            <select value={paymentTokenType} onChange={(e) => setPaymentTokenType(e.target.value as "ETH" | "ERC20")}>
              <option value="ETH">ETH</option>
              <option value="ERC20">ERC20</option>
            </select>
          </label>
          {paymentTokenType === "ERC20" ? (
            <label>
              ERC20 token address
              <input value={erc20TokenAddress} onChange={(e) => setErc20TokenAddress(e.target.value)} placeholder="0x..." />
            </label>
          ) : null}
          <label>
            {paymentTokenType === "ETH" ? "Price (ETH)" : "Price (raw ERC20 units)"}
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
          <p className="hint">
            Expiration: {listingExpiryDate ? listingExpiryDate.toLocaleString() : "Enter a valid duration"}
          </p>
          <button type="submit" disabled={!isConnected || wrongNetwork || state.status === "pending" || selectedTokens.length === 0}>
            {state.status === "pending"
              ? "Submitting..."
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
            <div className="row">
              <p className="hint">No active listings are live for this wallet yet.</p>
              <Link href="/mint?view=mint" className="ctaLink secondaryLink">Create and publish first</Link>
            </div>
          ) : null}
          {myListings.length > 0 ? (
            <div className="listTable">
              {myListings.map((item) => (
                <ListingCard
                  key={item.id}
                  item={item}
                  currentAddress={address}
                  wrongNetwork={wrongNetwork}
                  isConnected={isConnected}
                  isBuying={false}
                  isCanceling={cancelingId === item.id}
                  copiedKey={copiedKey}
                  onBuy={(_item) => undefined}
                  onCancel={onCancelListing}
                  onCopy={copyText}
                  variant="mine"
                />
              ))}
            </div>
          ) : null}
          {myListings.length > 0 && explorerBase ? (
            <p className="hint">
              Each listing stays independent, so any single listing can be canceled by ID even if it was created in the same batch.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
