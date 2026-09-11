import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata('My studio', 'Manage your creator page, artwork, and collections.', '/profile', true);
import StudioWorkspaceClient from '../../components/profile/StudioWorkspaceClient';
import Link from 'next/link';
import ProductPageHeader from '../../components/ProductPageHeader';
import ProfileSelectorClient from '../../components/profile/ProfileSelectorClient';
export const dynamic = 'force-dynamic';
export default function ProfileLandingPage() {
  return <section><ProductPageHeader section="Your workspace" title="My studio" description="Create new work, shape your creator page, and manage what you share." actions={<><Link href="/mint" className="ctaLink">Create an NFT</Link><Link href="/profile/setup" className="ctaLink secondary">Edit creator page</Link></>} /><StudioWorkspaceClient /><ProfileSelectorClient /></section>;
}
