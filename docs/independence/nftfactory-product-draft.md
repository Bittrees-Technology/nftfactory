# NFTFactory independence product draft

Status: draft for product review. This document supersedes the prior NFTFactory independence gate decision only as a bounded, product-specific proposal; it does not authorize merge, deployment, DNS/visibility changes, or an auth change.

## 1. User and value

NFTFactory serves creators who want to publish an NFT drop, present a creator identity, and operate collections from one product surface. The first value is a creator reaching a usable release workspace quickly while retaining a path to creator-owned collection control.

## 2. Scope and out of scope

In scope: the existing web app routes for minting, collection inspection/management, discovery, profile setup, profile moderation, indexed reads, and the associated indexer/IPFS runtime documented in this checkout.

Out of scope: legal drafting or claims, financial or marketplace guarantees, new chains, new governance, a rebrand, production cutover, DNS/visibility changes, auth weakening, and work in sibling repositories.

## 3. Onboarding and first value

The proposed first-run path is: connect a wallet → choose shared or creator-owned collection → upload media and metadata → publish a first token → open the creator/profile route. The current home surface already exposes “Start a drop,” “Deploy a Creator Collection,” and “Set Up Identity” as the primary creator routes. The draft does not claim that a live deployment or successful transaction is available.

## 4. Release status

Release status is **draft / not released**. Existing code and local tests provide implementation evidence; they are not a production launch approval. Release-readiness, runtime-health, public-route, IPFS, and chain checks remain operator gates and must be run with the target environment before any release decision.

## 5. Product-owned trust and support

Product-owned placeholders before release:

- Trust: name the accountable moderation owner, escalation route, abuse-report response target, and collection verification policy.
- Support: publish a creator-facing support entry point, incident/status route, and recovery guidance for failed uploads, indexing delays, and transaction failures.
- Evidence: attach owner-approved policy text and tested support contacts to the release packet.

No legal, safety, or service-level claims are made here. Until the placeholders have owners and evidence, trust/support readiness is a blocker to calling the product released.

## 6. Standalone entry and runtime

Standalone entry is the NFTFactory web app at its own configured web origin, with `/`, `/mint`, `/discover`, `/profile`, and `/profile/setup` as the product routes. Runtime dependencies are the repository's web app, indexer, configured RPC providers, and configured IPFS API/gateway; each is independently configured through this checkout's environment and operator runbooks. Authentication remains enabled wherever configured, including site basic auth and protected indexer/admin paths.

## 7. No sibling or Bittrees dependency

This draft does not require a sibling product, shared workspace, Bittrees service, Bittrees account, or cross-repository runtime to onboard a creator or render the core routes. Any current local workspace note or shared package reference is treated as implementation context to be removed or replaced before claiming a fully portable release; it is not a product dependency authorized by this draft.

## 8. Optional-only integration boundaries

ENS/nftfactory.eth identity links, external subnames, creator-owned contracts, optional marketplace/indexer extensions, and external notification or support tooling are optional integrations. The core product boundary is mint → indexed collection read → creator/profile presentation. Optional integrations must fail visibly and safely without making the core entry route or auth posture unavailable.

## Gate matrix

| Gate | Draft evidence | Decision / blocker |
| --- | --- | --- |
| User/value | Creator drop, identity, and collection operations are named | Product review required |
| Scope | In-scope routes and explicit exclusions above | Bounded for this draft |
| Onboarding/first value | Existing home CTA sequence and first-run path | Validate with a creator walkthrough |
| Release status | Explicit draft/not-released wording | Blocked from release claim |
| Trust/support | Product-owned owner, escalation, support, and evidence placeholders | Blocked until owners/evidence exist |
| Standalone runtime | Own web entry plus repo-configured web/indexer/IPFS/RPC runtime | Validate in target environment |
| No sibling dependency | Core path requires no sibling/Bittrees service | Audit remaining workspace/package references |
| Optional boundaries | ENS, subnames, custom contracts, and extensions marked optional | Define failure behavior in release QA |

## Evidence and safe validation

- UI evidence: `apps/web/app/page.tsx` contains the creator-first hero, “Start a drop,” “Deploy a Creator Collection,” “Set Up Identity,” and operator/support routes.
- Runtime/auth evidence: `apps/web/next.config.ts`, `apps/web/lib/basicAuth.ts`, `apps/web/.env.example`, and `README.md` document configured auth and protected runtime paths.
- Release evidence: `README.md` and `docs/wiki/Deployment-and-Launch.md` document environment, runtime, public-route, and release checks.
- Validation command: `node scripts/verify-independence-product-draft.mjs` checks this draft's required sections and UI route evidence without network calls or mutations.

## Proposed PR boundary

Branch: `draft/nftfactory-independence-product`.

This is a draft-only documentation/evidence change. No merge, deploy, DNS/visibility change, auth disablement, or legal drafting is included.
