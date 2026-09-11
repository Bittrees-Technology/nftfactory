import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata('NFT marketplace', 'Browse NFT listings and review prices, networks, and availability before buying.', '/marketplace', false);
import MarketplaceClient from '../../components/marketplace/MarketplaceClient';
export default function Page(){return <MarketplaceClient/>;}
