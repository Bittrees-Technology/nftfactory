"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import {
  encodeBuyListing,
  encodeCancelListing,
  encodeCreateListing,
  encodeErc20Approve,
  encodeSetApprovalForAll,
  toWeiBigInt
} from "../../lib/abi";
import { buildBuyPlan } from "../../lib/marketplaceBuy";
import { getContractsConfig } from "../../lib/contracts";
import { fetchActiveListingsBatch } from "../../lib/marketplace";
import { fetchProfileResolution } from "../../lib/indexerApi";
import { getAppChain } from "../../lib/chains";
import TxStatus, { type TxState } from "./TxStatus";
import ListingFilters, { type FilterState, type Preset } from "./ListingFilters";
import ListingCard, { type ListingRow } from "./ListingCard";

type Standard = "ERC721" | "ERC1155";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_SCAN_LIMIT = 200;

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

const DEFAULT_FILTERS: FilterState = {
  filterSource: "ALL",
  filterStandard: "ALL",
  filterContract: "",
  filterSeller: "",
  filterSubname: "",
  filterMinPrice: "",
  filterMaxPrice: "",
  sortBy: "newest",
  activePreset: "reset"
};

export default function ListClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [source, setSource] = useState<"shared" | "custom">("shared");
  const [customNftAddress, setCustomNftAddress] = useState("");
  const [tokenId, setTokenId] = useState("1");
  const [amount, setAmount] = useState("1");
  const [paymentTokenType, setPaymentTokenType] = useState<"ETH" | "ERC20">("ETH");
  const [erc20TokenAddress, setErc20TokenAddress] = useState("");
  const [priceInput, setPriceInput] = useState("0.01");
  const [state, setState] = useState<TxState>({ status: "idle" });
  const [allListings, setAllListings] = useState<ListingRow[]>([]);
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [scanDepth, setScanDepth] = useState("200");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // ENS subname resolution state: resolved wallet addresses + display hint
  const [ensSubnameAddresses, setEnsSubnameAddresses] = useState<string[]>([]);
  const [ensSubnameHint, setEnsSubnameHint] = useState("");

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const nftAddress = source === "shared" ? (standard === "ERC721" ? config.shared721 : config.shared1155) : customNftAddress;
  const parsedScanDepth = Number.parseInt(scanDepth, 10);

  // Load listings once on mount so the feed isn't empty by default.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadListings(); }, []);

  // Debounced ENS subname resolution: when the user types a subname label (e.g. "studio"),
  // resolve it to one or more wallet addresses via the indexer profile API.
  useEffect(() => {
    const label = filters.filterSubname.trim();
    if (!label) {
      setEnsSubnameAddresses([]);
      setEnsSubnameHint("");
      return;
    }
    setEnsSubnameHint("Resolving…");
    const timer = setTimeout(() => {
      fetchProfileResolution(label)
        .then((result) => {
          const addresses = result.sellers.map((a) => a.toLowerCase());
          if (addresses.length > 0) {
            setEnsSubnameAddresses(addresses);
            setEnsSubnameHint(`→ ${addresses[0]}${addresses.length > 1 ? ` (+${addresses.length - 1} more)` : ""}`);
          } else {
            setEnsSubnameAddresses([]);
            setEnsSubnameHint("subname not found");
          }
        })
        .catch(() => {
          setEnsSubnameAddresses([]);
          setEnsSubnameHint("subname not found");
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [filters.filterSubname]);

  const filteredListings = useMemo(() => {
    let rows = allListings;
    const shared721 = config.shared721.toLowerCase();
    const shared1155 = config.shared1155.toLowerCase();

    if (filters.filterSource !== "ALL") {
      rows = rows.filter((row) => {
        const isShared = row.nft.toLowerCase() === shared721 || row.nft.toLowerCase() === shared1155;
        return filters.filterSource === "SHARED" ? isShared : !isShared;
      });
    }

    if (filters.filterStandard !== "ALL") {
      rows = rows.filter((row) => row.standard === filters.filterStandard);
    }

    const contractFilter = filters.filterContract.trim().toLowerCase();
    if (contractFilter) {
      rows = rows.filter((row) => row.nft.toLowerCase().includes(contractFilter));
    }

    const sellerFilter = filters.filterSeller.trim().toLowerCase();
    if (sellerFilter) {
      rows = rows.filter((row) => row.seller.toLowerCase().includes(sellerFilter));
    }

    // ENS subname filter: show only listings from the resolved wallet address(es).
    // If a subname was typed but no address resolved yet, show nothing (empty while resolving).
    if (filters.filterSubname.trim()) {
      if (ensSubnameAddresses.length > 0) {
        rows = rows.filter((row) => ensSubnameAddresses.includes(row.seller.toLowerCase()));
      } else {
        rows = [];
      }
    }

    let minPrice: bigint | null = null;
    let maxPrice: bigint | null = null;
    try {
      minPrice = filters.filterMinPrice.trim() ? toWeiBigInt(filters.filterMinPrice.trim()) : null;
    } catch {
      minPrice = null;
    }
    try {
      maxPrice = filters.filterMaxPrice.trim() ? toWeiBigInt(filters.filterMaxPrice.trim()) : null;
    } catch {
      maxPrice = null;
    }

    if (minPrice !== null) {
      rows = rows.filter((row) => row.paymentToken === ZERO_ADDRESS && row.price >= minPrice!);
    }
    if (maxPrice !== null) {
      rows = rows.filter((row) => row.paymentToken === ZERO_ADDRESS && row.price <= maxPrice!);
    }

    const sorted = [...rows];
    switch (filters.sortBy) {
      case "oldest":
        sorted.sort((a, b) => a.id - b.id);
        break;
      case "priceAsc":
        sorted.sort((a, b) => (a.price === b.price ? 0 : a.price < b.price ? -1 : 1));
        break;
      case "priceDesc":
        sorted.sort((a, b) => (a.price === b.price ? 0 : a.price > b.price ? -1 : 1));
        break;
      case "tokenIdAsc":
        sorted.sort((a, b) => (a.tokenId === b.tokenId ? 0 : a.tokenId < b.tokenId ? -1 : 1));
        break;
      case "tokenIdDesc":
        sorted.sort((a, b) => (a.tokenId === b.tokenId ? 0 : a.tokenId > b.tokenId ? -1 : 1));
        break;
      case "newest":
      default:
        sorted.sort((a, b) => b.id - a.id);
        break;
    }

    return sorted;
  }, [allListings, config.shared721, config.shared1155, filters, ensSubnameAddresses]);

  function handleFilterChange(updates: Partial<FilterState>): void {
    setFilters((prev) => ({ ...prev, ...updates }));
  }

  function applyPreset(preset: Preset): void {
    if (preset === "cheap") {
      setFilters({ ...DEFAULT_FILTERS, filterMaxPrice: "0.05", sortBy: "priceAsc", activePreset: "cheap" });
      return;
    }
    if (preset === "shared") {
      setFilters({ ...DEFAULT_FILTERS, filterSource: "SHARED", activePreset: "shared" });
      return;
    }
    if (preset === "mine") {
      setFilters({ ...DEFAULT_FILTERS, filterSeller: address ?? "", activePreset: "mine" });
      return;
    }
    setFilters(DEFAULT_FILTERS);
  }

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
      setAllListings(active);
      if (address) {
        const account = address.toLowerCase();
        setMyListings(active.filter((row) => row.seller.toLowerCase() === account));
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
    if (!isAddress(nftAddress)) {
      setState({ status: "error", message: "Enter a valid NFT contract address." });
      return;
    }

    const parsedTokenId = Number.parseInt(tokenId, 10);
    const parsedAmount = Number.parseInt(amount, 10);
    if (!Number.isInteger(parsedTokenId) || parsedTokenId < 0) {
      setState({ status: "error", message: "Token ID must be a non-negative integer." });
      return;
    }
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setState({ status: "error", message: "Amount must be a positive integer." });
      return;
    }
    if (standard === "ERC721" && parsedAmount !== 1) {
      setState({ status: "error", message: "ERC721 listing amount must be 1." });
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
      setState({ status: "pending", message: "Approving marketplace..." });
      const approvalTx = await sendTransaction(
        nftAddress as `0x${string}`,
        encodeSetApprovalForAll(config.marketplace as `0x${string}`, true) as `0x${string}`
      );
      await waitForReceipt(approvalTx);

      setState({ status: "pending", hash: approvalTx, message: "Creating listing..." });
      const listingTx = await sendTransaction(
        config.marketplace as `0x${string}`,
        encodeCreateListing(
          nftAddress as `0x${string}`,
          BigInt(parsedTokenId),
          BigInt(parsedAmount),
          standard,
          paymentToken,
          priceWei
        ) as `0x${string}`
      );
      await waitForReceipt(listingTx);

      setState({ status: "success", hash: listingTx, message: "Listing submitted successfully." });
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

  async function onBuyListing(row: ListingRow): Promise<void> {
    if (!isConnected) {
      setState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    try {
      setBuyingId(row.id);
      const needsErc20Path = row.paymentToken !== ZERO_ADDRESS;
      if (needsErc20Path && (!publicClient || !address)) {
        throw new Error("Public client unavailable. Reconnect wallet and try again.");
      }
      const buyerAddress = address as Address;
      const reader = publicClient;

      const allowance =
        !needsErc20Path
          ? null
          : ((await reader!.readContract({
              address: row.paymentToken,
              abi: erc20Abi,
              functionName: "allowance",
              args: [buyerAddress, config.marketplace as Address]
            })) as bigint);

      const plan = buildBuyPlan({
        paymentToken: row.paymentToken as `0x${string}`,
        zeroAddress: ZERO_ADDRESS as `0x${string}`,
        price: row.price,
        allowance
      });

      for (const amount of plan.approvalAmounts) {
        const approvalMessage =
          amount === 0n
            ? `Resetting ERC20 allowance for listing #${row.id}...`
            : `Approving ERC20 for listing #${row.id}...`;
        setState({ status: "pending", message: approvalMessage });
        const approveTx = await sendTransaction(
          row.paymentToken as `0x${string}`,
          encodeErc20Approve(config.marketplace as `0x${string}`, amount) as `0x${string}`
        );
        await waitForReceipt(approveTx);
        setState({ status: "pending", hash: approveTx, message: `Buying listing #${row.id}...` });
      }

      setState({ status: "pending", message: `Buying listing #${row.id}...` });
      const txHash = await sendTransaction(
        config.marketplace as `0x${string}`,
        encodeBuyListing(BigInt(row.id)) as `0x${string}`,
        plan.txValue
      );
      await waitForReceipt(txHash);
      setState({ status: "success", hash: txHash, message: `Purchase submitted for listing #${row.id}.` });
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Buy failed" });
    } finally {
      setBuyingId(null);
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

  return (
    <section className="wizard">
      <form className="wizard" onSubmit={onSubmit}>
        <div className="card formCard">
          <h3>1. Wallet Status</h3>
          <p className="hint">Use the header wallet button to connect, change accounts, or choose the correct network.</p>
          {!isConnected ? (
            <p className="hint">
              Listing creation and cancel actions stay locked until a seller wallet is connected.
            </p>
          ) : null}
          {isConnected && wrongNetwork ? (
            <p className="hint">
              Your wallet is connected to chain {chainId}. Use the header wallet button to select {appChain.name}.
              Selling actions stay disabled until the selected network matches the configured chain.
            </p>
          ) : null}
          <p className="mono">Account: {address || "Not connected"}</p>
          <p className="mono">Target network: {appChain.name}</p>
          <button type="button" onClick={loadListings} disabled={wrongNetwork || listingsLoading}>
            {listingsLoading ? "Refreshing..." : "Refresh Listings"}
          </button>
          <p className="hint">
            Refresh reloads the latest visible marketplace state from the configured chain. Increase scan
            depth if older listings are missing from the marketplace section below.
          </p>
          <label>
            Scan depth
            <select value={scanDepth} onChange={(e) => setScanDepth(e.target.value)}>
              <option value="100">Last 100</option>
              <option value="200">Last 200</option>
              <option value="500">Last 500</option>
              <option value="1000">Last 1000</option>
            </select>
          </label>
          {listingsError && <p className="error">{listingsError}</p>}
        </div>

        <div className="card formCard">
          <h3>2. NFT Details</h3>
          <p className="hint">
            This route is for assets you already hold. If the NFT does not exist yet, use Mint first and then return here.
          </p>
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
              <option value="shared">Shared collection</option>
              <option value="custom">Custom collection</option>
            </select>
          </label>
          {source === "shared" ? (
            <p className="mono">Contract: {nftAddress}</p>
          ) : (
            <label>
              NFT contract address
              <input value={customNftAddress} onChange={(e) => setCustomNftAddress(e.target.value)} placeholder="0x..." />
            </label>
          )}
          <label>
            Token ID
            <input value={tokenId} onChange={(e) => setTokenId(e.target.value)} inputMode="numeric" placeholder="1" />
          </label>
          {standard === "ERC1155" && (
            <label>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="1" />
            </label>
          )}
        </div>

        <div className="card formCard">
          <h3>3. Price</h3>
          <p className="hint">
            Choose the sale currency and set the fixed price buyers will see on the live marketplace.
          </p>
          <label>
            Payment token
            <select value={paymentTokenType} onChange={(e) => setPaymentTokenType(e.target.value as "ETH" | "ERC20")}>
              <option value="ETH">ETH</option>
              <option value="ERC20">ERC20</option>
            </select>
          </label>
          {paymentTokenType === "ERC20" && (
            <label>
              ERC20 token address
              <input value={erc20TokenAddress} onChange={(e) => setErc20TokenAddress(e.target.value)} placeholder="0x..." />
            </label>
          )}
          <label>
            {paymentTokenType === "ETH" ? "Price (ETH)" : "Price (raw ERC20 units)"}
            <input
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder={paymentTokenType === "ETH" ? "0.01" : "1000000"}
            />
          </label>
        </div>

        <div className="card formCard">
          <h3>4. Submit</h3>
          <p className="hint">
            This submits the approval and listing transactions that make the NFT available for sale on {appChain.name}.
          </p>
          <button type="submit" disabled={!isConnected || wrongNetwork || state.status === "pending"}>
            {state.status === "pending" ? "Submitting..." : "Approve and Create Listing"}
          </button>
          <TxStatus state={state} />
        </div>

        <div className="card formCard">
          <h3>My Active Listings</h3>
          <p className="hint">This is your live seller inventory for the connected wallet.</p>
          {!isConnected && <p className="hint">Connect wallet to view your listings.</p>}
          {isConnected && myListings.length === 0 && !listingsLoading && (
            <p className="hint">No active listings are live for this wallet yet.</p>
          )}
          {isConnected && myListings.length === 0 && !listingsLoading ? (
            <div className="row">
              <Link href="/mint?view=mint" className="ctaLink secondaryLink">Create and publish first</Link>
              <button type="button" onClick={loadListings} disabled={listingsLoading}>
                Refresh Seller State
              </button>
            </div>
          ) : null}
          {myListings.length > 0 && (
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
                  onBuy={onBuyListing}
                  onCancel={onCancelListing}
                  onCopy={copyText}
                  variant="mine"
                />
              ))}
            </div>
          )}
        </div>

        <div className="card formCard">
          <h3>Marketplace Feed</h3>
          <p className="hint">
            This is the live sale feed. Use filters to inspect active listings, compare pricing, or jump into a purchase.
          </p>
          <ListingFilters
            filters={filters}
            address={address}
            onFilterChange={handleFilterChange}
            onPreset={applyPreset}
            subnameHint={ensSubnameHint}
          />
          {filteredListings.length === 0 && !listingsLoading ? (
            <div>
              <p className="hint">No active listings are visible with the current filters.</p>
              <div className="row">
                <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Reset Filters
                </button>
                <Link href="/discover" className="ctaLink secondaryLink">Open mint feed</Link>
              </div>
            </div>
          ) : null}
          {filteredListings.length > 0 && (
            <div className="listTable">
              {filteredListings.map((item) => (
                <ListingCard
                  key={`all-${item.id}`}
                  item={item}
                  currentAddress={address}
                  wrongNetwork={wrongNetwork}
                  isConnected={isConnected}
                  isBuying={buyingId === item.id}
                  isCanceling={false}
                  copiedKey={copiedKey}
                  onBuy={onBuyListing}
                  onCancel={onCancelListing}
                  onCopy={copyText}
                  variant="marketplace"
                />
              ))}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
