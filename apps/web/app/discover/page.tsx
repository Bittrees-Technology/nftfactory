import DiscoverClient from "./DiscoverClient";
import Link from "next/link";

export default function DiscoverPage() {
  return (
    <section className="wizard">
      <div className="card formCard">
        <h2>Browse Flow</h2>
        <p className="hint">
          This is the public browse flow. Use filters to inspect active listings, then jump to List
          if you want to create or manage your own sale.
        </p>
        <div className="row">
          <Link href="/list" className="ctaLink secondaryLink">Go to seller tools</Link>
          <Link href="/profile" className="ctaLink secondaryLink">Open creator profiles</Link>
        </div>
      </div>
      <DiscoverClient />
    </section>
  );
}
