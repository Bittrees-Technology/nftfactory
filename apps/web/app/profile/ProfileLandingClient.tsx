"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import { encodeRegisterSubname, toHexWei, truncateHash } from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import {
  fetchCollectionsByOwner,
  fetchProfileResolution,
  fetchProfilesByOwner,
  linkProfileIdentity,
  type ApiOwnedCollections,
  type ApiProfileRecord
} from "../../lib/indexerApi";
import { verifyOwnedCollectionsOnChain } from "../../lib/onchainCollections";

const SUBNAME_FEE_ETH = "0.001";

type SetupState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

function normalizeSlug(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const first = raw.split(".")[0] || "";
  return normalizeLabel(first);
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function dedupeProfiles(items: ApiProfileRecord[]): ApiProfileRecord[] {
  const map = new Map<string, ApiProfileRecord>();
  for (const item of items) {
    const key = `${item.slug}:${item.ownerAddress}:${item.source}:${item.collectionAddress || ""}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export default function ProfileLandingClient({ initialLabel = "" }: { initialLabel?: string }) {
  const router = useRouter();
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [identityName, setIdentityName] = useState(initialLabel);
  const [profiles, setProfiles] = useState<ApiProfileRecord[]>([]);
  const [collections, setCollections] = useState<ApiOwnedCollections["collections"]>([]);
  const [verifiedCollections, setVerifiedCollections] = useState<ApiOwnedCollections["collections"]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [identityMode, setIdentityMode] = useState<"ens" | "external-subname" | "nftfactory-subname">("ens");
  const [lookupNote, setLookupNote] = useState("");
  const [setupState, setSetupState] = useState<SetupState>({ status: "idle" });

  const explorerBase = getExplorerBaseUrl(config.chainId);
  const wrongNetwork = isConnected && chainId !== config.chainId;
  const slug = normalizeSlug(identityName);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setCollections([]);
      setSelectedCollection("");
      return;
    }

    let cancelled = false;
    void Promise.allSettled([fetchProfilesByOwner(address), fetchCollectionsByOwner(address)])
      .then((results) => {
        if (cancelled) return;

        const profileResult = results[0];
        if (profileResult.status === "fulfilled") {
          const nextProfiles = dedupeProfiles(profileResult.value.profiles || []);
          setProfiles(nextProfiles);
        } else {
          setProfiles([]);
        }

        const collectionResult = results[1];
        if (collectionResult.status === "fulfilled") {
          const nextCollections = collectionResult.value.collections || [];
          setCollections(nextCollections);
          setSelectedCollection((current) => current || nextCollections[0]?.contractAddress || "");
        } else {
          setCollections([]);
          setSelectedCollection("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([]);
          setCollections([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!address) {
      setVerifiedCollections([]);
      return;
    }
    if (collections.length === 0 || !publicClient) {
      setVerifiedCollections([]);
      return;
    }

    let cancelled = false;
    void verifyOwnedCollectionsOnChain(publicClient, address, collections).then((verified) => {
      if (cancelled) return;
      const verifiedAddresses = new Set(verified.map((item) => item.contractAddress.toLowerCase()));
      const nextCollections = collections.filter((item) =>
        verifiedAddresses.has(item.contractAddress.toLowerCase())
      );
      setVerifiedCollections(nextCollections);
      setSelectedCollection((current) => {
        if (current && nextCollections.some((item) => item.contractAddress.toLowerCase() === current.toLowerCase())) {
          return current;
        }
        return nextCollections[0]?.contractAddress || "";
      });
    });

    return () => {
      cancelled = true;
    };
  }, [address, collections, publicClient]);

  useEffect(() => {
    if (!slug) {
      setLookupNote("");
      return;
    }
    let cancelled = false;
    void fetchProfileResolution(slug)
      .then((resolution) => {
        if (cancelled) return;
        const walletCount = resolution.sellers.filter((item) => isAddress(item)).length;
        if (walletCount > 0) {
          setLookupNote(
            `${slug} already resolves to ${walletCount} wallet${walletCount === 1 ? "" : "s"} in the current profile graph.`
          );
          return;
        }
        setLookupNote(
          `${slug} is not linked yet. Choose an identity action below to attach this name to your creator profile.`
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLookupNote("Profile lookup is unavailable right now. You can still link the identity and continue.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const identityLabel = useMemo(() => {
    if (identityMode === "ens") return "ENS name";
    if (identityMode === "external-subname") return "ENS subname";
    return "nftfactory label";
  }, [identityMode]);

  const identityHint = useMemo(() => {
    if (identityMode === "ens") return "Use a full ENS name like artist.eth. This routes into mint with that identity.";
    if (identityMode === "external-subname") return "Use a full subname like music.artist.eth to link an existing ENS subname.";
    return "Use a plain label like artist to create artist.nftfactory.eth on-chain.";
  }, [identityMode]);

  async function runIdentityAction(): Promise<void> {
    if (identityMode === "ens") {
      await linkIdentity("ens", { launchMint: true });
      return;
    }
    if (identityMode === "external-subname") {
      await linkIdentity("external-subname");
      return;
    }
    await createNftFactorySubname();
  }

  async function linkIdentity(source: ApiProfileRecord["source"], options?: { launchMint?: boolean }): Promise<void> {
    if (!slug) {
      setSetupState({ status: "error", message: "Enter an ENS name, subdomain, or nftfactory label first." });
      return;
    }
    if (!address) {
      setSetupState({ status: "error", message: "Connect wallet first." });
      return;
    }

    try {
      setSetupState({ status: "pending", message: "Saving creator identity..." });
      const response = await linkProfileIdentity({
        name: identityName,
        source,
        ownerAddress: address,
        collectionAddress: selectedCollection || undefined
      });

      const nextProfiles = dedupeProfiles([...profiles, response.profile]);
      setProfiles(nextProfiles);
      setSetupState({
        status: "success",
        message:
          source === "ens"
            ? `${response.profile.fullName} linked. Continue into shared mint to publish with this ENS identity.`
            : `${response.profile.fullName} linked to this creator profile.`
      });

      if (options?.launchMint) {
        router.push(`/mint?view=mint&collection=shared&profile=${encodeURIComponent(response.profile.fullName)}`);
        return;
      }

      router.push(`/profile/${encodeURIComponent(response.profile.slug)}`);
    } catch (err) {
      setSetupState({ status: "error", message: err instanceof Error ? err.message : "Failed to save creator identity" });
    }
  }

  async function createNftFactorySubname(): Promise<void> {
    if (!slug) {
      setSetupState({ status: "error", message: "Enter a label first." });
      return;
    }
    if (!walletClient?.account) {
      setSetupState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setSetupState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    if (!publicClient) {
      setSetupState({ status: "error", message: "Public client unavailable. Reconnect wallet and try again." });
      return;
    }

    try {
      setSetupState({ status: "pending", message: `Creating ${slug}.nftfactory.eth...` });
      const txHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: config.subnameRegistrar as Address,
        data: encodeRegisterSubname(slug) as Hex,
        value: BigInt(toHexWei(SUBNAME_FEE_ETH))
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });

      const response = await linkProfileIdentity({
        name: slug,
        source: "nftfactory-subname",
        ownerAddress: walletClient.account.address,
        collectionAddress: selectedCollection || undefined
      });

      const nextProfiles = dedupeProfiles([...profiles, response.profile]);
      setProfiles(nextProfiles);
      setSetupState({
        status: "success",
        hash: txHash,
        message: `${response.profile.fullName} created and linked.`
      });
      router.push(`/profile/${encodeURIComponent(response.profile.slug)}`);
    } catch (err) {
      setSetupState({ status: "error", message: err instanceof Error ? err.message : "Failed to create nftfactory subname" });
    }
  }

  return (
    <section className="wizard">
      <div className="card formCard">
        <h3>Wallet</h3>
        <p className="hint">{address || "Connect a wallet from the header to link a creator profile."}</p>
        <p className="hint">Network: {appChain.name}</p>
        {wrongNetwork ? (
          <p className="hint">Use the header wallet button to select {appChain.name} before creating an nftfactory subname.</p>
        ) : null}
      </div>

      <div className="card formCard">
        <h3>Creator Identity</h3>
        <p className="sectionLead">
          Enter the identity you want to use. Use a full ENS name like <span className="mono">artist.eth</span>,
          an external subdomain like <span className="mono">music.artist.eth</span>, or a plain label like{" "}
          <span className="mono">artist</span> for nftfactory.eth.
        </p>
        {isConnected && profiles.length > 0 ? (
          <p className="hint">
            This wallet already has a linked profile. Identity actions here update the canonical name. Use{" "}
            <Link href={`/profile/${encodeURIComponent(profiles[0].slug)}`}>the profile page</Link> to edit display details.
          </p>
        ) : null}
        <div className="gridMini">
          <label>
            {identityLabel}
            <input value={identityName} onChange={(e) => setIdentityName(e.target.value)} />
          </label>
          <label>
            Identity action
            <select
              value={identityMode}
              onChange={(e) =>
                setIdentityMode(e.target.value as "ens" | "external-subname" | "nftfactory-subname")
              }
            >
              <option value="ens">Mint with ENS</option>
              <option value="external-subname">Link ENS subname</option>
              <option value="nftfactory-subname">Create nftfactory subname</option>
            </select>
          </label>
          <label>
            Linked collection (optional)
            <select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}>
              <option value="">No collection linked</option>
              {verifiedCollections.map((collection) => (
                <option key={collection.contractAddress} value={collection.contractAddress}>
                  {collection.ensSubname?.trim() || collection.contractAddress}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">{identityHint}</p>
        <div className="row">
          <button
            type="button"
            onClick={() => void runIdentityAction()}
            disabled={
              !slug ||
              !isConnected ||
              setupState.status === "pending" ||
              (identityMode === "nftfactory-subname" && wrongNetwork)
            }
          >
            {setupState.status === "pending"
              ? "Working..."
              : identityMode === "ens"
                ? "Mint with ENS"
                : identityMode === "external-subname"
                  ? "Link ENS subname"
                  : "Create nftfactory subname"}
          </button>
        </div>
        <p className="hint">
          {slug
            ? `Profile route: /profile/${slug}`
            : "The first label becomes the creator route slug. Example: artist.eth and music.artist.eth both route through /profile/artist."}
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
      </div>
    </section>
  );
}
