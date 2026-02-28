import Link from "next/link";

export default function HomePage() {
  return (
    <section>
      <h1>nftfactory.eth</h1>
      <p>Ethereum-native minting with shared open contracts or your own private creator collection.</p>

      <div className="grid">
        <article className="card">
          <h3>Shared Mint</h3>
          <p>
            Publish any token into a common shared contract — no setup, no deploy cost, instant.
            Anyone can mint. Attribute tokens to your ENS subname for creator-profile discovery.
          </p>
          <p><Link href="/mint">→ Start minting</Link></p>
        </article>

        <article className="card">
          <h3>Creator Collection</h3>
          <p>
            Deploy your own ERC-721 or ERC-1155 contract via the factory. Only you can mint into it.
            Supports royalties (EIP-2981), per-token metadata locking, and upgrade finality.
          </p>
          <p><Link href="/mint">→ Deploy and mint</Link></p>
        </article>

        <article className="card">
          <h3>ENS Identity</h3>
          <p>
            Register a subname under <strong>nftfactory.eth</strong> (e.g. studio.nftfactory.eth) to link
            your wallet to a human-readable creator profile. Works in both shared and custom collections.
          </p>
          <p><Link href="/profile">→ Creator profiles</Link></p>
        </article>
      </div>

      <div className="grid">
        <article className="card">
          <h3>Immutable Metadata</h3>
          <p>
            Upload to IPFS via Pinata. For creator collections, lock each token&apos;s metadata on mint —
            permanently frozen and verifiable. Collectors can trust what they own.
          </p>
        </article>

        <article className="card">
          <h3>Marketplace</h3>
          <p>
            List tokens from shared or custom collections at a fixed price in ETH or ERC-20.
            Filter by collection type, standard, price, or search by ENS creator name.
          </p>
          <p><Link href="/list">→ Browse listings</Link></p>
        </article>

        <article className="card">
          <h3>Upgrade Finality</h3>
          <p>
            Creator collections use a UUPS proxy and can be upgraded by the owner. Call{" "}
            <strong>Finalize Upgrades</strong> to permanently disable upgrades — making the contract
            immutable forever. Only the owner can do this; it cannot be undone.
          </p>
          <p><Link href="/mint">→ Manage collection</Link></p>
        </article>
      </div>
    </section>
  );
}
