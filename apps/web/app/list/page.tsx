import ListClient from "./ListClient";
import Link from "next/link";

export default function ListPage() {
  return (
    <section className="wizard">
      <div className="card formCard">
        <h2>Seller Flow</h2>
        <p className="hint">
          Use this page to create listings from your wallet and manage active sales. If you only want
          to browse what is currently for sale, use Discover instead.
        </p>
        <div className="row">
          <Link href="/discover" className="ctaLink secondaryLink">Go to Discover</Link>
          <Link href="/mint?view=mint&collection=shared" className="ctaLink secondaryLink">Mint before listing</Link>
        </div>
      </div>
      <ListClient />
    </section>
  );
}
