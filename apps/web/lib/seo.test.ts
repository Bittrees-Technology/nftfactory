import { afterEach, describe, expect, it, vi } from 'vitest';
import { canIndexSite, pageMetadata } from './seo';
import robots from '../app/robots';
import sitemap from '../app/sitemap';

afterEach(() => vi.unstubAllEnvs());
describe('search launch boundary', () => {
  it('requires explicit opt-in and never indexes preview or protected sites', () => {
    expect(canIndexSite({})).toBe(false);
    expect(canIndexSite({ SITE_SEARCH_INDEXING_ENABLED: 'true', VERCEL_ENV: 'production' })).toBe(true);
    for (const extra of [{ VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { SITE_BASIC_AUTH_PASSWORD: 'test' }, { SITE_BASIC_AUTH_ENABLED: 'true' }]) {
      expect(canIndexSite({ SITE_SEARCH_INDEXING_ENABLED: 'true', ...extra })).toBe(false);
    }
  });
  it('keeps private studio pages out of search after public launch', () => {
    vi.stubEnv('SITE_SEARCH_INDEXING_ENABLED', 'true');
    vi.stubEnv('SITE_BASIC_AUTH_ENABLED', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(pageMetadata('Studio', 'Private workspace', '/profile', true).robots).toEqual({ index: false, follow: false });
    expect(pageMetadata('Explore', 'Artwork', '/discover').alternates?.canonical).toBe('https://nftfactory.org/discover');
  });
  it('does not expose a sitemap while indexing is disabled', async () => {
    vi.stubEnv('SITE_SEARCH_INDEXING_ENABLED', 'false');
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(await sitemap()).toEqual([]);
  });
  it('includes only curated public routes once enabled', async () => {
    vi.stubEnv('SITE_SEARCH_INDEXING_ENABLED', 'true');
    vi.stubEnv('SITE_BASIC_AUTH_ENABLED', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toContain('https://nftfactory.org/marketplace');
    expect(urls).toContain('https://nftfactory.org/wiki/storage');
    expect(urls.some(url => /\/(profile|mint|api)\b/.test(url))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
