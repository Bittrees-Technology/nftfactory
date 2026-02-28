import Link from "next/link";

export default function HomePage() {
  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">nftfactory.eth</p>
        <h1>Publish, List, and Discover</h1>
        <p className="heroText">
          Mint instantly into shared contracts, deploy your own creator collection, list work for sale,
          and browse the marketplace. Use the profile route for creator onboarding, ENS identity setup,
          and storefront lookup.
        </p>
        <div className="row">
          <Link href="/mint?view=mint&collection=shared" className="ctaLink">
            Start with shared mint
          </Link>
          <Link href="/mint?view=mint&collection=custom" className="ctaLink secondaryLink">
            Deploy a creator collection
          </Link>
          <Link href="/discover" className="ctaLink secondaryLink">
            Browse marketplace
          </Link>
          <Link href="/profile" className="ctaLink secondaryLink">
            Creator profiles
          </Link>
        </div>
      </div>

      <div className="grid">
        <Link href="/mint?view=mint&collection=shared" className="card actionCard">
          <h3>Shared Mint</h3>
          <p>
            Publish any token into a common shared contract — no setup, no deploy cost, instant.
            Anyone can mint. Attribute tokens to your ENS subname for creator-profile discovery.
          </p>
          <p className="actionHint">Opens Mint in shared mode.</p>
        </Link>

        <Link href="/mint?view=mint&collection=custom" className="card actionCard">
          <h3>Creator Collection</h3>
          <p>
            Deploy your own ERC-721 or ERC-1155 contract via the factory. Only you can mint into it.
            Supports royalties (EIP-2981), per-token metadata locking, and upgrade finality.
          </p>
          <p className="actionHint">Opens Mint in custom collection mode.</p>
        </Link>

        <Link href="/profile" className="card actionCard">
          <h3>Creator Profiles</h3>
          <p>
            Set up your creator identity, register an <strong>nftfactory.eth</strong> subname, and open
            a storefront by ENS label.
          </p>
          <p className="actionHint">Opens creator onboarding and lookup.</p>
        </Link>
      </div>

      <div className="grid">
        <Link href="/mint?view=mint&collection=custom" className="card actionCard">
          <h3>Immutable Metadata</h3>
          <p>
            Upload to IPFS via Pinata. For creator collections, lock each token&apos;s metadata on mint —
            permanently frozen and verifiable. Collectors can trust what they own.
          </p>
          <p className="actionHint">Takes you to custom minting with metadata controls.</p>
        </Link>

        <Link href="/discover" className="card actionCard">
          <h3>Marketplace</h3>
          <p>
            List tokens from shared or custom collections at a fixed price in ETH or ERC-20.
            Filter by collection type, standard, price, or search by ENS creator name.
          </p>
          <p className="actionHint">Opens the read-only marketplace browser.</p>
        </Link>

        <Link href="/mint?view=manage" className="card actionCard">
          <h3>Upgrade Finality</h3>
          <p>
            Creator collections use a UUPS proxy and can be upgraded by the owner. Call{" "}
            <strong>Finalize Upgrades</strong> to permanently disable upgrades — making the contract
            immutable forever. Only the owner can do this; it cannot be undone.
          </p>
          <p className="actionHint">Opens collection management directly.</p>
        </Link>
      </div>

      <div className="card formCard">
        <h3>Operational Routes</h3>
        <div className="row">
          <Link href="/list" className="ctaLink secondaryLink">Create or manage listings</Link>
          <Link href="/admin" className="ctaLink secondaryLink">Moderation admin</Link>
        </div>
      </div>
    </section>
  );
}
