"use client";

import Link from "next/link";
import SectionStatePanel from "../../components/SectionStatePanel";

export default function MintError({
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
        title="Mint Workspace Unavailable"
        message={
          error.message ||
          "The mint workspace could not load. Check the deploy health panel and IPFS/indexer availability before retrying."
        }
        messageClassName="error"
        actions={
          <>
            <button type="button" onClick={reset}>
              Retry workspace
            </button>
            <Link href="/wiki/ipfs-upload-failure-triage" className="ctaLink secondaryLink">
              IPFS recovery notes
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
