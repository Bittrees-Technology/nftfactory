import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata('My studio', 'Manage your creator page, artwork, and collections.', '/profile', true);
import StudioWorkspaceClient from '../../components/profile/StudioWorkspaceClient';
import Link from 'next/link';
import ProfileSelectorClient from '../../components/profile/ProfileSelectorClient';
export const dynamic = 'force-dynamic';
export default function ProfileLandingPage() {
  return <section><header className="pageHeading"><h1>My studio</h1><p>Your artwork, creator page, and collections.</p><div className="homeHeroActions"><Link href="/mint" className="ctaLink">Create an NFT</Link><Link href="/profile/setup" className="ctaLink secondary">Edit creator page</Link></div></header><StudioWorkspaceClient /><ProfileSelectorClient /></section>;
}
