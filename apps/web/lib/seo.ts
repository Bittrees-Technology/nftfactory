import type { Metadata } from 'next';
import { resolveBasicAuthConfig } from './basicAuth';

export const SITE_URL = 'https://nftfactory.org';
export const SITE_DESCRIPTION = 'Create NFTs, build collections, and make a creator page your own. NFTFactory brings your artwork, identity, and marketplace together.';

// Indexing is an explicit launch step. Preview and protected deployments stay private.
export function canIndexSite(env: Record<string, string | undefined> = process.env): boolean {
  return env.SITE_SEARCH_INDEXING_ENABLED === 'true'
    && env.VERCEL_ENV !== 'preview'
    && env.VERCEL_ENV !== 'development'
    && !resolveBasicAuthConfig(env).enabled;
}

export function pageMetadata(title: string, description: string, path: string, privatePage = false): Metadata {
  const url = `${SITE_URL}${path}`;
  const index = !privatePage && canIndexSite();
  return {
    title: { absolute: `${title} | NFTFactory` }, description,
    alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: { type: 'website', siteName: 'NFTFactory', title: `${title} | NFTFactory`, description, url,
      images: [{ url: `${SITE_URL}/brand/factory-study.png`, width: 1536, height: 1024, alt: 'NFTFactory: a silver frame and an orange edition, conceptual brand artwork' }] },
    twitter: { card: 'summary_large_image', title: `${title} | NFTFactory`, description, images: [`${SITE_URL}/brand/factory-study.png`] }
  };
}
