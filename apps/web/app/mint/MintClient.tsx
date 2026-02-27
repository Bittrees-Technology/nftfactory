"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
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
import { getContractsConfig } from "../../lib/contracts";

type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

type Standard = "ERC721" | "ERC1155";
type CollectionMode = "shared" | "custom";

const SUBNAME_FEE_ETH = "0.001";

function toExplorerTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
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

export default function MintClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("shared");
  const [customCollectionAddress, setCustomCollectionAddress] = useState("");
  const [copies, setCopies] = useState("1");
  const [custom1155TokenId, setCustom1155TokenId] = useState("1");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageUri, setImageUri] = useState("");

  const [subdomainLabel, setSubdomainLabel] = useState("");
  const [customCollectionName, setCustomCollectionName] = useState("My NFT Collection");
  const [customCollectionSymbol, setCustomCollectionSymbol] = useState("MYNFT");
  const [royaltyBps, setRoyaltyBps] = useState("500");

  const [uploadTx, setUploadTx] = useState<TxState>({ status: "idle" });
  const [mintTx, setMintTx] = useState<TxState>({ status: "idle" });
  const [subnameTx, setSubnameTx] = useState<TxState>({ status: "idle" });

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const account = address ?? "";

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function switchToSepolia(): Promise<void> {
    try {
      await switchChainAsync({ chainId: config.chainId });
    } catch {
      // Wallet modal already communicates the failure state.
    }
  }

  async function sendTransaction(to: `0x${string}`, data: `0x${string}`, valueHex?: `0x${string}`): Promise<`0x${string}`> {
    if (!walletClient || !walletClient.account) throw new Error("Connect wallet first.");
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      to: to as Address,
      data: data as Hex,
      value: valueHex ? (BigInt(valueHex) as bigint) : undefined
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`): Promise<void> {
    if (!publicClient) {
      throw new Error("Public client unavailable. Reconnect wallet and try again.");
    }
    await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
  }

  async function onUploadMetadata(): Promise<void> {
    if (!imageFile) {
      setUploadTx({ status: "error", message: "Please choose an image file." });
      return;
    }
    if (!name.trim()) {
      setUploadTx({ status: "error", message: "Name is required." });
      return;
    }

    try {
      setUploadTx({ status: "pending", message: "Uploading image + metadata..." });
      const form = new FormData();
      form.append("image", imageFile);
      form.append("name", name.trim());
      form.append("description", description.trim());
      form.append("external_url", externalUrl.trim());

      const response = await fetch("/api/ipfs/metadata", { method: "POST", body: form });
      const payload = (await response.json()) as { imageUri?: string; metadataUri?: string; error?: string };
      if (!response.ok || !payload.metadataUri || !payload.imageUri) {
        throw new Error(payload.error || "Upload failed");
      }
      setImageUri(payload.imageUri);
      setMetadataUri(payload.metadataUri);
      setUploadTx({ status: "success", message: "Uploaded to IPFS. Ready to mint." });
    } catch (err) {
      setUploadTx({ status: "error", message: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  async function onRegisterSubname(): Promise<void> {
    if (!account) {
      setSubnameTx({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setSubnameTx({ status: "error", message: "Switch to Sepolia first." });
      return;
    }
    const label = normalizeSubname(subdomainLabel);
    if (!label) {
      setSubnameTx({ status: "error", message: "Subdomain label is required." });
      return;
    }
    if (!isValidSubnameLabel(label)) {
      setSubnameTx({
        status: "error",
        message: "Subdomain must be 1-63 chars, lowercase letters/numbers/hyphens, and not start or end with '-'."
      });
      return;
    }
    try {
      setSubnameTx({ status: "pending", message: "Submitting subdomain registration..." });
      const txHash = await sendTransaction(
        config.subnameRegistrar,
        encodeRegisterSubname(label) as `0x${string}`,
        toHexWei(SUBNAME_FEE_ETH) as `0x${string}`
      );
      await waitForReceipt(txHash);
      setSubnameTx({ status: "success", hash: txHash, message: "Subdomain submitted." });
    } catch (err) {
      setSubnameTx({ status: "error", message: err instanceof Error ? err.message : "Subdomain registration failed" });
    }
  }

  function buildCreateCollectionCommand(): string {
    const normalized = normalizeSubname(subdomainLabel);
    const bps = Number.parseInt(royaltyBps || "0", 10) || 0;
    const safeSubname = normalized || "creator";
    return [
      "cd ~/nftfactory/packages/contracts",
      `cast send <CREATOR_FACTORY_ADDRESS> 'deployCollection((string,address,string,string,string,address,uint96))'`,
      `"(${standard},${account || "<YOUR_WALLET>"},${customCollectionName},${customCollectionSymbol},${safeSubname},${account || "<ROYALTY_RECEIVER>"},${bps})"`,
      `--rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"`
    ].join(" \\\n  ");
  }

  async function onPublish(e: FormEvent): Promise<void> {
    e.preventDefault();
    setMintTx({ status: "idle" });

    if (!account) {
      setMintTx({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setMintTx({ status: "error", message: "Switch to Sepolia first." });
      return;
    }
    if (!metadataUri.trim()) {
      setMintTx({ status: "error", message: "Metadata URI is required." });
      return;
    }

    const amount = Number.parseInt(copies || "1", 10);
    if (standard === "ERC1155" && (!Number.isInteger(amount) || amount <= 0)) {
      setMintTx({ status: "error", message: "Number of copies must be a positive integer." });
      return;
    }

    try {
      setMintTx({ status: "pending", message: "Submitting mint transaction..." });

      let targetNft: `0x${string}`;
      let mintData: `0x${string}`;

      if (collectionMode === "shared") {
        if (standard === "ERC721") {
          targetNft = config.shared721;
          mintData = encodePublish721("", metadataUri.trim()) as `0x${string}`;
        } else {
          targetNft = config.shared1155;
          mintData = encodePublish1155("", BigInt(amount), metadataUri.trim()) as `0x${string}`;
        }
      } else {
        if (!isAddress(customCollectionAddress)) {
          throw new Error("Enter a valid custom collection contract address.");
        }
        targetNft = customCollectionAddress;
        if (standard === "ERC721") {
          mintData = encodeCreatorPublish721(account as `0x${string}`, metadataUri.trim(), true) as `0x${string}`;
        } else {
          const tokenId = Number.parseInt(custom1155TokenId || "0", 10);
          if (!Number.isInteger(tokenId) || tokenId <= 0) {
            throw new Error("Token ID for custom ERC-1155 must be a positive integer.");
          }
          mintData = encodeCreatorPublish1155(
            account as `0x${string}`,
            BigInt(tokenId),
            BigInt(amount),
            metadataUri.trim(),
            true
          ) as `0x${string}`;
        }
      }

      const txHash = await sendTransaction(targetNft, mintData);
      await waitForReceipt(txHash);
      setMintTx({ status: "success", hash: txHash, message: "Mint submitted successfully." });
    } catch (err) {
      setMintTx({ status: "error", message: err instanceof Error ? err.message : "Publish failed" });
    }
  }

  return (
    <section>
      <h1>Create and Publish</h1>
      <p>Focused mint flow: connect wallet, upload media, choose collection, and mint. Listing is handled separately.</p>

      <form className="wizard" onSubmit={onPublish}>
        <div className="card formCard">
          <h3>1. Connect Wallet</h3>
          <ConnectButton showBalance={false} chainStatus="name" />
          {wrongNetwork && (
            <button type="button" onClick={switchToSepolia}>
              Switch To Sepolia
            </button>
          )}
          <p className="mono">Account: {account || "Not connected"}</p>
          <p className="mono">Network: {chainId ?? "Unknown"} (expected {config.chainId})</p>
          {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && (
            <p className="error">Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `apps/web/.env.local` for QR wallet support.</p>
          )}
        </div>

        <div className="card formCard">
          <h3>2. Token and Collection</h3>
          <label>
            Mint type
            <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
              <option value="ERC721">Single (ERC-721)</option>
              <option value="ERC1155">Multiple (ERC-1155)</option>
            </select>
          </label>
          <label>
            Collection source
            <select value={collectionMode} onChange={(e) => setCollectionMode(e.target.value as CollectionMode)}>
              <option value="shared">Shared public collection</option>
              <option value="custom">My custom collection contract</option>
            </select>
          </label>
          {collectionMode === "shared" && (
            <p className="hint">Using {standard === "ERC721" ? config.shared721 : config.shared1155}</p>
          )}
          {collectionMode === "custom" && (
            <>
              <label>
                Custom collection contract
                <input
                  value={customCollectionAddress}
                  onChange={(e) => setCustomCollectionAddress(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              {standard === "ERC1155" && (
                <label>
                  Token ID (custom ERC-1155)
                  <input
                    value={custom1155TokenId}
                    onChange={(e) => setCustom1155TokenId(e.target.value)}
                    inputMode="numeric"
                    placeholder="1"
                  />
                </label>
              )}
              <details>
                <summary>No custom collection yet? Create one</summary>
                <div className="formCard inset">
                  <p className="hint">Subdomain registration below is only for custom contract naming identity.</p>
                  <label>
                    Collection name
                    <input value={customCollectionName} onChange={(e) => setCustomCollectionName(e.target.value)} />
                  </label>
                  <label>
                    Collection symbol
                    <input value={customCollectionSymbol} onChange={(e) => setCustomCollectionSymbol(e.target.value)} />
                  </label>
                  <label>
                    Royalty bps
                    <input value={royaltyBps} onChange={(e) => setRoyaltyBps(e.target.value)} inputMode="numeric" />
                  </label>
                  <pre className="codeBlock">{buildCreateCollectionCommand()}</pre>
                </div>
              </details>
            </>
          )}
        </div>

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
            <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Upload image
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          </label>
          {previewUrl && (
            <div className="previewWrap">
              <img src={previewUrl} alt="NFT preview" className="previewImage" />
            </div>
          )}
          <button type="button" onClick={onUploadMetadata} disabled={uploadTx.status === "pending"}>
            {uploadTx.status === "pending" ? "Uploading..." : "Upload and Generate Metadata URI"}
          </button>
          <label>
            Metadata URI
            <input value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} placeholder="ipfs://.../metadata.json" />
          </label>
          {imageUri && <p className="mono">Image URI: {imageUri}</p>}
          <TxStatus state={uploadTx} />
        </div>

        <div className="card formCard">
          <h3>4. Mint Settings</h3>
          {standard === "ERC1155" && (
            <label>
              Number of copies
              <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" placeholder="10" />
            </label>
          )}
        </div>

        {collectionMode === "custom" && (
          <div className="card formCard">
            <h3>Optional: Register Subdomain for Custom Contract Naming</h3>
            <p className="hint">Example: `studio.NFTfactory.eth` for custom contract identity.</p>
            <label>
              Subdomain label
              <input value={subdomainLabel} onChange={(e) => setSubdomainLabel(e.target.value)} placeholder="studio" />
            </label>
            <p className="hint">Allowed: `a-z`, `0-9`, `-` (1-63 chars; no leading/trailing `-`).</p>
            <button type="button" onClick={onRegisterSubname} disabled={!isConnected || wrongNetwork}>
              Register Subdomain ({SUBNAME_FEE_ETH} ETH)
            </button>
            <TxStatus state={subnameTx} />
          </div>
        )}

        <div className="card formCard">
          <h3>5. Publish</h3>
          <button type="submit" disabled={!isConnected || wrongNetwork || mintTx.status === "pending"}>
            {mintTx.status === "pending" ? "Publishing..." : "Mint and Publish"}
          </button>
          <TxStatus state={mintTx} />
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
