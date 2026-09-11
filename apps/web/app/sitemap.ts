import type { MetadataRoute } from 'next';
import { canIndexSite, SITE_URL } from '../lib/seo';
import { getWikiPages } from '../lib/wiki';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!canIndexSite()) return [];
  const guides = (await getWikiPages()).filter(page => page.slug !== 'home');
  return ['/', '/discover', '/marketplace', '/wiki', ...guides.map(page => `/wiki/${page.slug}`)]
    .map(path => ({ url: `${SITE_URL}${path}` }));
}
