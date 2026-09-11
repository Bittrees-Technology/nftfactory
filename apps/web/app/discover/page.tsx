import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata('Explore NFT artwork and creators', 'Discover NFT collections, independent creators, and artwork on NFTFactory.', '/discover', false);
export const dynamic = "force-dynamic";
import DiscoverClient from "../../components/discover/DiscoverClient";

export default function DiscoverPage() {
  return <DiscoverClient />;
}
