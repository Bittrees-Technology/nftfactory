import Link from "next/link";

export default function HomePage() {
  return (
    <section className="wizard homePage">
      <section className="heroCard homeHero">
        <div className="homeHeroCopy">
          <p className="eyebrow">Creator-Owned Publishing</p>
          <h1>Launch the collection, the storefront, and the identity layer from one system.</h1>
          <p className="heroText">
            NFTFactory is built for creators who want more than a mint form. Publish on the shared contract for speed,
            deploy your own collection when the release deserves its own rails, then turn the profile into a route that
            carries the drop, the catalog, and the public persona together.
          </p>
          <div className="homeSignalRow" aria-label="Platform focus">
            <span className="homeSignalPill">Shared + creator-owned contracts</span>
            <span className="homeSignalPill">ENS-linked profile routes</span>
            <span className="homeSignalPill">IPFS-backed metadata and media</span>
          </div>
          <div className="homeHeroActions">
            <Link href="/mint?view=mint" className="ctaLink">
              Start a drop
            </Link>
            <Link href="/mint?view=manage" className="ctaLink secondaryLink">
              Open operator workspace
            </Link>
          </div>
        </div>
        <div className="homeHeroPanel">
          <div className="homeHeroPanelHeader">
            <span className="homeHeroPanelDot" />
            <span className="homeHeroPanelDot" />
            <span className="homeHeroPanelDot" />
            <strong>nftfactory.eth</strong>
          </div>
          <div className="homeHeroPanelBody">
            <div className="homeHeroStatusCard">
              <span className="flowLabel">Release surface</span>
              <ul className="homeHeroChecklist">
                <li>Mint on shared ERC-721 / ERC-1155 flows</li>
                <li>Deploy and manage creator-owned collections</li>
                <li>Link ENS identity to public creator pages</li>
              </ul>
            </div>
            <div className="homeHeroPanelGrid">
              <div className="homeHeroPanelCard">
                <span className="flowLabel">Publish</span>
                <p>Mint on shared or creator-owned contracts with IPFS-backed metadata.</p>
              </div>
              <div className="homeHeroPanelCard">
                <span className="flowLabel">Own</span>
                <p>Keep royalty controls, identity links, and collection management attached to the same route.</p>
              </div>
              <div className="homeHeroPanelCard">
                <span className="flowLabel">Express</span>
                <p>Turn the profile page into a social artifact, not just a token inventory.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card homeOpsBand">
        <div className="homeOpsBandHeader">
          <div>
            <p className="eyebrow">Operator Path</p>
            <h2>Designed for fast publishing, but structured for real ownership and cutover discipline.</h2>
          </div>
          <p className="sectionLead">
            The same surface that gets a creator live quickly also keeps contract verification, upgrade finalization,
            royalty defaults, identity setup, and moderation reachable from one place.
          </p>
        </div>
        <div className="homeOpsGrid">
          <div className="homeOpsCard">
            <span className="flowLabel">Contracts</span>
            <p>Use the shared path when time matters. Move to a creator-owned collection when the release needs separate control.</p>
          </div>
          <div className="homeOpsCard">
            <span className="flowLabel">Identity</span>
            <p>Connect ENS or nftfactory.eth subnames so the collection and the public profile resolve through the same creator route.</p>
          </div>
          <div className="homeOpsCard">
            <span className="flowLabel">Operations</span>
            <p>Keep verification, ownership transfer, upgrade freeze, guestbook moderation, and collection maintenance inside the live app.</p>
          </div>
        </div>
      </section>

      <section className="card homeStrip">
        <div className="flowStrip">
          <div className="flowCell">
            <span className="flowLabel">1. Connect</span>
            <p>Use the connected wallet as the identity scope for collections, profile state, and ENS-linked inventory.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">2. Publish</span>
            <p>Upload media and metadata to IPFS, mint onchain, and keep the creator route attached to the release.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">3. Shape the page</span>
            <p>Style the creator page with blurbs, song, guestbook, retro modules, and custom HTML accents.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">4. Operate</span>
            <p>Return to manage ownership, verification, royalties, and moderation as the collection matures.</p>
          </div>
        </div>
      </section>

      <section className="homeSectionHeader">
        <div>
          <p className="eyebrow">Start Here</p>
          <h2>Choose the surface that matches what you need to do right now.</h2>
        </div>
        <p className="sectionLead">
          The front page should route you into the right tool quickly instead of making every creator begin from the same generic panel.
        </p>
      </section>

      <div className="grid">
        <Link href="/mint?view=mint" className="card actionCard">
          <h3>Start a Drop</h3>
          <p>
            Open the unified mint flow to upload media, pin metadata, choose the collection path, and publish a release from one workspace.
          </p>
          <p className="actionHint">Go to mint and publish.</p>
        </Link>

        <Link href="/mint?view=mint&collection=custom" className="card actionCard">
          <h3>Deploy a Creator Collection</h3>
          <p>
            Deploy your own ERC-721 or ERC-1155 contract through the factory when the project needs separate ownership, royalty policy, and upgrade controls.
          </p>
          <p className="actionHint">Open mint in creator-owned mode.</p>
        </Link>

        <Link href="/profile/setup" className="card actionCard">
          <h3>Set Up Identity</h3>
          <p>
            Link an ENS name, connect a subname, or mint an <strong>nftfactory.eth</strong> subname before publishing the public creator route.
          </p>
          <p className="actionHint">Open creator onboarding.</p>
        </Link>
      </div>

      <section className="homeSectionHeader">
        <div>
          <p className="eyebrow">Operator Surfaces</p>
          <h2>Use the live app as the control room, not just the launch form.</h2>
        </div>
      </section>

      <div className="grid">
        <Link href="/mint?view=view" className="card actionCard">
          <h3>Inspect a Collection</h3>
          <p>
            Review contract details, royalty defaults, split policy, indexed tokens, and listing state from one collection workspace.
          </p>
          <p className="actionHint">Open the collection overview.</p>
        </Link>

        <Link href="/mint?view=manage" className="card actionCard">
          <h3>Manage Ownership and Verification</h3>
          <p>
            Attach identity, transfer ownership, verify contracts, and finalize upgrades when the collection is ready to lock down.
          </p>
          <p className="actionHint">Open the management workspace.</p>
        </Link>

        <Link href="/profile" className="card actionCard">
          <h3>Explore Creator Pages</h3>
          <p>
            Browse the public profile surface and use it as the branded end-state for collections, drops, and creator identity.
          </p>
          <p className="actionHint">Open the creator page surface.</p>
        </Link>
      </div>

      <div className="grid">
        <Link href="/profile/moderation" className="card actionCard">
          <h3>Moderate Guestbook</h3>
          <p>Review guestbook entries, hide abuse, and keep creator pages usable without opening each profile one by one.</p>
          <p className="actionHint">Open profile moderation.</p>
        </Link>

        <Link href="/wiki" className="card actionCard">
          <h3>Read the Runbooks</h3>
          <p>Jump into the live documentation for deployment, operations, IPFS, testing, and governance before production cutover.</p>
          <p className="actionHint">Open the wiki and operator docs.</p>
        </Link>

        <Link href="/mint?view=view" className="card actionCard">
          <h3>Review Live Token Reads</h3>
          <p>Use the indexed collection surface to confirm how tokens, listings, and creator-owned collections appear to the real app.</p>
          <p className="actionHint">Open indexed collection reads.</p>
        </Link>
      </div>
    </section>
  );
}
