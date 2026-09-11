import { pageMetadata } from '../../../lib/seo';
export const metadata = pageMetadata('Manage listings', 'Manage your NFT marketplace listings.', '/profile/listings', true);
import Link from 'next/link';
import ListingManagementClient from '../../../components/profile/ListingManagementClient';
export default function Page(){return <section className="studioPage"><header className="pageHeading"><Link href="/profile">My studio</Link><h1>Your listings</h1><p>List artwork for sale, change its price, or cancel a listing.</p></header><ListingManagementClient/></section>;}
