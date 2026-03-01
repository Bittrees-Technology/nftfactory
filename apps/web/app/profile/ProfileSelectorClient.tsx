"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  fetchCollectionsByOwner,
  fetchProfilesByOwner,
  type ApiOwnedCollections,
  type ApiProfileRecord
} from "../../lib/indexerApi";

function normalizeDerivedProfile(collection: ApiOwnedCollections["collections"][number]): ApiProfileRecord | null {
  const rawName = String(collection.ensSubname || "").trim().toLowerCase();
  if (!rawName) return null;
  const fullName = rawName.includes(".") ? rawName : `${rawName}.nftfactory.eth`;
  const firstLabel = fullName.split(".")[0] || "";
  const slug = firstLabel.trim().toLowerCase();
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
    bannerUrl: null,
    avatarUrl: null,
    featuredUrl: null,
    accentColor: null,
    links: [],
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

export default function ProfileSelectorClient() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [profiles, setProfiles] = useState<ApiProfileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setNote("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setNote("");
    void Promise.allSettled([fetchProfilesByOwner(address), fetchCollectionsByOwner(address)])
      .then((results) => {
        if (cancelled) return;

        const profileResult = results[0];
        const collectionResult = results[1];

        const linkedProfiles =
          profileResult.status === "fulfilled" ? profileResult.value.profiles || [] : [];
        const derivedProfiles =
          collectionResult.status === "fulfilled"
            ? (collectionResult.value.collections || [])
                .map(normalizeDerivedProfile)
                .filter((item): item is ApiProfileRecord => !!item)
            : [];

        const nextProfiles = dedupeProfiles([...linkedProfiles, ...derivedProfiles]);
        setProfiles(nextProfiles);

        if (nextProfiles.length === 0) {
          if (profileResult.status === "rejected" && collectionResult.status === "rejected") {
            const reason =
              profileResult.reason instanceof Error
                ? profileResult.reason.message
                : collectionResult.reason instanceof Error
                  ? collectionResult.reason.message
                  : "Indexer request failed";
            setNote(`Profile lookup is unavailable right now (${reason}). Open setup to continue with manual creator onboarding.`);
            return;
          }
          setNote("No creator profile is linked to this wallet yet. Open setup to link an ENS identity or create an nftfactory.eth subname.");
          return;
        }

        if (profileResult.status === "rejected" && collectionResult.status === "fulfilled") {
          const reason =
            profileResult.reason instanceof Error ? profileResult.reason.message : "Direct profile lookup failed";
          setNote(`Loaded the profile from owned collection data because direct profile lookup failed (${reason}).`);
          return;
        }

        if (nextProfiles.length > 1) {
          setNote("Multiple legacy profile records were found for this wallet. Showing the primary profile.");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProfiles([]);
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
  }, [address, isConnected]);

  function openProfile(slug: string): void {
    router.push(`/profile/${encodeURIComponent(slug)}`);
  }

  const primaryProfile = profiles[0] || null;

  return (
    <section className="wizard">
      <div className="card formCard">
        <h3>Select Profile</h3>
        {!isConnected ? (
          <p className="hint">Connect a wallet from the header to load linked creator profiles.</p>
        ) : isLoading ? (
          <p className="hint">Loading linked profiles...</p>
        ) : primaryProfile ? (
          <div className="stack">
            <p className="hint">Linked profile</p>
            <strong>{primaryProfile.fullName}</strong>
            <div className="row">
              <button type="button" onClick={() => openProfile(primaryProfile.slug)}>Open Profile</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <Link href="/profile/setup" className="ctaLink">Open creator setup</Link>
          </div>
        )}
        {note ? <p className="hint">{note}</p> : null}
      </div>
    </section>
  );
}
