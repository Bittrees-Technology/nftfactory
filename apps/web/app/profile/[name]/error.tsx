"use client";

import Link from "next/link";
import SectionStatePanel from "../../../components/SectionStatePanel";

function sanitizeProfilePageErrorMessage(message: string | undefined): string {
  const normalized = String(message || "").trim().toLowerCase();
  if (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("cloudflare tunnel error")
  ) {
    return "Profile data is temporarily unavailable. Please try again shortly.";
  }
  return message || "Failed to load the profile page.";
}

export default function ProfileError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="grid">
      <SectionStatePanel
        className="card formCard"
        title="Creator Route Unavailable"
        message={sanitizeProfilePageErrorMessage(error.message)}
        messageClassName="error"
        actions={
          <>
            <button type="button" onClick={reset}>
              Retry route
            </button>
            <Link href="/profile" className="ctaLink secondaryLink">
              Open creator directory
            </Link>
            <Link href="/wiki/infrastructure-and-operations" className="ctaLink secondaryLink">
              Ops notes
            </Link>
          </>
        }
      />
    </section>
  );
}
