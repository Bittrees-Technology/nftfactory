import { pageMetadata } from '../../../lib/seo';
export const metadata = pageMetadata('Import a collection', 'Add verified existing NFTs and collections to your creator profile.', '/profile/import', true);
import ImportArtworkClient from '../../../components/artwork/ImportArtworkClient';
export default function Page(){return <ImportArtworkClient/>;}
