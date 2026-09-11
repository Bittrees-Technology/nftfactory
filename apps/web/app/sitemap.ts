import type { MetadataRoute } from 'next';
import { canIndexSite, SITE_URL } from '../lib/seo';
import { publicCreatorSitemapPaths } from '../lib/publicSeo';
import { PUBLIC_WIKI_SLUGS } from '../lib/wikiRoutes';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!canIndexSite()) return [];
  const guides = PUBLIC_WIKI_SLUGS.filter(slug => slug !== 'home');
  return ['/', '/discover', '/marketplace', '/wiki', ...guides.map(slug => `/wiki/${slug}`), ...await publicCreatorSitemapPaths()]
    .map(path => ({ url: `${SITE_URL}${path}` }));
}
