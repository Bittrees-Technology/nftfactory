"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { formatEther } from "viem";
import type { Address, Hex } from "viem";
import {
  encodeBuyListing,
  encodeCancelListing,
  encodeCreateListing,
  encodeSetApprovalForAll,
  toWeiBigInt,
  truncateHash
} from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";

type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

type Standard = "ERC721" | "ERC1155";
type SortBy = "newest" | "oldest" | "priceAsc" | "priceDesc" | "tokenIdAsc" | "tokenIdDesc";
type Preset = "cheap" | "shared" | "mine" | "reset";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_SCAN_LIMIT = 200;

const marketplaceAbi = [
  {
    type: "function",
    name: "nextListingId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "listings",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "standard", type: "string" },
      { name: "paymentToken", type: "address" },
      { name: "price", type: "uint256" },
      { name: "active", type: "bool" }
    ]
  }
] as const;

type ListingRow = {
  id: number;
  seller: Address;
  nft: Address;
  tokenId: bigint;
  amount: bigint;
  standard: string;
  paymentToken: Address;
  price: bigint;
  active: boolean;
};

function toExplorerTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export default function ListClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [source, setSource] = useState<"shared" | "custom">("shared");
  const [customNftAddress, setCustomNftAddress] = useState("");
  const [tokenId, setTokenId] = useState("1");
  const [amount, setAmount] = useState("1");
  const [paymentTokenType, setPaymentTokenType] = useState<"ETH" | "ERC20">("ETH");
  const [erc20TokenAddress, setErc20TokenAddress] = useState("");
  const [priceEth, setPriceEth] = useState("0.01");
  const [state, setState] = useState<TxState>({ status: "idle" });
  const [allListings, setAllListings] = useState<ListingRow[]>([]);
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [scanDepth, setScanDepth] = useState("200");
  const [filterSource, setFilterSource] = useState<"ALL" | "SHARED" | "CUSTOM">("ALL");
  const [filterStandard, setFilterStandard] = useState<"ALL" | "ERC721" | "ERC1155">("ALL");
  const [filterContract, setFilterContract] = useState("");
  const [filterSeller, setFilterSeller] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [activePreset, setActivePreset] = useState<Preset>("reset");

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const nftAddress = source === "shared" ? (standard === "ERC721" ? config.shared721 : config.shared1155) : customNftAddress;
  const parsedScanDepth = Number.parseInt(scanDepth, 10);

  const filteredListings = useMemo(() => {
    let rows = allListings;
    const shared721 = config.shared721.toLowerCase();
    const shared1155 = config.shared1155.toLowerCase();

    if (filterSource !== "ALL") {
      rows = rows.filter((row) => {
        const isShared = row.nft.toLowerCase() === shared721 || row.nft.toLowerCase() === shared1155;
        return filterSource === "SHARED" ? isShared : !isShared;
      });
    }

    if (filterStandard !== "ALL") {
      rows = rows.filter((row) => row.standard === filterStandard);
    }

    const contractFilter = filterContract.trim().toLowerCase();
    if (contractFilter) {
      rows = rows.filter((row) => row.nft.toLowerCase().includes(contractFilter));
    }

    const sellerFilter = filterSeller.trim().toLowerCase();
    if (sellerFilter) {
      rows = rows.filter((row) => row.seller.toLowerCase().includes(sellerFilter));
    }

    let minPrice: bigint | null = null;
    let maxPrice: bigint | null = null;
    try {
      minPrice = filterMinPrice.trim() ? toWeiBigInt(filterMinPrice.trim()) : null;
    } catch {
      minPrice = null;
    }
    try {
      maxPrice = filterMaxPrice.trim() ? toWeiBigInt(filterMaxPrice.trim()) : null;
    } catch {
      maxPrice = null;
    }

    if (minPrice !== null) {
      rows = rows.filter((row) => row.price >= minPrice!);
    }
    if (maxPrice !== null) {
      rows = rows.filter((row) => row.price <= maxPrice!);
    }

    const sorted = [...rows];
    switch (sortBy) {
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
  }, [
    allListings,
    config.shared721,
    config.shared1155,
    filterSource,
    filterStandard,
    filterContract,
    filterSeller,
    filterMinPrice,
    filterMaxPrice,
    sortBy
  ]);

  async function loadListings(): Promise<void> {
    if (!publicClient) return;
    setListingsLoading(true);
    setListingsError("");
    try {
      const nextId = (await publicClient.readContract({
        address: config.marketplace as Address,
        abi: marketplaceAbi,
        functionName: "nextListingId"
      })) as bigint;

      const end = Number(nextId);
      const limit = Number.isInteger(parsedScanDepth) && parsedScanDepth > 0 ? parsedScanDepth : DEFAULT_SCAN_LIMIT;
      const start = Math.max(0, end - limit);
      const rows: ListingRow[] = [];

      for (let i = end - 1; i >= start; i -= 1) {
        const listing = (await publicClient.readContract({
          address: config.marketplace as Address,
          abi: marketplaceAbi,
          functionName: "listings",
          args: [BigInt(i)]
        })) as readonly [Address, Address, bigint, bigint, string, Address, bigint, boolean];

        const row: ListingRow = {
          id: i,
          seller: listing[0],
          nft: listing[1],
          tokenId: listing[2],
          amount: listing[3],
          standard: listing[4],
          paymentToken: listing[5],
          price: listing[6],
          active: listing[7]
        };

        if (row.active) {
          rows.push(row);
        }
      }

      const active = rows.filter((row) => row.active);
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

  async function switchToSepolia(): Promise<void> {
    try {
      await switchChainAsync({ chainId: config.chainId });
    } catch {
      // Wallet modal handles error display.
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

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setState({ status: "idle" });

    if (!isConnected) {
      setState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setState({ status: "error", message: "Switch to Sepolia first." });
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
      priceWei = toWeiBigInt(priceEth);
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
      setState({ status: "error", message: "Switch to Sepolia first." });
      return;
    }

    try {
      setCancelingId(listingId);
      setState({ status: "pending", message: `Canceling listing #${listingId}...` });
      const txHash = await sendTransaction(
        config.marketplace as `0x${string}`,
        encodeCancelListing(BigInt(listingId)) as `0x${string}`
      );
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
      setState({ status: "error", message: "Switch to Sepolia first." });
      return;
    }
    if (row.paymentToken !== ZERO_ADDRESS) {
      setState({ status: "error", message: "ERC20 buy flow not added yet." });
      return;
    }
    try {
      setBuyingId(row.id);
      setState({ status: "pending", message: `Buying listing #${row.id}...` });
      const txHash = await sendTransaction(
        config.marketplace as `0x${string}`,
        encodeBuyListing(BigInt(row.id)) as `0x${string}`,
        row.price
      );
      setState({ status: "success", hash: txHash, message: `Purchase submitted for listing #${row.id}.` });
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Buy failed" });
    } finally {
      setBuyingId(null);
    }
  }

  function applyPreset(preset: Preset): void {
    setActivePreset(preset);
    if (preset === "cheap") {
      setFilterSource("ALL");
      setFilterStandard("ALL");
      setFilterContract("");
      setFilterSeller("");
      setFilterMinPrice("");
      setFilterMaxPrice("0.05");
      setSortBy("priceAsc");
      return;
    }
    if (preset === "shared") {
      setFilterSource("SHARED");
      setFilterStandard("ALL");
      setFilterContract("");
      setFilterSeller("");
      setFilterMinPrice("");
      setFilterMaxPrice("");
      setSortBy("newest");
      return;
    }
    if (preset === "mine") {
      setFilterSource("ALL");
      setFilterStandard("ALL");
      setFilterContract("");
      setFilterSeller(address ?? "");
      setFilterMinPrice("");
      setFilterMaxPrice("");
      setSortBy("newest");
      return;
    }
    setFilterSource("ALL");
    setFilterStandard("ALL");
    setFilterContract("");
    setFilterSeller("");
    setFilterMinPrice("");
    setFilterMaxPrice("");
    setSortBy("newest");
  }

  function presetClass(preset: Preset): string {
    return `presetButton ${activePreset === preset ? "presetActive" : ""}`;
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
    <section>
      <h1>List NFT</h1>
      <p>Dedicated listing flow: connect wallet, choose NFT, approve marketplace, and create listing.</p>

      <form className="wizard" onSubmit={onSubmit}>
        <div className="card formCard">
          <h3>1. Connect Wallet</h3>
          <ConnectButton showBalance={false} chainStatus="name" />
          {wrongNetwork && (
            <button type="button" onClick={switchToSepolia}>
              Switch To Sepolia
            </button>
          )}
          <p className="mono">Network: {chainId ?? "Unknown"} (expected {config.chainId})</p>
          <button type="button" onClick={loadListings} disabled={wrongNetwork || listingsLoading}>
            {listingsLoading ? "Refreshing..." : "Refresh Listings"}
          </button>
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
          <label>
            Amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="1" />
          </label>
        </div>

        <div className="card formCard">
          <h3>3. Price</h3>
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
            Price
            <input value={priceEth} onChange={(e) => setPriceEth(e.target.value)} placeholder="0.01" />
          </label>
        </div>

        <div className="card formCard">
          <h3>4. Submit</h3>
          <button type="submit" disabled={!isConnected || wrongNetwork || state.status === "pending"}>
            {state.status === "pending" ? "Submitting..." : "Approve and Create Listing"}
          </button>
          <TxStatus state={state} />
        </div>

        <div className="card formCard">
          <h3>My Active Listings</h3>
          {!isConnected && <p className="hint">Connect wallet to view your listings.</p>}
          {isConnected && myListings.length === 0 && !listingsLoading && <p className="hint">No active listings found.</p>}
          {myListings.length > 0 && (
            <div className="listTable">
              {myListings.map((item) => (
                <div key={item.id} className="listRow">
                  <p className="mono">#{item.id}</p>
                  <p>{item.standard}</p>
                  <p className="mono">
                    {truncateHash(item.nft)}{" "}
                    <button type="button" className="miniBtn" onClick={() => copyText(`my-nft-${item.id}`, item.nft)}>
                      {copiedKey === `my-nft-${item.id}` ? "Copied" : "Copy"}
                    </button>
                  </p>
                  <p>Token {item.tokenId.toString()}</p>
                  <p>Amt {item.amount.toString()}</p>
                  <p>
                    {formatEther(item.price)} {item.paymentToken === ZERO_ADDRESS ? "ETH" : "ERC20"}
                  </p>
                  <button
                    type="button"
                    onClick={() => onCancelListing(item.id)}
                    disabled={cancelingId === item.id || wrongNetwork || !isConnected}
                  >
                    {cancelingId === item.id ? "Canceling..." : "Cancel"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card formCard">
          <h3>Active Marketplace Listings</h3>
          <div className="row">
            <button type="button" onClick={() => applyPreset("cheap")} className={presetClass("cheap")}>
              Cheap &lt; 0.05 ETH
            </button>
            <button type="button" onClick={() => applyPreset("shared")} className={presetClass("shared")}>
              Shared Collections
            </button>
            <button
              type="button"
              onClick={() => applyPreset("mine")}
              disabled={!address}
              className={presetClass("mine")}
            >
              My Collections
            </button>
            <button type="button" onClick={() => applyPreset("reset")} className={presetClass("reset")}>
              Reset Filters
            </button>
          </div>
          <div className="gridMini">
            <label>
              Source
              <select
                value={filterSource}
                onChange={(e) => {
                  setFilterSource(e.target.value as "ALL" | "SHARED" | "CUSTOM");
                  setActivePreset("reset");
                }}
              >
                <option value="ALL">All</option>
                <option value="SHARED">Shared only</option>
                <option value="CUSTOM">Custom only</option>
              </select>
            </label>
            <label>
              Standard
              <select
                value={filterStandard}
                onChange={(e) => {
                  setFilterStandard(e.target.value as "ALL" | "ERC721" | "ERC1155");
                  setActivePreset("reset");
                }}
              >
                <option value="ALL">All</option>
                <option value="ERC721">ERC721</option>
                <option value="ERC1155">ERC1155</option>
              </select>
            </label>
            <label>
              Contract contains
              <input
                value={filterContract}
                onChange={(e) => {
                  setFilterContract(e.target.value);
                  setActivePreset("reset");
                }}
                placeholder="0xabc..."
              />
            </label>
            <label>
              Seller contains
              <input
                value={filterSeller}
                onChange={(e) => {
                  setFilterSeller(e.target.value);
                  setActivePreset("reset");
                }}
                placeholder="0xseller..."
              />
            </label>
            <label>
              Min price (ETH)
              <input
                value={filterMinPrice}
                onChange={(e) => {
                  setFilterMinPrice(e.target.value);
                  setActivePreset("reset");
                }}
                placeholder="0.01"
              />
            </label>
            <label>
              Max price (ETH)
              <input
                value={filterMaxPrice}
                onChange={(e) => {
                  setFilterMaxPrice(e.target.value);
                  setActivePreset("reset");
                }}
                placeholder="1.5"
              />
            </label>
            <label>
              Sort
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortBy);
                  setActivePreset("reset");
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="priceAsc">Price low to high</option>
                <option value="priceDesc">Price high to low</option>
                <option value="tokenIdAsc">Token ID low to high</option>
                <option value="tokenIdDesc">Token ID high to low</option>
              </select>
            </label>
          </div>
          {filteredListings.length === 0 && !listingsLoading && <p className="hint">No active listings match filters.</p>}
          {filteredListings.length > 0 && (
            <div className="listTable">
              {filteredListings.map((item) => {
                const isMine = !!address && item.seller.toLowerCase() === address.toLowerCase();
                const canBuy = !isMine && item.paymentToken === ZERO_ADDRESS && isConnected && !wrongNetwork;
                return (
                  <div key={`all-${item.id}`} className="listRow">
                    <p className="mono">#{item.id}</p>
                    <p>{item.standard}</p>
                    <p className="mono">
                      {truncateHash(item.nft)}{" "}
                      <button type="button" className="miniBtn" onClick={() => copyText(`all-nft-${item.id}`, item.nft)}>
                        {copiedKey === `all-nft-${item.id}` ? "Copied" : "Copy"}
                      </button>
                    </p>
                    <p>Token {item.tokenId.toString()}</p>
                    <p>Amt {item.amount.toString()}</p>
                    <p>
                      {formatEther(item.price)} {item.paymentToken === ZERO_ADDRESS ? "ETH" : "ERC20"}
                    </p>
                    <p className="mono">
                      {truncateHash(item.seller)}{" "}
                      <button
                        type="button"
                        className="miniBtn"
                        onClick={() => copyText(`seller-${item.id}`, item.seller)}
                      >
                        {copiedKey === `seller-${item.id}` ? "Copied" : "Copy"}
                      </button>
                    </p>
                    <button
                      type="button"
                      onClick={() => onBuyListing(item)}
                      disabled={!canBuy || buyingId === item.id}
                    >
                      {buyingId === item.id ? "Buying..." : isMine ? "Your Listing" : item.paymentToken === ZERO_ADDRESS ? "Buy" : "ERC20 Soon"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") return <p className="hint">{state.message}</p>;
  if (state.status === "error") return <p className="error">{state.message}</p>;
  if (state.status === "success" && state.hash) {
    return (
      <p className="success">
        {state.message || "Success"}{" "}
        <a href={toExplorerTx(state.hash)} target="_blank" rel="noreferrer">
          {truncateHash(state.hash)}
        </a>
      </p>
    );
  }
  return <p className="success">{state.message}</p>;
}
