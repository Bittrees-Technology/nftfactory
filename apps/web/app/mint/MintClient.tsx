"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import {
  encodeCreatorPublish1155,
  encodeCreatorPublish721,
  encodePublish1155,
  encodePublish721,
  encodeRegisterSubname,
  toHexWei,
  truncateHash
} from "../../lib/abi";
import {
  encodeDeployCollection,
  encodeFinalizeUpgrades,
  encodeTransferOwnership,
  extractDeployedCollectionAddress,
  type DeployCollectionArgs
} from "../../lib/creatorCollection";
import { getContractsConfig } from "../../lib/contracts";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import { fetchProfileResolution } from "../../lib/indexerApi";

// ── Types ─────────────────────────────────────────────────────────────────────

type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

type Standard = "ERC721" | "ERC1155";
/** "shared" = shared public contracts; "custom" = a CreatorCollection deployed by the factory */
type MintMode = "shared" | "custom";
/** Which top-level action the user is performing */
type PageMode = "mint" | "manage";

const SUBNAME_FEE_ETH = "0.001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toExplorerTx(chainId: number, hash: string): string | null {
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/tx/${hash}` : null;
}

function toExplorerAddress(chainId: number, address: string): string | null {
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/address/${address}` : null;
}

function normalizeSubname(label: string): string {
  return label.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

function isValidSubnameLabel(label: string): boolean {
  if (!label || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  return /^[a-z0-9-]+$/.test(label);
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function storageKey(ownerAddress: string): string {
  return `nftfactory:known-collections:${ownerAddress.toLowerCase()}`;
}

function shortenAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

type MintClientProps = {
  initialPageMode?: PageMode;
  initialMintMode?: MintMode;
  initialProfileLabel?: string;
};

type KnownCollection = {
  contractAddress: string;
  ensSubname: string | null;
  ownerAddress: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MintClient({
  initialPageMode = "mint",
  initialMintMode = "shared",
  initialProfileLabel = ""
}: MintClientProps) {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  // ── Top-level page mode ───────────────────────────────────────────────────
  const [pageMode, setPageMode] = useState<PageMode>(initialPageMode);

  // ── Mint form state ───────────────────────────────────────────────────────
  const [standard, setStandard] = useState<Standard>("ERC721");
  const [mintMode, setMintMode] = useState<MintMode>(initialMintMode);

  // Custom collection address (either entered manually or filled after factory deploy)
  const [customCollectionAddress, setCustomCollectionAddress] = useState("");
  const [collectionSelector, setCollectionSelector] = useState<"saved" | "manual">("saved");
  const [knownCollections, setKnownCollections] = useState<KnownCollection[]>([]);
  // Whether to show the inline "deploy new collection" sub-form
  const [showDeployForm, setShowDeployForm] = useState(false);

  // Deploy-new-collection form fields
  const [deployName, setDeployName] = useState("");
  const [deploySymbol, setDeploySymbol] = useState("");
  const [deploySubname, setDeploySubname] = useState(initialProfileLabel);
  const [deployRoyaltyReceiver, setDeployRoyaltyReceiver] = useState("");
  const [deployRoyaltyBps, setDeployRoyaltyBps] = useState("500");
  const [deployTx, setDeployTx] = useState<TxState>({ status: "idle" });

  // Token metadata
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageUri, setImageUri] = useState("");

  // Mint-specific settings
  const [copies, setCopies] = useState("1");
  const [custom1155TokenId, setCustom1155TokenId] = useState("1");
  const [lockMetadata, setLockMetadata] = useState(true);

  // ENS attribution subname (for shared mints, attributes mint to a registered subname)
  const [attributionSubname, setAttributionSubname] = useState(initialProfileLabel);
  // Register subname flow (for custom collections)
  const [registerSubnameLabel, setRegisterSubnameLabel] = useState(initialProfileLabel);

  // Transaction state
  const [uploadTx, setUploadTx] = useState<TxState>({ status: "idle" });
  const [mintTx, setMintTx] = useState<TxState>({ status: "idle" });
  const [subnameTx, setSubnameTx] = useState<TxState>({ status: "idle" });

  // ── Collection management state ───────────────────────────────────────────
  const [manageAddress, setManageAddress] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferTx, setTransferTx] = useState<TxState>({ status: "idle" });
  const [finalizeTx, setFinalizeTx] = useState<TxState>({ status: "idle" });
  const [finalizeConfirmed, setFinalizeConfirmed] = useState(false);

  // ── ENS lookup for attribution ────────────────────────────────────────────
  const [subnameResolved, setSubnameResolved] = useState<string | null>(null);
  const [subnameResolving, setSubnameResolving] = useState(false);

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const account = address ?? "";

  function mergeKnownCollections(nextItems: KnownCollection[]): void {
    setKnownCollections((prev) => {
      const merged = new Map<string, KnownCollection>();
      for (const item of [...prev, ...nextItems]) {
        const normalizedOwner = item.ownerAddress.toLowerCase();
        const normalizedContract = item.contractAddress.toLowerCase();
        if (!isAddress(normalizedContract) || !isAddress(normalizedOwner)) continue;
        const key = normalizedContract;
        const existing = merged.get(key);
        merged.set(key, {
          contractAddress: item.contractAddress,
          ensSubname: item.ensSubname || existing?.ensSubname || null,
          ownerAddress: item.ownerAddress
        });
      }
      const values = [...merged.values()];
      if (typeof window !== "undefined" && account) {
        window.localStorage.setItem(storageKey(account), JSON.stringify(values));
      }
      return values;
    });
  }

  // Image preview
  useEffect(() => {
    if (!imageFile) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Resolve attribution subname live
  useEffect(() => {
    const label = normalizeSubname(attributionSubname);
    if (!label || !isValidSubnameLabel(label)) {
      setSubnameResolved(null);
      return;
    }
    let cancelled = false;
    setSubnameResolving(true);
    void fetchProfileResolution(label)
      .then((r) => {
        if (!cancelled) setSubnameResolved(r.sellers[0] ?? null);
      })
      .catch(() => { if (!cancelled) setSubnameResolved(null); })
      .finally(() => { if (!cancelled) setSubnameResolving(false); });
    return () => { cancelled = true; };
  }, [attributionSubname]);

  useEffect(() => {
    if (!account || typeof window === "undefined") {
      setKnownCollections([]);
      return;
    }
    const raw = window.localStorage.getItem(storageKey(account));
    if (!raw) {
      setKnownCollections([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as KnownCollection[];
      const filtered = parsed.filter((item) => isAddress(item.contractAddress) && item.ownerAddress.toLowerCase() === account.toLowerCase());
      setKnownCollections(filtered);
    } catch {
      setKnownCollections([]);
    }
  }, [account]);

  useEffect(() => {
    if (!account || mintMode !== "custom") return;
    const labels = [
      normalizeSubname(deploySubname),
      normalizeSubname(registerSubnameLabel),
      normalizeSubname(attributionSubname)
    ].filter(Boolean);
    const uniqueLabels = [...new Set(labels)];
    if (uniqueLabels.length === 0) return;
    let cancelled = false;
    void Promise.all(uniqueLabels.map((label) => fetchProfileResolution(label).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const owned = results
          .flatMap((result) => result?.collections || [])
          .filter((item) => item.ownerAddress.toLowerCase() === account.toLowerCase())
          .map((item) => ({
            contractAddress: item.contractAddress,
            ensSubname: item.ensSubname,
            ownerAddress: item.ownerAddress
          }));
        if (owned.length > 0) mergeKnownCollections(owned);
      });
    return () => { cancelled = true; };
  }, [account, attributionSubname, deploySubname, mintMode, registerSubnameLabel]);

  useEffect(() => {
    if (mintMode !== "custom") return;
    if (knownCollections.length === 0) {
      setCollectionSelector("manual");
      return;
    }
    if (collectionSelector === "saved" && !customCollectionAddress) {
      setCustomCollectionAddress(knownCollections[0].contractAddress);
    }
  }, [collectionSelector, customCollectionAddress, knownCollections, mintMode]);

  useEffect(() => {
    if (!manageAddress && isAddress(customCollectionAddress)) {
      setManageAddress(customCollectionAddress);
    }
  }, [customCollectionAddress, manageAddress]);

  // ── Utilities ─────────────────────────────────────────────────────────────

  async function switchToExpectedNetwork(): Promise<void> {
    try { await switchChainAsync({ chainId: config.chainId }); } catch { /* wallet handles display */ }
  }

  async function sendTransaction(
    to: `0x${string}`,
    data: `0x${string}`,
    valueHex?: `0x${string}`
  ): Promise<`0x${string}`> {
    if (!walletClient?.account) throw new Error("Connect your wallet first.");
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      to: to as Address,
      data: data as Hex,
      value: valueHex ? BigInt(valueHex) : undefined
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`) {
    if (!publicClient) throw new Error("Public client unavailable — reconnect wallet.");
    return publicClient.waitForTransactionReceipt({ hash: hash as Hex });
  }

  // ── Upload metadata to IPFS ───────────────────────────────────────────────

  async function uploadMetadata(): Promise<string> {
    if (!imageFile) {
      setUploadTx({ status: "error", message: "Choose an image file first." });
      throw new Error("Choose an image file first.");
    }
    if (!name.trim()) { setUploadTx({ status: "error", message: "Token name is required." }); throw new Error("Token name is required."); }
    try {
      setUploadTx({ status: "pending", message: "Uploading image and metadata to IPFS…" });
      const form = new FormData();
      form.append("image", imageFile);
      form.append("name", name.trim());
      form.append("description", description.trim());
      form.append("external_url", externalUrl.trim());
      const res = await fetch("/api/ipfs/metadata", { method: "POST", body: form });
      const payload = await res.json() as { imageUri?: string; metadataUri?: string; error?: string };
      if (!res.ok || !payload.metadataUri || !payload.imageUri) throw new Error(payload.error || "Upload failed");
      setImageUri(payload.imageUri);
      setMetadataUri(payload.metadataUri);
      setUploadTx({ status: "success", message: "Uploaded to IPFS. Continuing to mint…" });
      return payload.metadataUri;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadTx({ status: "error", message });
      throw err instanceof Error ? err : new Error(message);
    }
  }

  // ── Deploy new CreatorCollection via factory ──────────────────────────────

  async function onDeployCollection(): Promise<void> {
    if (!account) { setDeployTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setDeployTx({ status: "error", message: `Switch to ${appChain.name} first.` }); return; }
    if (!deployName.trim()) { setDeployTx({ status: "error", message: "Collection name is required." }); return; }
    if (!deploySymbol.trim()) { setDeployTx({ status: "error", message: "Symbol is required." }); return; }

    const royaltyReceiver = deployRoyaltyReceiver.trim() || account;
    if (!isAddress(royaltyReceiver)) {
      setDeployTx({ status: "error", message: "Royalty receiver must be a valid address." });
      return;
    }
    const bps = Number.parseInt(deployRoyaltyBps, 10);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      setDeployTx({ status: "error", message: "Royalty must be 0–10 000 basis points." });
      return;
    }

    const ensSubname = deploySubname.trim() ? normalizeSubname(deploySubname.trim()) : "";
    if (ensSubname && !isValidSubnameLabel(ensSubname)) {
      setDeployTx({ status: "error", message: "ENS subname must be lowercase letters, numbers, or hyphens." });
      return;
    }

    const args: DeployCollectionArgs = {
      standard,
      creator: account as `0x${string}`,
      tokenName: deployName.trim(),
      tokenSymbol: deploySymbol.trim().toUpperCase(),
      ensSubname,
      defaultRoyaltyReceiver: royaltyReceiver as `0x${string}`,
      defaultRoyaltyBps: BigInt(bps)
    };

    try {
      setDeployTx({ status: "pending", message: "Deploying collection contract via factory…" });
      const calldata = encodeDeployCollection(args);
      const txHash = await sendTransaction(config.factory, calldata);
      const receipt = await waitForReceipt(txHash);

      const deployed = extractDeployedCollectionAddress(receipt, config.factory);
      if (deployed) {
        setCustomCollectionAddress(deployed);
        setManageAddress(deployed);
        setCollectionSelector("saved");
        mergeKnownCollections([{
          contractAddress: deployed,
          ensSubname: ensSubname || null,
          ownerAddress: account
        }]);
        setDeployTx({
          status: "success",
          hash: txHash,
          message: `Collection deployed at ${deployed}. Address auto-filled above.`
        });
        setShowDeployForm(false);
      } else {
        setDeployTx({
          status: "success",
          hash: txHash,
          message: "Deployed! Check the transaction on Etherscan to find your collection address and paste it above."
        });
      }
    } catch (err) {
      setDeployTx({ status: "error", message: err instanceof Error ? err.message : "Deploy failed" });
    }
  }

  // ── Register ENS subname ──────────────────────────────────────────────────

  async function onRegisterSubname(): Promise<void> {
    if (!account) { setSubnameTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setSubnameTx({ status: "error", message: `Switch to ${appChain.name} first.` }); return; }
    const label = normalizeSubname(registerSubnameLabel);
    if (!label) { setSubnameTx({ status: "error", message: "Enter a subname label." }); return; }
    if (!isValidSubnameLabel(label)) {
      setSubnameTx({ status: "error", message: "Label must be lowercase a–z / 0–9 / hyphens, 1–63 chars, not starting or ending with '-'." });
      return;
    }
    try {
      setSubnameTx({ status: "pending", message: "Registering subname…" });
      const txHash = await sendTransaction(
        config.subnameRegistrar,
        encodeRegisterSubname(label) as `0x${string}`,
        toHexWei(SUBNAME_FEE_ETH) as `0x${string}`
      );
      await waitForReceipt(txHash);
      setSubnameTx({ status: "success", hash: txHash, message: `${label}.nftfactory.eth registered.` });
    } catch (err) {
      setSubnameTx({ status: "error", message: err instanceof Error ? err.message : "Registration failed" });
    }
  }

  // ── Mint / publish ────────────────────────────────────────────────────────

  async function onPublish(e: FormEvent): Promise<void> {
    e.preventDefault();
    setMintTx({ status: "idle" });
    if (!account) { setMintTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setMintTx({ status: "error", message: `Switch to ${appChain.name} first.` }); return; }

    const amount = Number.parseInt(copies || "1", 10);
    if (standard === "ERC1155" && (!Number.isInteger(amount) || amount <= 0)) {
      setMintTx({ status: "error", message: "Number of copies must be a positive integer." });
      return;
    }

    const subname = normalizeSubname(attributionSubname);

    try {
      let effectiveMetadataUri = metadataUri.trim();
      if (imageFile) {
        setMintTx({ status: "pending", message: "Uploading metadata, then preparing mint…" });
        effectiveMetadataUri = await uploadMetadata();
      }
      if (!effectiveMetadataUri) {
        setMintTx({ status: "error", message: "Provide a metadata URI or choose an image to auto-upload." });
        return;
      }

      setMintTx({ status: "pending", message: "Submitting mint transaction…" });

      let targetNft: `0x${string}`;
      let mintData: `0x${string}`;

      if (mintMode === "shared") {
        if (standard === "ERC721") {
          targetNft = config.shared721;
          mintData = encodePublish721(subname, effectiveMetadataUri) as `0x${string}`;
        } else {
          targetNft = config.shared1155;
          mintData = encodePublish1155(subname, BigInt(amount), effectiveMetadataUri) as `0x${string}`;
        }
      } else {
        if (!isAddress(customCollectionAddress)) {
          throw new Error("Enter or deploy a valid collection contract address first.");
        }
        targetNft = customCollectionAddress as `0x${string}`;
        if (standard === "ERC721") {
          mintData = encodeCreatorPublish721(account as `0x${string}`, effectiveMetadataUri, lockMetadata) as `0x${string}`;
        } else {
          const tokenId = Number.parseInt(custom1155TokenId || "0", 10);
          if (!Number.isInteger(tokenId) || tokenId <= 0) throw new Error("Token ID must be a positive integer.");
          mintData = encodeCreatorPublish1155(
            account as `0x${string}`,
            BigInt(tokenId),
            BigInt(amount),
            effectiveMetadataUri,
            lockMetadata
          ) as `0x${string}`;
        }
      }

      const txHash = await sendTransaction(targetNft, mintData);
      await waitForReceipt(txHash);
      setMintTx({ status: "success", hash: txHash, message: "Minted successfully." });
    } catch (err) {
      setMintTx({ status: "error", message: err instanceof Error ? err.message : "Publish failed" });
    }
  }

  // ── Collection management actions ─────────────────────────────────────────

  async function onTransferOwnership(): Promise<void> {
    if (!account) { setTransferTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setTransferTx({ status: "error", message: `Switch to ${appChain.name} first.` }); return; }
    if (!isAddress(manageAddress)) { setTransferTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!isAddress(transferTarget)) { setTransferTx({ status: "error", message: "Enter a valid new owner address." }); return; }
    try {
      setTransferTx({ status: "pending", message: "Transferring ownership…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeTransferOwnership(transferTarget as `0x${string}`)
      );
      await waitForReceipt(txHash);
      setTransferTx({ status: "success", hash: txHash, message: `Ownership transferred to ${transferTarget}.` });
    } catch (err) {
      setTransferTx({ status: "error", message: err instanceof Error ? err.message : "Transfer failed" });
    }
  }

  async function onFinalizeUpgrades(): Promise<void> {
    if (!account) { setFinalizeTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setFinalizeTx({ status: "error", message: `Switch to ${appChain.name} first.` }); return; }
    if (!isAddress(manageAddress)) { setFinalizeTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!finalizeConfirmed) { setFinalizeTx({ status: "error", message: "Tick the confirmation box first." }); return; }
    try {
      setFinalizeTx({ status: "pending", message: "Finalizing upgrades — this cannot be undone…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeFinalizeUpgrades()
      );
      await waitForReceipt(txHash);
      setFinalizeTx({ status: "success", hash: txHash, message: "Upgrades finalized. This collection can never be upgraded again." });
    } catch (err) {
      setFinalizeTx({ status: "error", message: err instanceof Error ? err.message : "Finalize failed" });
    }
  }

  const selectedKnownCollection = knownCollections.find(
    (item) => item.contractAddress.toLowerCase() === customCollectionAddress.toLowerCase()
  ) || null;
  const selectedManageCollection = knownCollections.find(
    (item) => item.contractAddress.toLowerCase() === manageAddress.toLowerCase()
  ) || null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Publishing Flow</p>
        <h1>Create and Publish</h1>
        <p className="heroText">
          Use one route for the full publishing flow: pick shared mint or your own creator collection,
          prepare metadata, then mint. Collection ownership and upgrade finality stay in the manage flow.
        </p>
        <div className="flowStrip">
          <div className="flowCell">
            <span className="flowLabel">Connect</span>
            <p className="hint">The wallet button lives in the top-right of the header and controls connect, chain, and account state.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">Prepare</span>
            <p className="hint">Choose shared or creator collection, then provide metadata once.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">Publish</span>
            <p className="hint">One final button uploads to IPFS if needed, then submits the mint transaction.</p>
          </div>
        </div>
      </div>

      <div className="card formCard">
        <h3>{pageMode === "manage" ? "Current Flow: Manage Collection" : "Current Flow: Mint NFT"}</h3>
        {pageMode === "manage" ? (
          <p className="hint">
            Use this mode when you already have a creator collection contract and need to transfer
            ownership or permanently finalize upgrades.
          </p>
        ) : mintMode === "shared" ? (
          <p className="hint">
            Shared mode is the fastest path: no deploy step, no custom contract address required, and
            optional ENS attribution for discoverability.
          </p>
        ) : (
          <p className="hint">
            Custom mode is the full creator flow: deploy or paste your collection, configure metadata
            lock behavior, and optionally register an ENS subname for storefront identity.
          </p>
        )}
        <div className="row">
          <button type="button" className={pageMode === "mint" && mintMode === "shared" ? "presetButton presetActive" : "presetButton"} onClick={() => { setPageMode("mint"); setMintMode("shared"); }}>
            Shared mint
          </button>
          <button type="button" className={pageMode === "mint" && mintMode === "custom" ? "presetButton presetActive" : "presetButton"} onClick={() => { setPageMode("mint"); setMintMode("custom"); }}>
            Custom collection
          </button>
          <button type="button" className={pageMode === "manage" ? "presetButton presetActive" : "presetButton"} onClick={() => setPageMode("manage")}>
            Manage collection
          </button>
          <Link href="/list" className="ctaLink secondaryLink">Go to listings</Link>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MINT FLOW                                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {pageMode === "mint" && (
        <form className="wizard" onSubmit={onPublish}>

          {/* Step 1: Wallet */}
          <div className="card formCard">
            <h3>1. Wallet Status</h3>
            <p className="hint">The header wallet button controls connect, account selection, and network switching.</p>
            {wrongNetwork && (
              <button type="button" onClick={switchToExpectedNetwork}>
                Switch to {appChain.name}
              </button>
            )}
            <p className="mono">Account: {account || "Not connected"}</p>
            <p className="mono">Network: {chainId ?? "Unknown"} (expected {appChain.name} / {config.chainId})</p>
          </div>

          {/* Step 2: Collection selection */}
          <div className="card formCard">
            <h3>2. Choose Your Collection</h3>
            <p className="hint">
              Pick <strong>shared</strong> if you want the quickest path to publishing. Pick <strong>custom</strong>
              if you need your own contract, royalties, upgrade controls, and collection ownership.
            </p>

            <label>
              Token type
              <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                <option value="ERC721">
                  ERC-721 — Unique / one-of-one (each token is distinct)
                </option>
                <option value="ERC1155">
                  ERC-1155 — Multi-edition (multiple copies of the same token)
                </option>
              </select>
            </label>

            <label>
              Collection type
              <select
                value={mintMode}
                onChange={(e) => {
                  setMintMode(e.target.value as MintMode);
                  setShowDeployForm(false);
                }}
              >
                <option value="shared">
                  Shared collection — mint instantly, no setup required
                </option>
                <option value="custom">
                  My collection — your own contract, full control
                </option>
              </select>
            </label>

            {mintMode === "shared" && (
              <div>
                <p className="hint">
                  <strong>Shared collection:</strong> your token goes into a common contract
                  anyone can mint into. Great for quick publishing. The contract address is{" "}
                  {toExplorerAddress(config.chainId, standard === "ERC721" ? config.shared721 : config.shared1155) ? (
                    <a
                      href={toExplorerAddress(config.chainId, standard === "ERC721" ? config.shared721 : config.shared1155)!}
                      target="_blank"
                      rel="noreferrer"
                      className="mono"
                    >
                      {standard === "ERC721"
                        ? `${config.shared721.slice(0, 10)}…`
                        : `${config.shared1155.slice(0, 10)}…`}
                    </a>
                  ) : (
                    <span className="mono">
                      {standard === "ERC721"
                        ? `${config.shared721.slice(0, 10)}…`
                        : `${config.shared1155.slice(0, 10)}…`}
                    </span>
                  )}
                </p>
              </div>
            )}

            {mintMode === "custom" && (
              <>
                <p className="hint">
                  <strong>Your collection:</strong> a contract you exclusively own. Only you can
                  mint into it. Supports royalties, metadata locking, and upgrade finality.
                </p>
                <div className="selectionCard">
                  <label>
                    Collection source
                    <select
                      value={collectionSelector}
                      onChange={(e) => setCollectionSelector(e.target.value as "saved" | "manual")}
                    >
                      {knownCollections.length > 0 ? <option value="saved">Select one of my known collections</option> : null}
                      <option value="manual">Enter collection address manually</option>
                    </select>
                  </label>
                  {collectionSelector === "saved" && knownCollections.length > 0 ? (
                    <label>
                      Creator collection
                      <select
                        value={customCollectionAddress}
                        onChange={(e) => setCustomCollectionAddress(e.target.value)}
                      >
                        {knownCollections.map((item) => (
                          <option key={item.contractAddress} value={item.contractAddress}>
                            {item.ensSubname ? `${item.ensSubname}.nftfactory.eth` : shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Collection contract address
                      <input
                        value={customCollectionAddress}
                        onChange={(e) => setCustomCollectionAddress(e.target.value)}
                        placeholder="0x… (paste your deployed collection address)"
                      />
                    </label>
                  )}
                  {knownCollections.length === 0 ? (
                    <p className="hint">
                      Known collections appear here after you deploy from this wallet or after the app learns them from an ENS-linked profile mapping.
                    </p>
                  ) : null}
                </div>
                {isAddress(customCollectionAddress) && (
                  <p className="hint mono">
                    Using{" "}
                    {selectedKnownCollection?.ensSubname ? `${selectedKnownCollection.ensSubname}.nftfactory.eth ` : ""}
                    {toExplorerAddress(config.chainId, customCollectionAddress) ? (
                      <a href={toExplorerAddress(config.chainId, customCollectionAddress)!} target="_blank" rel="noreferrer">
                        {customCollectionAddress.slice(0, 10)}…{customCollectionAddress.slice(-8)}
                      </a>
                    ) : (
                      <span>{customCollectionAddress.slice(0, 10)}…{customCollectionAddress.slice(-8)}</span>
                    )}
                  </p>
                )}

                {/* ERC-1155 custom: token ID */}
                {standard === "ERC1155" && (
                  <label>
                    Token ID (you choose for custom ERC-1155)
                    <input
                      value={custom1155TokenId}
                      onChange={(e) => setCustom1155TokenId(e.target.value)}
                      inputMode="numeric"
                      placeholder="1"
                    />
                  </label>
                )}

                {/* Metadata lock toggle */}
                <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={lockMetadata}
                    onChange={(e) => setLockMetadata(e.target.checked)}
                  />
                  <span>
                    Lock metadata on mint
                    <span className="hint" style={{ display: "block" }}>
                      When locked, the token URI can never be changed — permanent provenance.
                      Uncheck to keep metadata updatable after minting.
                    </span>
                  </span>
                </label>

                {/* Deploy new collection */}
                <details open={showDeployForm} onToggle={(e) => setShowDeployForm((e.target as HTMLDetailsElement).open)}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, marginTop: "0.5rem" }}>
                    {customCollectionAddress ? "Deploy another collection" : "No collection yet? Deploy one now ▸"}
                  </summary>
                  <div className="formCard inset" style={{ marginTop: "0.75rem" }}>
                    <p className="hint">
                      This calls <strong>CreatorFactory.deployCollection()</strong> which deploys a
                      UUPS-upgradeable ERC-1967 proxy. You will be set as the owner. One transaction,
                      no extra cost beyond gas.
                    </p>
                    <label>
                      Collection name
                      <input value={deployName} onChange={(e) => setDeployName(e.target.value)} placeholder="My Collection" />
                    </label>
                    <label>
                      Symbol (short ticker)
                      <input value={deploySymbol} onChange={(e) => setDeploySymbol(e.target.value)} placeholder="MYCOL" />
                    </label>
                    <label>
                      ENS subname (optional — e.g. <code>studio</code> → studio.nftfactory.eth)
                      <input
                        value={deploySubname}
                        onChange={(e) => setDeploySubname(e.target.value)}
                        placeholder="studio"
                      />
                      <span className="hint">
                        Associates this collection with your ENS identity. Must already be registered (0.001 ETH via step 4).
                      </span>
                    </label>
                    <label>
                      Royalty receiver address
                      <input
                        value={deployRoyaltyReceiver}
                        onChange={(e) => setDeployRoyaltyReceiver(e.target.value)}
                        placeholder={account || "0x… (defaults to your wallet)"}
                      />
                    </label>
                    <label>
                      Royalty % in basis points (500 = 5%)
                      <input
                        value={deployRoyaltyBps}
                        onChange={(e) => setDeployRoyaltyBps(e.target.value)}
                        inputMode="numeric"
                        placeholder="500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={onDeployCollection}
                      disabled={!isConnected || wrongNetwork || deployTx.status === "pending"}
                    >
                      {deployTx.status === "pending" ? "Deploying…" : `Deploy ${standard} Collection`}
                    </button>
                    <TxStatus state={deployTx} />
                  </div>
                </details>
              </>
            )}
          </div>

          {/* Step 3: Asset + metadata */}
          <div className="card formCard">
            <h3>3. Asset and Metadata</h3>
            <label>
              Name (required)
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artwork title" />
            </label>
            <label>
              Description (optional)
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell collectors about this work" />
            </label>
            <label>
              External URL (optional)
              <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label>
              Upload image
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
            </label>
            {previewUrl && (
              <div className="previewWrap">
                <img src={previewUrl} alt={name || "NFT preview"} className="previewImage" />
              </div>
            )}
            <label>
              Metadata URI
              <input
                value={metadataUri}
                onChange={(e) => setMetadataUri(e.target.value)}
                placeholder="ipfs://…/metadata.json"
              />
            </label>
            <p className="hint">
              Choose an image to auto-upload to IPFS during publish, or paste an existing metadata URI manually.
            </p>
            {imageUri && <p className="mono hint">Image: {imageUri}</p>}
            <TxStatus state={uploadTx} />
          </div>

          {/* Step 4: Mint settings */}
          <div className="card formCard">
            <h3>4. Mint Settings</h3>
            {standard === "ERC1155" && (
              <label>
                Number of copies (editions)
                <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" placeholder="10" />
              </label>
            )}

            {mintMode === "shared" ? (
              <>
                <label>
                  ENS subname attribution (optional)
                  <input
                    value={attributionSubname}
                    onChange={(e) => { setAttributionSubname(e.target.value); setSubnameResolved(null); }}
                    placeholder="studio  or  studio.nftfactory.eth"
                  />
                </label>
                {attributionSubname.trim() && (
                  <p className="hint">
                    {subnameResolving
                      ? "Resolving…"
                      : subnameResolved
                        ? `✓ Resolved to ${subnameResolved.slice(0, 10)}…`
                        : "Subname not found in indexer — mint will still succeed but won't be attributed."}
                  </p>
                )}
                <p className="hint">
                  If you have a registered subname, enter it here to attribute this token to your creator profile.
                </p>
              </>
            ) : (
              <p className="hint">
                Custom collections do not store per-mint ENS attribution. Their creator identity comes from the
                collection contract and its registered ENS subname.
              </p>
            )}

            {/* NFT preview card */}
            {(previewUrl || name) ? (
              <div className="nftPreviewCard">
                {previewUrl && <img src={previewUrl} alt={name || "NFT preview"} className="nftPreviewThumb" />}
                <div className="nftPreviewMeta">
                  <p className="nftPreviewName">{name || "Untitled NFT"}</p>
                  {description && <p className="nftPreviewDesc">{description}</p>}
                  {metadataUri && (
                    <p className="mono nftPreviewUri">
                      {metadataUri.length > 48 ? `${metadataUri.slice(0, 48)}…` : metadataUri}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="hint">Fill in asset details above to see a preview.</p>
            )}
          </div>

          {/* Step 5: Register ENS subname (for custom collections) */}
          {mintMode === "custom" && (
            <div className="card formCard">
              <h3>5. Register ENS Subname <span style={{ fontWeight: 400, fontSize: "0.85em" }}>(optional)</span></h3>
              <p className="hint">
                Register a subname under <strong>nftfactory.eth</strong> to give your collection a
                human-readable identity on-chain and in the creator profile pages. Fee: 0.001 ETH / year.
                Once registered, use the same label in the attribution field above and in Deploy settings.
              </p>
              <label>
                Subname label (e.g. <code>studio</code> → studio.nftfactory.eth)
                <input
                  value={registerSubnameLabel}
                  onChange={(e) => setRegisterSubnameLabel(e.target.value)}
                  placeholder="studio"
                />
              </label>
              <p className="hint">Allowed: a–z, 0–9, hyphens. 1–63 chars. No leading or trailing hyphen.</p>
              <button
                type="button"
                onClick={onRegisterSubname}
                disabled={!isConnected || wrongNetwork || subnameTx.status === "pending"}
              >
                Register Subname ({SUBNAME_FEE_ETH} ETH)
              </button>
              <TxStatus state={subnameTx} />
            </div>
          )}

          {/* Step 6: Publish */}
          <div className="card formCard">
            <h3>{mintMode === "custom" ? "6" : "5"}. Mint and Publish</h3>
            <p className="hint">
              This is the final blockchain transaction for the flow above. Make sure your metadata URI
              and collection choice are correct before you submit. If you selected an image above, this
              button will upload metadata to IPFS and then mint in one sequence.
            </p>
            <button
              type="submit"
              disabled={!isConnected || wrongNetwork || mintTx.status === "pending" || uploadTx.status === "pending"}
            >
              {mintTx.status === "pending" || uploadTx.status === "pending" ? "Publishing…" : imageFile ? "Upload and Mint" : "Mint Now"}
            </button>
            <TxStatus state={mintTx} />
          </div>
        </form>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MANAGE COLLECTION                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {pageMode === "manage" && (
        <div className="wizard">

          <div className="card formCard">
            <h3>Wallet Status</h3>
            <p className="hint">The header wallet button controls connect, account selection, and network switching.</p>
            {wrongNetwork && (
              <button type="button" onClick={switchToExpectedNetwork}>Switch to {appChain.name}</button>
            )}
            <p className="mono">Account: {account || "Not connected"}</p>
            <p className="mono">Network: {chainId ?? "Unknown"} (expected {appChain.name} / {config.chainId})</p>
          </div>

          <div className="card formCard">
            <h3>Collection Address</h3>
            <p className="hint">
              These actions apply to <strong>CreatorCollection</strong> contracts (the ones deployed via
              the factory). You must be the current <code>owner</code> of the contract to call them.
            </p>
            {knownCollections.length > 0 ? (
              <label>
                Your collection
                <select
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                >
                  <option value="">Select a known collection</option>
                  {knownCollections.map((item) => (
                    <option key={`manage-${item.contractAddress}`} value={item.contractAddress}>
                      {item.ensSubname ? `${item.ensSubname}.nftfactory.eth` : shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              {knownCollections.length > 0 ? "Or paste a collection contract address" : "Your collection contract address"}
              <input
                value={manageAddress}
                onChange={(e) => setManageAddress(e.target.value)}
                placeholder="0x…"
              />
            </label>
            {isAddress(manageAddress) && (
              <p className="hint mono">
                {selectedManageCollection?.ensSubname ? `${selectedManageCollection.ensSubname}.nftfactory.eth ` : ""}
                {toExplorerAddress(config.chainId, manageAddress) ? (
                  <a href={toExplorerAddress(config.chainId, manageAddress)!} target="_blank" rel="noreferrer">
                    View on explorer ↗
                  </a>
                ) : (
                  <span>Local chain address loaded</span>
                )}
              </p>
            )}
          </div>

          {/* Transfer ownership */}
          <div className="card formCard">
            <h3>Transfer Ownership</h3>
            <p className="hint">
              Passes full control of this collection to a new address. The new owner can mint tokens,
              update metadata (if not locked), set royalties, and finalize upgrades. This action
              <strong> can be reversed</strong> by the new owner calling transfer ownership again.
            </p>
            <label>
              New owner address
              <input
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <button
              type="button"
              onClick={onTransferOwnership}
              disabled={!isConnected || wrongNetwork || !isAddress(manageAddress) || !isAddress(transferTarget) || transferTx.status === "pending"}
            >
              {transferTx.status === "pending" ? "Transferring…" : "Transfer Ownership"}
            </button>
            <TxStatus state={transferTx} />
          </div>

          {/* Finalize upgrades */}
          <div className="card formCard">
            <h3>Finalize Upgrades ⚠️</h3>
            <p className="hint">
              Permanently disables the UUPS upgrade path for this collection contract. Once finalized,
              the logic contract can <strong>never</strong> be replaced — the contract is frozen exactly
              as it is. This is useful for provability and collector trust, but{" "}
              <strong>cannot be undone</strong>.
            </p>
            <p className="hint">
              Who can call this: <strong>the collection owner only</strong>.<br />
              Who it affects: all future mints and interactions with this collection.
            </p>
            <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={finalizeConfirmed}
                onChange={(e) => setFinalizeConfirmed(e.target.checked)}
              />
              <span>I understand this is permanent and cannot be reversed.</span>
            </label>
            <button
              type="button"
              onClick={onFinalizeUpgrades}
              disabled={
                !isConnected ||
                wrongNetwork ||
                !isAddress(manageAddress) ||
                !finalizeConfirmed ||
                finalizeTx.status === "pending"
              }
              style={{ background: finalizeConfirmed ? "#c00" : undefined }}
            >
              {finalizeTx.status === "pending" ? "Finalizing…" : "Permanently Finalize Upgrades"}
            </button>
            <TxStatus state={finalizeTx} />
          </div>
        </div>
      )}
    </section>
  );
}

// ── Shared status display ─────────────────────────────────────────────────────

function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") return <p className="hint">{state.message}</p>;
  if (state.status === "error") return <p className="error">{state.message}</p>;
  if (state.status === "success" && state.hash) {
    return (
      <p className="success">
        {state.message || "Success"}{" "}
        {toExplorerTx(getContractsConfig().chainId, state.hash) ? (
          <a href={toExplorerTx(getContractsConfig().chainId, state.hash)!} target="_blank" rel="noreferrer">
            {truncateHash(state.hash)}
          </a>
        ) : (
          <span className="mono">{truncateHash(state.hash)}</span>
        )}
      </p>
    );
  }
  return <p className="success">{state.message}</p>;
}
