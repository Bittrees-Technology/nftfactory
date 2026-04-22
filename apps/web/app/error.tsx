"use client";

import Link from "next/link";
import SectionStatePanel from "../components/SectionStatePanel";

export default function GlobalError({
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
        title="App Surface Unavailable"
        message={error.message || "An unexpected error occurred while loading the app surface."}
        messageClassName="error"
        actions={
          <>
            <button type="button" onClick={reset}>
              Retry app load
            </button>
            <Link href="/wiki/infrastructure-and-operations" className="ctaLink secondaryLink">
              Review ops notes
            </Link>
          </>
        }
      />
    </section>
  );
}
