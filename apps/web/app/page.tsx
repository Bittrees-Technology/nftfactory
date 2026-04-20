import Link from "next/link";

export default function HomePage() {
  return (
    <section className="wizard homePage">
      <section className="heroCard homeHero">
        <div className="homeHeroCopy">
          <p className="eyebrow">Creator-Owned Publishing</p>
          <h1>Build the drop page, the collection, and the weird internet persona in one place.</h1>
          <p className="heroText">
            NFTFactory should feel less like a dashboard and more like a creator system: mint through a shared contract,
            deploy your own collection when you need control, then turn your profile into a page people actually remember.
          </p>
          <div className="homeHeroActions">
            <Link href="/mint?view=mint" className="ctaLink">
              Start publishing
            </Link>
            <Link href="/profile" className="ctaLink secondaryLink">
              Explore creator pages
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
              <p>Turn the profile page into a retro social page, not just a token inventory.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card homeStrip">
        <div className="flowStrip">
          <div className="flowCell">
            <span className="flowLabel">1. Connect</span>
            <p>Use the connected wallet as the narrow identity scope for collections, profile state, and ENS-linked inventory.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">2. Publish</span>
            <p>Upload media and metadata to IPFS, mint onchain, and keep the creator route attached to the drop.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">3. Customize</span>
            <p>Style a profile page with blurbs, song, guestbook, retro modules, and custom HTML accents.</p>
          </div>
        </div>
      </section>

      <div className="grid">
        <Link href="/mint?view=mint" className="card actionCard">
          <h3>Create and Publish</h3>
          <p>
            Start with one unified mint flow. Choose the shared contract for the fastest release, or switch to one
            of your creator collections when you need ownership, royalties, and long-term control.
          </p>
          <p className="actionHint">Open the unified mint and publish flow.</p>
        </Link>

        <Link href="/mint?view=mint&collection=custom" className="card actionCard">
          <h3>Creator Collection</h3>
          <p>
            Deploy your own ERC-721 or ERC-1155 contract via the factory, then return to manage identity,
            transfer ownership, or permanently lock the upgrade path.
          </p>
          <p className="actionHint">Open Mint in creator collection mode.</p>
        </Link>

        <Link href="/profile/setup" className="card actionCard">
          <h3>Creator Setup</h3>
          <p>
            Link an ENS name, link an ENS subdomain, or create an <strong>nftfactory.eth</strong> subname before
            publishing the public creator page.
          </p>
          <p className="actionHint">Open creator onboarding and identity setup.</p>
        </Link>
      </div>

      <div className="grid">
        <Link href="/mint?view=view" className="card actionCard">
          <h3>View Collection</h3>
          <p>
            Inspect shared or creator collections, review contract details, royalty defaults, split policy, and indexed tokens from one workspace.
          </p>
          <p className="actionHint">Open the collection overview tab directly.</p>
        </Link>

        <Link href="/mint?view=manage" className="card actionCard">
          <h3>Manage Collection</h3>
          <p>
            Attach identity, transfer ownership, verify contracts, or finalize upgrades when you want the collection frozen permanently.
          </p>
          <p className="actionHint">Open the collection management flow directly.</p>
        </Link>

        <Link href="/profile/moderation" className="card actionCard">
          <h3>Moderate Guestbook</h3>
          <p>
            Review creator guestbook entries, hide abuse, and keep public profile pages usable without opening each route one by one.
          </p>
          <p className="actionHint">Open the profile moderation workspace.</p>
        </Link>
      </div>
    </section>
  );
}
