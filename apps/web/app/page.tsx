import Image from 'next/image';
import Link from 'next/link';
import { pageMetadata } from '../lib/seo';

export const metadata = pageMetadata('Create NFTs. Build your body of work.', 'Turn artwork into NFTs, organize collections, and customize your creator page. A creative workshop for independent artists.', '/');

export default function HomePage() {
  return <div className="homeRefresh">
    <section className="landingHero" aria-labelledby="home-title">
      <div className="landingCopy">
        <p className="eyebrow">A workshop for independent creators</p>
        <h1 id="home-title">Make it yours.<br />Make it collectible.</h1>
        <p className="landingLead">Turn artwork into NFTs. Build collections. Make a creator page that feels like you.</p>
        <div className="homeHeroActions"><Link className="ctaLink" href="/mint">Create an NFT</Link><Link className="ctaLink secondary" href="/discover">Explore artwork</Link></div>
      </div>
      <figure className="factoryArtwork">
        <Image src="/brand/factory-study.png" alt="A brushed silver frame with a vivid orange slab passing through its center" width={1536} height={1024} sizes="(max-width: 760px) 100vw, 55vw" preload />
        <figcaption><span>Factory study / 001</span><span>Concept artwork</span></figcaption>
      </figure>
    </section>
    <section className="workshopSection" aria-labelledby="workshop-title">
      <div><h2 id="workshop-title">From first idea<br />to your next edition.</h2><p>One artwork or a growing collection. Give each piece its own place, and bring it all together in your studio.</p></div>
      <ol className="workshopProcess">
        <li><span aria-hidden="true">01</span><div><h3>Bring the work</h3><p>Upload an image and tell its story. Preview the artwork and details before you mint.</p></div></li>
        <li><span aria-hidden="true">02</span><div><h3>Make it collectible</h3><p>Review the network and fees, then confirm in your wallet. Minting records the NFT onchain.</p></div></li>
        <li><span aria-hidden="true">03</span><div><h3>Build your body of work</h3><p>Organize collections, add tags, and share a creator page with your own visual identity.</p></div></li>
      </ol>
    </section>
    <section className="studioInvitation" aria-labelledby="studio-title">
      <h2 id="studio-title">Your studio.<br />Your signature.</h2>
      <div><p>Choose a theme, add a cover, and put your favorite work first. Already have NFTs? Import an existing collection to bring verified work into your profile.</p><div className="studioLinks"><Link href="/profile/setup">Set up your creator page <span aria-hidden="true">↗</span></Link><Link href="/profile/import">Import a collection <span aria-hidden="true">↗</span></Link></div></div>
    </section>
    <section className="factoryDetails" aria-label="Before you begin">
      <div><h2>Made to be explored.</h2><p>Discover creators and browse NFT listings. Check the network, price, and availability before connecting your wallet.</p><Link href="/marketplace">Browse the marketplace →</Link></div>
      <div><h2>Know what you publish.</h2><p>NFT ownership does not automatically include copyright. Artwork and metadata use IPFS; availability depends on maintained copies. Wallet confirmation and network fees apply.</p><Link href="/wiki/creator-walkthrough">Follow the creator walkthrough →</Link></div>
    </section>
  </div>;
}
