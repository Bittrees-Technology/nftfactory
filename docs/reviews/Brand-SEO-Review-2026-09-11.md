# NFTFactory brand, SEO, and marketing review

## Scope and direction

Refresh the existing brand, retaining NFTFactory, URLs, navigation labels, creator customization, and wallet/mint flows. Taste Skill applied to marketing design, with existing native CSS retained. Dials: design variance 6, motion 2, density 3. The name suggests an independent creative workshop: paper-white surfaces, graphite typography, silver materiality, and the existing orange accent refined for contrast. No new paid service or frontend dependency.

## Audit before implementation

The homepage used cream backgrounds, a CSS placeholder image, three equal process columns, and generic publishing copy. Existing typography named IBM Plex Sans without loading it. Rounded buttons and surfaces had inconsistent radii. The root description referenced nftfactory.eth; most routes inherited the same title. No sitemap, robots file, or social sharing image was present. Protection already sends noindex headers and must remain. No Search Console, traffic, or ranking data was available; this is a source and UX review, not a measured ranking report.

Preserve: Create / Explore / Marketplace / My studio navigation, semantic links, skip link, wallet confirmation, existing profile themes, storage disclosures. Retire: placeholder artwork, decorative gradients on shared surfaces, repeated generic cards, vague ownership claims.

## Implemented priorities

1. Merge the tested expansion work before refreshing presentation. PR #24 merged without conflicts; Vercel automatic deployment remains disabled.
2. Lead with the creator outcome and clear Create / Explore choices. Follow with a sequential process, studio customization/import, marketplace discovery, and publishing facts. No invented sales, audience counts, testimonials, or mainnet availability claims.
3. Use original conceptual brand artwork, readable system typography, a restrained radius scale, and consistent orange/graphite controls. The landing page supports the system dark preference; creator-selected themes retain their own palettes.
4. Add descriptive page titles, canonical URLs, social sharing metadata, private-workspace noindex, and a public-guide sitemap. Indexing requires an explicit launch opt-in, never overrides authentication, and stays off in previews. Do not include private workspaces or unverified dynamic assets in the sitemap.

## Launch and marketing recommendations, in order

1. Complete the existing contract/runtime and live-wallet acceptance gates before publishing this revision. No deployment or Acer update is part of this refresh.
2. After launch approval, remove site protection and set `SITE_SEARCH_INDEXING_ENABLED=true` and rebuild only for the public production site. Verify robots, canonical host redirects, and sitemap on nftfactory.org; submit the sitemap through the owner's Google Search Console account. Default is noindex even without a password.
3. Add server-rendered, verified artwork/profile descriptions and individual sharing images before expanding the sitemap to creator content. Avoid indexing thin, missing, or unverified records. Current detail pages remain outside this sitemap.
4. Publish a real creator walkthrough: upload, preview, wallet confirmation, profile customization, collection import. Explain fees and storage without implying guaranteed permanence or copyright transfer.
5. Invite a small group of artists to publish real work, with consent for editorial features. Promote their own collection links through owned channels; no paid campaign is needed at launch.
6. Once consent and privacy choices are settled, measure Create clicks, preview completion, successful mints, import completion, and profile publication. Establish a baseline before changing the funnel. Do not treat wallet connections as completed sales.
7. Revisit private offsite database backups after launch as previously agreed; no new subscription was introduced.

## Sources and limits

- [Taste Skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md), read as design guidance; not installed globally.
- [Google title links](https://developers.google.com/search/docs/appearance/title-link) and [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).
- Original AI-generated Factory study artwork is conceptual brand imagery, not a listed NFT or a product screenshot.
- Search visibility, field Core Web Vitals, and conversion uplift require post-launch measurement. No ranking or revenue improvement is claimed.

## Validation

- Local web type check and 242 tests pass, including launch opt-in, protected/preview noindex, private workspace exclusions, and curated sitemap checks.
- Production build passes. Existing viem dynamic-import and WalletConnect build-time initialization warnings remain; this change adds no dependency.
- Browser review: desktop 1280 px and mobile 390 px homepage, light and dark palettes, Create, creator setup, Explore, and marketplace entry pages. No mobile horizontal overflow. Both homepage actions are visible in the first mobile viewport.
- The light palette was inspected using a temporary local media-rule override, restored before commit. Midnight creator preview verified separately after correcting a shared background override; its original dark background and light text remain.
- Local HTTP checks: 13 public/workspace/guide/metadata routes return 200, unique titles and appropriate canonical paths are present, and default noindex / blocked robots / empty sitemap remain.
- These are presentation and indexing checks, not a new live mint or purchase acceptance run. Existing release gates remain in Release-Acceptance.md.
- GitHub CI must pass before merging this refresh; no production deployment is triggered.
