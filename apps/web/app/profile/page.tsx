"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import { encodeRegisterSubname, toHexWei, truncateHash } from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import { fetchProfileResolution } from "../../lib/indexerApi";

const SUBNAME_FEE_ETH = "0.001";

type SetupState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export default function ProfileLandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [label, setLabel] = useState(() => normalizeLabel(searchParams?.get("label") || ""));
  const [lookupNote, setLookupNote] = useState("");
  const [setupState, setSetupState] = useState<SetupState>({ status: "idle" });

  const normalized = normalizeLabel(label);
  const wrongNetwork = isConnected && chainId !== config.chainId;
  const explorerBase = getExplorerBaseUrl(config.chainId);

  useEffect(() => {
    const nextLabel = normalizeLabel(searchParams?.get("label") || "");
    if (nextLabel && !label) {
      setLabel(nextLabel);
    }
  }, [label, searchParams]);

  useEffect(() => {
    if (!normalized) {
      setLookupNote("");
      return;
    }
    let cancelled = false;
    void fetchProfileResolution(normalized)
      .then((resolution) => {
        if (cancelled) return;
        const walletCount = resolution.sellers.filter((item) => isAddress(item)).length;
        if (walletCount > 0) {
          setLookupNote(
            `${normalized}.nftfactory.eth already resolves to ${walletCount} wallet${walletCount === 1 ? "" : "s"} in the indexer.`
          );
          return;
        }
        setLookupNote(
          `${normalized}.nftfactory.eth is not mapped yet. Register the subname or mint with this ENS label to begin profile setup.`
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLookupNote("Profile lookup is unavailable right now. You can still register the label or launch mint setup.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  function openProfile(e: FormEvent): void {
    e.preventDefault();
    if (!normalized) return;
    router.push(`/profile/${encodeURIComponent(normalized)}`);
  }

  async function switchToExpectedNetwork(): Promise<void> {
    try {
      await switchChainAsync({ chainId: config.chainId });
    } catch {
      // wallet modal handles errors
    }
  }

  async function registerSubname(): Promise<void> {
    if (!normalized) {
      setSetupState({ status: "error", message: "Enter a subname first." });
      return;
    }
    if (!walletClient?.account) {
      setSetupState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setSetupState({ status: "error", message: `Switch to ${appChain.name} first.` });
      return;
    }
    if (!publicClient) {
      setSetupState({ status: "error", message: "Public client unavailable. Reconnect wallet and try again." });
      return;
    }
    try {
      setSetupState({ status: "pending", message: `Registering ${normalized}.nftfactory.eth...` });
      const txHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: config.subnameRegistrar as Address,
        data: encodeRegisterSubname(normalized) as Hex,
        value: BigInt(toHexWei(SUBNAME_FEE_ETH))
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
      setSetupState({
        status: "success",
        hash: txHash,
        message: `${normalized}.nftfactory.eth registered. Continue into mint to publish with this identity.`
      });
    } catch (err) {
      setSetupState({ status: "error", message: err instanceof Error ? err.message : "Registration failed" });
    }
  }

  function launchSharedMint(): void {
    if (!normalized) return;
    router.push(`/mint?view=mint&collection=shared&profile=${encodeURIComponent(normalized)}`);
  }

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Creator Toolkit</p>
        <h1>Creator Profiles</h1>
        <p className="heroText">
          This is the creator onboarding surface: set up an ENS identity under nftfactory.eth, launch an
          ENS-attributed mint flow, and open a storefront once the identity resolves.
        </p>
        <div className="row">
          <Link href="/discover" className="ctaLink secondaryLink">Browse marketplace first</Link>
          <Link href="/mint?view=mint&collection=custom" className="ctaLink secondaryLink">Deploy a creator collection</Link>
        </div>
        <div className="flowStrip">
          <div className="flowCell">
            <span className="flowLabel">1. Claim</span>
            <p className="hint">Pick a subname under nftfactory.eth to become your public creator identity.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">2. Mint</span>
            <p className="hint">Launch directly into shared mint with that ENS label pre-filled for attribution.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">3. Open</span>
            <p className="hint">Once the label resolves, the storefront route becomes your public creator page.</p>
          </div>
        </div>
      </div>

      <div className="card formCard">
        <h3>Current Product Scope</h3>
        <p className="sectionLead">
          The app is organized around one clear progression: publish first, list second, inspect third.
          Each route now focuses on a single job instead of mixing seller, collector, and admin actions.
        </p>
        <div className="gridMini">
          <p className="hint"><strong>Mint</strong> for publishing, deploying, and collection management.</p>
          <p className="hint"><strong>List</strong> for creating and managing fixed-price sales.</p>
          <p className="hint"><strong>Discover</strong> for read-only browsing and report submission.</p>
          <p className="hint"><strong>Profile</strong> for creator identity setup and storefront lookup.</p>
        </div>
      </div>

      <form className="card formCard" onSubmit={openProfile}>
        <h3>Profile Setup</h3>
        <p className="sectionLead">
          Enter the creator label you want to use. You can open an existing storefront, register the subname,
          or jump straight into minting with the ENS identity already wired in.
        </p>
        <div className="gridMini">
          <label>
            ENS subname label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="creator"
            />
          </label>
          <div className="selectionCard">
            <span className="flowLabel">Wallet Status</span>
            <p className="hint">{address || "Connect a wallet from the header to register a subname on-chain."}</p>
            <p className="hint">Expected network: {appChain.name}</p>
            {wrongNetwork ? (
              <button type="button" onClick={() => void switchToExpectedNetwork()}>
                Switch To {appChain.name}
              </button>
            ) : null}
          </div>
        </div>
        <div className="row">
          <button type="submit" disabled={!normalized}>Open Profile</button>
          <button type="button" onClick={launchSharedMint} disabled={!normalized}>
            Start Shared Mint With ENS
          </button>
          <button type="button" onClick={() => void registerSubname()} disabled={!normalized || !isConnected || wrongNetwork || setupState.status === "pending"}>
            {setupState.status === "pending" ? "Registering..." : `Create ${normalized || "subname"} (${SUBNAME_FEE_ETH} ETH)`}
          </button>
        </div>
        <p className="hint">
          {normalized
            ? `Profile route: /profile/${normalized}`
            : "Enter a subname like creator or studio. The .nftfactory.eth suffix is optional."}
        </p>
        {lookupNote ? <p className="hint">{lookupNote}</p> : null}
        {setupState.status === "error" ? <p className="error">{setupState.message}</p> : null}
        {setupState.status === "pending" ? <p className="hint">{setupState.message}</p> : null}
        {setupState.status === "success" ? (
          <p className="success">
            {setupState.message}{" "}
            {setupState.hash ? (
              explorerBase ? (
                <a href={`${explorerBase}/tx/${setupState.hash}`} target="_blank" rel="noreferrer">
                  {truncateHash(setupState.hash)}
                </a>
              ) : (
                <span className="mono">{truncateHash(setupState.hash)}</span>
              )
            ) : null}
          </p>
        ) : null}
      </form>

      <div className="grid">
        <Link href="/profile/creator" className="card actionCard">
          <h3>Open Existing Storefront</h3>
          <p>Jump into a resolved creator route if the ENS mapping already exists.</p>
          <p className="actionHint">Example: /profile/creator</p>
        </Link>
        <Link href="/mint?view=mint&collection=shared" className="card actionCard">
          <h3>Shared ENS Mint</h3>
          <p>Use the fastest publish path and attribute new work to your creator identity.</p>
          <p className="actionHint">Opens shared mint mode.</p>
        </Link>
        <Link href="/mint?view=mint&collection=custom" className="card actionCard">
          <h3>Creator Collection</h3>
          <p>Deploy your own ERC-721 or ERC-1155 contract and connect it to the same identity.</p>
          <p className="actionHint">Opens custom collection mode.</p>
        </Link>
      </div>
    </section>
  );
}
