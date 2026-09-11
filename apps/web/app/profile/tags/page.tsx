import { pageMetadata } from '../../../lib/seo';
export const metadata = pageMetadata('Manage artwork tags', 'Organize your artwork with custom offchain tags.', '/profile/tags', true);
import TagWorkspaceClient from '../../../components/artwork/TagWorkspaceClient';
export default function Page(){return <TagWorkspaceClient/>;}
