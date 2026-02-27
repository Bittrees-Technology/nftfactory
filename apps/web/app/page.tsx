export default function HomePage() {
  return (
    <section>
      <h1>nftfactory.eth</h1>
      <p>Ethereum-first minting platform with shared publish + creator-owned collection contracts.</p>
      <div className="grid">
        <article className="card">
          <h3>Publish</h3>
          <p>Use shared mint contracts or deploy your own ERC-721/1155 collection.</p>
        </article>
        <article className="card">
          <h3>Immutable Metadata</h3>
          <p>Upload to IPFS and lock token metadata permanently.</p>
        </article>
        <article className="card">
          <h3>Discovery + Moderation</h3>
          <p>Tag-based discovery with report-driven auto-hide and admin review.</p>
        </article>
      </div>
    </section>
  );
}
