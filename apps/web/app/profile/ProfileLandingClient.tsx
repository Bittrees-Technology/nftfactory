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
  const [selectedProfileSlug, setSelectedProfileSlug] = useState("");
  const [collections, setCollections] = useState<ApiOwnedCollections["collections"]>([]);
  const [verifiedCollections, setVerifiedCollections] = useState<ApiOwnedCollections["collections"]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [tagline, setTagline] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [featuredUrl, setFeaturedUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#c53a1f");
  const [linksText, setLinksText] = useState("");
  const [lookupNote, setLookupNote] = useState("");
  const [setupState, setSetupState] = useState<SetupState>({ status: "idle" });

  const explorerBase = getExplorerBaseUrl(config.chainId);
  const wrongNetwork = isConnected && chainId !== config.chainId;
  const slug = normalizeSlug(identityName);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setCollections([]);
      setSelectedProfileSlug("");
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
          setSelectedProfileSlug((current) => current || nextProfiles[0]?.slug || "");
        } else {
          setProfiles([]);
          setSelectedProfileSlug("");
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
      const nextCollections = verified.map((item) => ({
        ensSubname: item.ensSubname,
        contractAddress: item.contractAddress,
        ownerAddress: item.ownerAddress
      }));
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

  function openSelectedProfile(): void {
    if (!selectedProfileSlug) return;
    router.push(`/profile/${encodeURIComponent(selectedProfileSlug)}`);
  }

  useEffect(() => {
    const selected = profiles.find((item) => item.slug === selectedProfileSlug);
    if (!selected) return;
    setTagline(selected.tagline || "");
    setDisplayName(selected.displayName || "");
    setBio(selected.bio || "");
    setBannerUrl(selected.bannerUrl || "");
    setAvatarUrl(selected.avatarUrl || "");
    setFeaturedUrl(selected.featuredUrl || "");
    setAccentColor(selected.accentColor || "#c53a1f");
    setLinksText((selected.links || []).join("\n"));
    if (!identityName) {
      setIdentityName(selected.fullName);
    }
  }, [identityName, profiles, selectedProfileSlug]);

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
        collectionAddress: selectedCollection || undefined,
        tagline,
        displayName,
        bio,
        bannerUrl,
        avatarUrl,
        featuredUrl,
        accentColor,
        links: linksText.split("\n").map((item) => item.trim()).filter(Boolean)
      });

      const nextProfiles = dedupeProfiles([...profiles, response.profile]);
      setProfiles(nextProfiles);
      setSelectedProfileSlug(response.profile.slug);
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
        collectionAddress: selectedCollection || undefined,
        tagline,
        displayName,
        bio,
        bannerUrl,
        avatarUrl,
        featuredUrl,
        accentColor,
        links: linksText.split("\n").map((item) => item.trim()).filter(Boolean)
      });

      const nextProfiles = dedupeProfiles([...profiles, response.profile]);
      setProfiles(nextProfiles);
      setSelectedProfileSlug(response.profile.slug);
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
      <div className="heroCard">
        <p className="eyebrow">Creator Toolkit</p>
        <h1>Profile Setup</h1>
        <p className="heroText">
          Build a creator identity around ENS: link an existing ENS name, link an ENS subdomain, or create
          a new nftfactory.eth subname. Then publish from the same profile and route the public storefront
          through a single creator page.
        </p>
        <div className="row">
          <Link href="/discover" className="ctaLink secondaryLink">Browse marketplace first</Link>
          <Link href="/mint?view=mint&collection=custom" className="ctaLink secondaryLink">Deploy a creator collection</Link>
        </div>
        <div className="flowStrip">
          <div className="flowCell">
            <span className="flowLabel">1. Claim</span>
            <p className="hint">Link an ENS name, link an ENS subdomain, or create a new nftfactory.eth subname for this identity.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">2. Publish</span>
            <p className="hint">Use the linked identity in the mint flow so the creator profile and storefront stay in sync.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">3. Open</span>
            <p className="hint">Once linked, the profile route becomes the creator page and can evolve into a richer public layout.</p>
          </div>
        </div>
      </div>

      <div className="card formCard">
        <h3>Select Profile</h3>
        {!isConnected ? (
          <p className="hint">Connect a wallet from the header to load creator profiles linked under this address.</p>
        ) : profiles.length > 0 ? (
          <>
            <label>
              Profiles under this wallet
              <select value={selectedProfileSlug} onChange={(e) => setSelectedProfileSlug(e.target.value)}>
                {profiles.map((profile) => (
                  <option key={`${profile.slug}-${profile.source}-${profile.collectionAddress || "none"}`} value={profile.slug}>
                    {profile.fullName}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button type="button" onClick={openSelectedProfile} disabled={!selectedProfileSlug}>Open Profile</button>
            </div>
          </>
        ) : (
          <p className="hint">No creator identities are linked to this wallet yet. Use the setup form below to create the first one.</p>
        )}
      </div>

      <div className="card formCard">
        <h3>Profile Setup</h3>
        <p className="sectionLead">
          Enter the identity you want to use. Use a full ENS name like <span className="mono">artist.eth</span>,
          an external subdomain like <span className="mono">music.artist.eth</span>, or a plain label like{" "}
          <span className="mono">artist</span> for nftfactory.eth.
        </p>
        <div className="gridMini">
          <label>
            Identity name
            <input
              value={identityName}
              onChange={(e) => setIdentityName(e.target.value)}
              placeholder="artist.eth or artist"
            />
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
          {isConnected && verifiedCollections.length === 0 ? (
            <p className="hint">
              No owned collections are confirmed on-chain for this wallet yet. Indexed and cached data may still suggest candidates, but only on-chain-owned collections appear here.
            </p>
          ) : null}
          <div className="selectionCard">
            <span className="flowLabel">Wallet Status</span>
            <p className="hint">{address || "Connect a wallet from the header to link a creator profile."}</p>
            <p className="hint">Target network: {appChain.name}</p>
            {wrongNetwork ? (
              <p className="hint">
                Use the header wallet button to select {appChain.name}. Only nftfactory.eth subname creation requires an on-chain transaction here.
              </p>
            ) : null}
          </div>
        </div>
        <div className="gridMini">
          <label>
            Tagline
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Independent creator. Collector-friendly drops."
            />
          </label>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Artist Name"
            />
          </label>
          <label>
            Accent color
            <input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#c53a1f"
            />
          </label>
          <label>
            Avatar URL
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://... or ipfs://..."
            />
          </label>
          <label>
            Banner URL
            <input
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://... or ipfs://..."
            />
          </label>
          <label>
            Featured media URL
            <input
              value={featuredUrl}
              onChange={(e) => setFeaturedUrl(e.target.value)}
              placeholder="https://... or ipfs://..."
            />
          </label>
          <label>
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Short creator bio"
            />
          </label>
          <label>
            Links (one per line)
            <textarea
              value={linksText}
              onChange={(e) => setLinksText(e.target.value)}
              placeholder={"https://example.com\nhttps://x.com/handle"}
            />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void linkIdentity("ens", { launchMint: true })} disabled={!slug || !isConnected || setupState.status === "pending"}>
            Mint ENS
          </button>
          <button type="button" onClick={() => void linkIdentity("external-subname")} disabled={!slug || !isConnected || setupState.status === "pending"}>
            Create Subname
          </button>
          <button type="button" onClick={() => void createNftFactorySubname()} disabled={!slug || !isConnected || wrongNetwork || setupState.status === "pending"}>
            {setupState.status === "pending" ? "Working..." : "Create nftfactory subname"}
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
