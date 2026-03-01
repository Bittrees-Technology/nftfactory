import Link from "next/link";

export default function HomePage() {
  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">nftfactory.eth</p>
        <p className="heroText">
          Mint instantly into shared contracts, deploy your own creator collection, list work for sale,
          and browse the marketplace. Use the profile route for creator onboarding, ENS identity setup,
          and storefront lookup.
        </p>
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
            Deploy your own ERC-721 or ERC-1155 contract via the factory, then return to manage identity,
            transfer ownership, or lock the upgrade path once the collection is ready.
          </p>
          <p className="actionHint">Opens Mint in custom collection mode.</p>
        </Link>

        <Link href="/profile/setup" className="card actionCard">
          <h3>Creator Setup</h3>
          <p>
            Link an ENS name, link an ENS subdomain, or create an <strong>nftfactory.eth</strong> subname
            before opening the public creator profile.
          </p>
          <p className="actionHint">Opens creator onboarding and identity setup.</p>
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
          <h3>Manage Collection</h3>
          <p>
            Choose an existing creator collection, attach an ENS identity, transfer ownership, or call{" "}
            <strong>Finalize Upgrades</strong> when you want the contract frozen permanently.
          </p>
          <p className="actionHint">Opens the collection management flow directly.</p>
        </Link>
      </div>
    </section>
  );
}
