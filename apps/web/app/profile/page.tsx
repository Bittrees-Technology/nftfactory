import Link from 'next/link';
import ProfileSelectorClient from '../../components/profile/ProfileSelectorClient';
export const dynamic = 'force-dynamic';
export default function ProfileLandingPage() {
  return <section><header className="pageHeading"><h1>My studio</h1><p>Your artwork, creator page, and collections.</p><div className="homeHeroActions"><Link href="/mint" className="ctaLink">Create an NFT</Link><Link href="/profile/setup" className="ctaLink secondary">Edit creator page</Link></div></header><nav className="studioNavigation" aria-label="Studio"><Link href="/profile/setup">Customize creator page</Link><Link href="/profile/import">Import artwork</Link><Link href="/profile/listings">Manage listings</Link><Link href="/marketplace">Browse marketplace</Link></nav><ProfileSelectorClient /></section>;
}
