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
              Open manage workspace
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

      <section className="homeMetricsGrid" aria-label="Platform capabilities">
        <article className="card homeMetricCard">
          <span className="flowLabel">Release models</span>
          <strong>2 lanes</strong>
          <p>Use the shared contract for speed, then graduate to creator-owned contracts when the project needs its own governance and upgrade posture.</p>
        </article>
        <article className="card homeMetricCard">
          <span className="flowLabel">Creator route</span>
          <strong>1 identity surface</strong>
          <p>Collections, profile presentation, and ENS naming resolve through the same creator-facing route instead of being split across separate tools.</p>
        </article>
        <article className="card homeMetricCard">
          <span className="flowLabel">Operator controls</span>
          <strong>Live inside the app</strong>
          <p>Verification, ownership transfer, upgrade freeze, profile moderation, and collection management stay reachable from the production surface.</p>
        </article>
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

      <section className="homeShowcaseGrid">
        <article className="card homeShowcaseCard homeShowcaseCard--warm">
          <p className="eyebrow">For creators</p>
          <h3>Ship the release without losing the long-term structure.</h3>
          <p>
            NFTFactory is for the creator who wants the first drop live quickly, but does not want to rebuild identity,
            royalties, and collection operations somewhere else later.
          </p>
          <ul className="homeShowcaseList">
            <li>Start shared when speed matters</li>
            <li>Move into creator-owned contracts when the audience grows</li>
            <li>Keep the public page and the contract story aligned</li>
          </ul>
        </article>

        <article className="card homeShowcaseCard homeShowcaseCard--dark">
          <div className="homeShowcasePanelHeader">
            <span className="homeHeroPanelDot" />
            <span className="homeHeroPanelDot" />
            <span className="homeHeroPanelDot" />
            <strong>Launch stack</strong>
          </div>
          <div className="homeShowcaseRail">
            <div className="homeShowcaseRailItem">
              <span className="flowLabel">Collection</span>
              <p>ERC-721 or ERC-1155 through shared or creator-owned flows.</p>
            </div>
            <div className="homeShowcaseRailItem">
              <span className="flowLabel">Identity</span>
              <p>ENS-linked profile route with retro customization and public creator framing.</p>
            </div>
            <div className="homeShowcaseRailItem">
              <span className="flowLabel">Distribution</span>
              <p>IPFS-backed metadata and indexed collection reads that feed the live app.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="homeActionSection">
        <div className="homeActionSectionHeader">
          <p className="eyebrow">Primary Routes</p>
          <p className="sectionLead">Start with the path that moves the release forward right now.</p>
        </div>
        <div className="grid homeActionGrid">
          <Link href="/mint?view=mint" className="card actionCard">
            <span className="flowLabel">Mint</span>
            <h3>Start a Drop</h3>
            <p>Upload media, pin metadata, choose the collection path, and publish from one workspace.</p>
            <p className="actionHint">Open mint workspace</p>
          </Link>

          <Link href="/mint?view=mint&collection=custom" className="card actionCard">
            <span className="flowLabel">Custom Contract</span>
            <h3>Deploy a Creator Collection</h3>
            <p>Deploy your own ERC-721 or ERC-1155 contract when the project needs separate ownership and policy.</p>
            <p className="actionHint">Open creator-owned path</p>
          </Link>

          <Link href="/profile/setup" className="card actionCard">
            <span className="flowLabel">Identity</span>
            <h3>Set Up Identity</h3>
            <p>Link ENS, connect a subname, or mint an <strong>nftfactory.eth</strong> subname before publishing the public route.</p>
            <p className="actionHint">Open creator onboarding</p>
          </Link>
        </div>
      </section>

      <section className="homeActionSection">
        <div className="homeActionSectionHeader">
          <p className="eyebrow">Operator Routes</p>
          <p className="sectionLead">Use the live app as the collection control room after launch.</p>
        </div>
        <div className="grid homeActionGrid">
          <Link href="/mint?view=view" className="card actionCard">
            <span className="flowLabel">View</span>
            <h3>Inspect a Collection</h3>
            <p>Review contract details, royalty defaults, indexed tokens, and listing state from one workspace.</p>
            <p className="actionHint">Open collection overview</p>
          </Link>

          <Link href="/mint?view=manage" className="card actionCard">
            <span className="flowLabel">Manage</span>
            <h3>Manage Ownership and Verification</h3>
            <p>Attach identity, transfer ownership, verify contracts, and finalize upgrades when the collection is ready.</p>
            <p className="actionHint">Open manage workspace</p>
          </Link>

          <Link href="/discover" className="card actionCard">
            <span className="flowLabel">Discover</span>
            <h3>Browse Public Index</h3>
            <p>Browse public creator pages, collection contracts, and live NFTs from one discovery surface.</p>
            <p className="actionHint">Open public discovery</p>
          </Link>
        </div>
      </section>

      <section className="homeActionSection">
        <div className="homeActionSectionHeader">
          <p className="eyebrow">Support Routes</p>
          <p className="sectionLead">Keep moderation, runbooks, and live-read checks close to the release flow.</p>
        </div>
        <div className="grid homeActionGrid">
          <Link href="/profile/moderation" className="card actionCard">
            <span className="flowLabel">Moderation</span>
            <h3>Moderate Guestbook</h3>
            <p>Review guestbook entries, hide abuse, and keep creator pages usable without opening each profile one by one.</p>
            <p className="actionHint">Open profile moderation</p>
          </Link>

          <Link href="/wiki" className="card actionCard">
            <span className="flowLabel">Docs</span>
            <h3>Read the Runbooks</h3>
            <p>Jump into deployment, operations, IPFS, testing, and governance documentation before production cutover.</p>
            <p className="actionHint">Open wiki and operator docs</p>
          </Link>

          <Link href="/mint?view=view" className="card actionCard">
            <span className="flowLabel">Reads</span>
            <h3>Review Live Token Reads</h3>
            <p>Use the indexed collection surface to confirm how tokens, listings, and creator-owned collections appear in the real app.</p>
            <p className="actionHint">Open indexed collection reads</p>
          </Link>
        </div>
      </section>
    </section>
  );
}
