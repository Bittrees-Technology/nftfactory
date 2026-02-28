"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { fetchProfilesByOwner, type ApiProfileRecord } from "../../lib/indexerApi";

export default function ProfileSelectorClient() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [profiles, setProfiles] = useState<ApiProfileRecord[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setSelectedSlug("");
      setNote("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setNote("");
    void fetchProfilesByOwner(address)
      .then((response) => {
        if (cancelled) return;
        const nextProfiles = response.profiles || [];
        setProfiles(nextProfiles);
        if (nextProfiles.length === 1) {
          router.replace(`/profile/${encodeURIComponent(nextProfiles[0].slug)}`);
          return;
        }
        setSelectedSlug(nextProfiles[0]?.slug || "");
        if (nextProfiles.length === 0) {
          setNote("No creator profile is linked to this wallet yet. Open setup to link an ENS identity or create an nftfactory.eth subname.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([]);
          setSelectedSlug("");
          setNote("Profile lookup is unavailable right now. Open setup to continue with manual creator onboarding.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, router]);

  function openSelectedProfile(): void {
    if (!selectedSlug) return;
    router.push(`/profile/${encodeURIComponent(selectedSlug)}`);
  }

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Creator Profiles</p>
        <h1>Select Profile</h1>
        <p className="heroText">
          Choose an existing creator identity for this wallet, or continue into setup to link an ENS
          name, link an ENS subdomain, or create a new nftfactory.eth identity.
        </p>
      </div>

      <div className="card formCard">
        <h3>Select Profile</h3>
        {!isConnected ? (
          <p className="hint">Connect a wallet from the header to load linked creator profiles.</p>
        ) : isLoading ? (
          <p className="hint">Loading linked profiles...</p>
        ) : profiles.length > 1 ? (
          <>
            <label>
              Linked profiles
              <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
                {profiles.map((profile) => (
                  <option key={`${profile.slug}-${profile.source}-${profile.collectionAddress || "none"}`} value={profile.slug}>
                    {profile.fullName}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button type="button" onClick={openSelectedProfile} disabled={!selectedSlug}>Open Profile</button>
              <Link href="/profile/setup" className="ctaLink secondaryLink">Open creator setup</Link>
            </div>
          </>
        ) : profiles.length === 1 ? (
          <div className="row">
            <p className="hint">Redirecting to {profiles[0].fullName}...</p>
            <Link href={`/profile/${encodeURIComponent(profiles[0].slug)}`} className="ctaLink secondaryLink">Open now</Link>
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
