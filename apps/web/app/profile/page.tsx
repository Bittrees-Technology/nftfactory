"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

export default function ProfileLandingPage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const normalized = normalizeLabel(label);

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!normalized) return;
    router.push(`/profile/${encodeURIComponent(normalized)}`);
  }

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Creator Lookup</p>
        <h1>Creator Profiles</h1>
        <p className="heroText">
          Open a creator storefront by ENS subname label. This route is for identity lookup first, then
          storefront review after the indexer resolves the creator mapping.
        </p>
        <div className="row">
          <Link href="/discover" className="ctaLink secondaryLink">Browse marketplace first</Link>
          <Link href="/mint?view=mint&collection=shared" className="ctaLink secondaryLink">Mint with ENS attribution</Link>
        </div>
      </div>

      <form className="card formCard" onSubmit={onSubmit}>
        <label>
          ENS subname label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="creator"
          />
        </label>
        <button type="submit" disabled={!normalized}>Open Profile</button>
        <p className="hint">
          {normalized
            ? `Profile route: /profile/${normalized}`
            : "Enter a subname like creator or studio. The .nftfactory.eth suffix is optional."}
        </p>
      </form>

      <div className="card formCard">
        <h3>Quick Links</h3>
        <p className="hint">
          Use these examples to confirm the profile route itself is navigating correctly before testing a
          real creator mapping.
        </p>
        <div className="row">
          <Link href="/profile/creator">/profile/creator</Link>
          <Link href="/profile/studio">/profile/studio</Link>
        </div>
      </div>
    </section>
  );
}
