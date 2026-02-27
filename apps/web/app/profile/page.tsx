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

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    const normalized = normalizeLabel(label);
    if (!normalized) return;
    router.push(`/profile/${encodeURIComponent(normalized)}`);
  }

  return (
    <section className="wizard">
      <div>
        <h1>Creator Profiles</h1>
        <p>Open a creator storefront by ENS subname label (example: creator.nftfactory.eth).</p>
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
        <button type="submit">Open Profile</button>
      </form>

      <div className="card formCard">
        <h3>Quick Links</h3>
        <div className="row">
          <Link href="/profile/creator">/profile/creator</Link>
          <Link href="/profile/studio">/profile/studio</Link>
        </div>
      </div>
    </section>
  );
}

