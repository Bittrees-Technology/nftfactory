"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import {
  syncWalletScope,
  type ApiOwnedCollections,
  type ApiProfileRecord
} from "../../lib/indexerApi";
import { getContractsConfig } from "../../lib/contracts";
import { discoverOnchainWalletIdentity, type OnchainWalletIdentity } from "../../lib/onchainIdentity";
import { fetchProfilesByOwnerAcrossChains } from "../../lib/ownerIdentityMultiChain";

function deriveProfileRouteFromName(fullName: string): string {
  const normalized = String(fullName || "")
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  if (!normalized) return "";
  if (normalized.endsWith(".nftfactory.eth")) {
    return normalized.replace(/\.nftfactory\.eth$/, "");
  }
  return normalized.split(".").filter(Boolean).reverse().join(".");
}

function normalizeDerivedProfile(collection: ApiOwnedCollections["collections"][number]): ApiProfileRecord | null {
  const rawName = String(collection.ensSubname || "").trim().toLowerCase();
  if (!rawName) return null;
  const fullName = rawName.includes(".") ? rawName : `${rawName}.nftfactory.eth`;
  const slug = deriveProfileRouteFromName(fullName);
  if (!slug) return null;

  return {
    slug,
    fullName,
    source: fullName.endsWith(".nftfactory.eth") ? "nftfactory-subname" : "external-subname",
    ownerAddress: collection.ownerAddress.toLowerCase(),
    collectionAddress: collection.contractAddress.toLowerCase(),
    tagline: null,
    displayName: null,
    bio: null,
    layoutMode: "default",
    aboutMe: null,
    interests: null,
    whoIdLikeToMeet: null,
    statusHeadline: null,
    sidebarFacts: [],
    mediaEmbeds: [],
    retroBlocks: [],
    moduleOrder: ["social", "media", "retro", "boxes", "guestbook", "custom"],
    heroModules: [],
    heroCompactModules: [],
    sidebarModules: [],
    sidebarCompactModules: [],
    mainColumnSplitModules: [],
    mainColumnCompactModules: [],
    topFriends: [],
    stamps: [],
    testimonials: [],
    profileSongUrl: null,
    customBoxes: [],
    bannerUrl: null,
    avatarUrl: null,
    featuredUrl: null,
    accentColor: null,
    customCss: null,
    customHtml: null,
    links: [],
    publishedProfileUri: null,
    publishedProfileGatewayUrl: null,
    publishedProfilePublishedAt: null,
    createdAt: "",
    updatedAt: ""
  };
}

function dedupeProfiles(items: ApiProfileRecord[]): ApiProfileRecord[] {
  const map = new Map<string, ApiProfileRecord>();
  for (const item of items) {
    const key = `${item.slug}:${item.ownerAddress}:${item.source}:${item.collectionAddress || ""}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function createPrimaryProfileKey(address: string): string {
  return `nftfactory:primary-profile:${address.toLowerCase()}`;
}

function deriveEnsNamesFromCollections(collections: ApiOwnedCollections["collections"]): string[] {
  return [...new Set(
    collections
      .map((collection) => String(collection.ensSubname || "").trim().toLowerCase())
      .filter((value) => value.endsWith(".eth"))
  )].sort((left, right) => left.localeCompare(right));
}

export default function ProfileSelectorClient() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const config = useMemo(() => getContractsConfig(), []);
  const [profiles, setProfiles] = useState<ApiProfileRecord[]>([]);
  const [onchainIdentity, setOnchainIdentity] = useState<OnchainWalletIdentity>({ ensNames: [], collections: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setOnchainIdentity({ ensNames: [], collections: [] });
      setNote("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setNote("");
    void (async () => {
      let onchainIdentity = await discoverOnchainWalletIdentity({
        publicClient,
        chainId: config.chainId,
        ownerAddress: address,
        registryAddress: config.registry
      }).catch(() => ({ ensNames: [], collections: [] }));
      let results = await Promise.allSettled([fetchProfilesByOwnerAcrossChains(address, [config.chainId])]);
      const profileResult = results[0];
      const shouldRetryAfterSync =
        (profileResult.status === "rejected" || (profileResult.status === "fulfilled" && profileResult.value.profiles.length === 0)) &&
        onchainIdentity.collections.length === 0 &&
        onchainIdentity.ensNames.length === 0;

      if (shouldRetryAfterSync) {
        await syncWalletScope(address, {
          chainId: config.chainId,
          force: false,
          timeoutMs: 15_000
        }).catch(() => null);
        onchainIdentity = await discoverOnchainWalletIdentity({
          publicClient,
          chainId: config.chainId,
          ownerAddress: address,
          registryAddress: config.registry
        }).catch(() => ({ ensNames: [], collections: [] }));
        results = await Promise.allSettled([fetchProfilesByOwnerAcrossChains(address, [config.chainId])]);
      }
      return { results, onchainIdentity };
    })()
      .then(({ results, onchainIdentity }) => {
        if (cancelled) return;

        const profileResult = results[0];

        const linkedProfiles =
          profileResult.status === "fulfilled" ? profileResult.value.profiles || [] : [];
        const indexedCollections = onchainIdentity.collections || [];
        const discoveredEnsNames = onchainIdentity.ensNames.length > 0
          ? onchainIdentity.ensNames
          : deriveEnsNamesFromCollections(indexedCollections);
        setOnchainIdentity({
          ensNames: discoveredEnsNames,
          collections: indexedCollections
        });
        const mergedCollections = dedupeCollections(indexedCollections);
        const derivedProfiles = mergedCollections.map(normalizeDerivedProfile).filter((item): item is ApiProfileRecord => !!item);

        let cachedProfiles: ApiProfileRecord[] = [];
        try {
          const raw = globalThis.localStorage.getItem(createPrimaryProfileKey(address));
          if (raw) {
            const parsed = JSON.parse(raw) as ApiProfileRecord;
            if (parsed?.slug && parsed?.fullName) {
              cachedProfiles = [parsed];
            }
          }
        } catch {
          cachedProfiles = [];
        }

        const nextProfiles = dedupeProfiles([...linkedProfiles, ...derivedProfiles, ...cachedProfiles]);
        setProfiles(nextProfiles);

        if (nextProfiles.length === 0) {
          if (profileResult.status === "rejected" && indexedCollections.length === 0 && discoveredEnsNames.length === 0) {
            const reason =
              profileResult.reason instanceof Error ? profileResult.reason.message : "Indexer request failed";
            setNote(`Profile lookup is unavailable right now (${reason}). Open setup to continue with manual creator onboarding.`);
            return;
          }
          if (discoveredEnsNames.length > 0) {
            setNote(
              `No linked profile is indexed for this wallet yet. Onchain discovery found ${discoveredEnsNames.join(", ")}. Open setup to link it.`
            );
            return;
          }
          setNote("No creator profile is linked to this wallet yet. Open setup to link an ENS identity or create an nftfactory.eth subname.");
          return;
        }

        if (
          profileResult.status === "rejected" &&
          (indexedCollections.length > 0 || discoveredEnsNames.length > 0)
        ) {
          const reason =
            profileResult.reason instanceof Error ? profileResult.reason.message : "Direct profile lookup failed";
          setNote(`Loaded the profile from collection ownership data because direct profile lookup failed (${reason}).`);
          return;
        }

        if (
          linkedProfiles.length === 0 &&
          derivedProfiles.length === 0 &&
          cachedProfiles.length > 0
        ) {
          setNote("Showing the most recently linked profile while the indexer catches up.");
          return;
        }

        if (nextProfiles.length > 1) {
          setNote("Multiple creator profiles are linked to this wallet. Redirecting to the primary profile.");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProfiles([]);
          setOnchainIdentity({ ensNames: [], collections: [] });
          const reason = err instanceof Error ? err.message : "Indexer request failed";
          setNote(`Profile lookup is unavailable right now (${reason}). Open setup to continue with manual creator onboarding.`);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, config.chainId, config.registry, isConnected, publicClient]);

  useEffect(() => {
    if (!isConnected || isLoading || profiles.length === 0) return;
    router.replace(`/profile/${encodeURIComponent(profiles[0].slug)}`);
  }, [isConnected, isLoading, profiles, router]);

  const linkedProfiles = useMemo(() => profiles.slice(0, 12), [profiles]);
  const discoveredIdentityLinks = useMemo(
    () =>
      onchainIdentity.ensNames.map((fullName) => {
        const label = fullName.endsWith(".eth") ? fullName.replace(/\.eth$/, "") : fullName;
        const parts = fullName.split(".").filter(Boolean);
        const identityMode = parts.length > 2 ? "external-subname" : "ens";
        return {
          fullName,
          href: `/profile/setup?identityMode=${encodeURIComponent(identityMode)}&label=${encodeURIComponent(label)}`
        };
      }),
    [onchainIdentity.ensNames]
  );
  const discoveredCollectionLinks = useMemo(
    () =>
      onchainIdentity.collections.slice(0, 8).map((collection) => ({
        contractAddress: collection.contractAddress,
        ensSubname: collection.ensSubname,
        href: `/mint?view=manage&address=${encodeURIComponent(collection.contractAddress)}`
      })),
    [onchainIdentity.collections]
  );

  return (
    <section className="wizard profileSelectorPage">
      <section className="card formCard profileSelectorHero">
        <div className="profileSelectorHeroCopy">
          <p className="eyebrow">Creator Portal</p>
          <h2>Open the creator page, link the identity, or browse the live directory.</h2>
          <p className="sectionLead">
            NFTFactory profiles are the public-facing layer for collections, identity, and storefront state. This route should help
            you get into the right profile quickly, or start from zero without guessing where the setup path lives.
          </p>
          <div className="profileSelectorHeroPills">
            <span className="profileSelectorPill">ENS and subname identity</span>
            <span className="profileSelectorPill">Creator page routing</span>
            <span className="profileSelectorPill">Collection-linked profiles</span>
          </div>
        </div>
      </section>

      <div className="card formCard profileSelectorPanel">
        <div className="profileSelectorPanelHeader">
          <div>
            <h3>Creator Routes</h3>
            <p className="hint">Open the linked creator route for this wallet, or start a new identity setup flow.</p>
          </div>
          <div className="profileSelectorQuickActions">
            <Link href="/profile/setup" className="ctaLink">
              Open profile setup
            </Link>
            <Link href="/discover" className="ctaLink secondaryLink">
              Open discover
            </Link>
            <Link href="/mint?view=manage" className="ctaLink secondaryLink">
              Manage collection
            </Link>
          </div>
        </div>
        {!isConnected ? (
          <div className="profileSelectorEmptyCard">
            <strong>Connect a wallet to load linked creator profiles.</strong>
            <p className="hint">Use the header wallet control to load the creator routes already tied to this account.</p>
          </div>
        ) : isLoading ? (
          <div className="profileSelectorEmptyCard">
            <strong>Loading linked profiles...</strong>
            <p className="hint">Checking indexed profiles, discovered ENS identities, and creator-owned collections.</p>
          </div>
        ) : linkedProfiles.length > 0 ? (
          <div className="stack profileSelectorStack">
            <p className="hint">Linked profiles found. Redirecting to the primary profile now.</p>
            {linkedProfiles.map((profile) => (
              <div key={`${profile.slug}:${profile.ownerAddress}:${profile.collectionAddress || ""}`} className="card profileSelectorProfileCard">
                <strong>{profile.displayName || profile.fullName}</strong>
                <p className="hint">{profile.tagline || profile.fullName}</p>
                <div className="profileSelectorMetaGrid">
                  <p className="hint">
                    Route: <span className="mono">/profile/{profile.slug}</span>
                  </p>
                  <p className="hint">
                    Owner: <span className="mono">{profile.ownerAddress}</span>
                  </p>
                </div>
                <div className="row profileSelectorActions">
                  <Link href={`/profile/${encodeURIComponent(profile.slug)}`} className="ctaLink">
                    Open profile now
                  </Link>
                  {profile.collectionAddress ? (
                    <Link
                      href={`/mint?view=manage&address=${encodeURIComponent(profile.collectionAddress)}`}
                      className="ctaLink secondaryLink"
                    >
                      Manage collection
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="stack profileSelectorStack">
            <div className="profileSelectorEmptyCard">
              <strong>No creator profile is linked to this wallet yet.</strong>
              <p className="hint">Start from setup, then link ENS identity or mint an nftfactory.eth subname before publishing the creator page.</p>
            </div>
            <div className="row profileSelectorActions">
              <Link href="/profile/setup" className="ctaLink">Create or link profile</Link>
            </div>
            {discoveredIdentityLinks.length > 0 ? (
              <div className="stack profileSelectorDiscoveryBlock">
                <p className="hint">Onchain ENS identities found for this wallet.</p>
                {discoveredIdentityLinks.map((item) => (
                  <div key={item.fullName} className="card profileSelectorDiscoveryCard">
                    <strong>{item.fullName}</strong>
                    <div className="row profileSelectorActions">
                      <Link href={item.href} className="ctaLink">
                        Link this identity
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {discoveredCollectionLinks.length > 0 ? (
              <div className="stack profileSelectorDiscoveryBlock">
                <p className="hint">Creator collections already owned by this wallet.</p>
                {discoveredCollectionLinks.map((item) => (
                  <div key={item.contractAddress} className="card profileSelectorDiscoveryCard">
                    <strong>{item.ensSubname || item.contractAddress}</strong>
                    <p className="hint">
                      <span className="mono">{item.contractAddress}</span>
                    </p>
                    <div className="row profileSelectorActions">
                      <Link href={item.href} className="ctaLink secondaryLink">
                        Manage collection
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {note ? <p className="hint">{note}</p> : null}
      </div>
    </section>
  );
}

function dedupeCollections(items: ApiOwnedCollections["collections"]): ApiOwnedCollections["collections"] {
  const map = new Map<string, ApiOwnedCollections["collections"][number]>();
  for (const item of items) {
    const contractAddress = String(item.contractAddress || "").toLowerCase();
    if (!contractAddress) continue;
    if (!map.has(contractAddress)) {
      map.set(contractAddress, item);
    }
  }
  return [...map.values()];
}
