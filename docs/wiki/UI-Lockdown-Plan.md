# UI Lockdown Plan

## Purpose

This page tracks page-level work that must be completed before mainnet. It is narrower than the roadmap: the roadmap covers overall direction, this page covers concrete lock criteria and completion status for each surface.

## Mainnet-critical pages

1. Mint
2. List
3. Discover
4. Profile

## Lock criteria

A page is considered locked when:

- the route purpose is obvious from first load
- the primary action is clear and not duplicated
- copy matches the actual contract and backend behavior
- empty states are informative
- loading states are predictable
- failure states are actionable
- the page behaves coherently on mobile and desktop
- the page degrades cleanly when the indexer or wallet is unavailable

## Mint

- [x] unified mint and publish flow
- [x] shared and creator collection mint paths inside one route
- [x] clearer separation between collection contract data and NFT metadata
- [x] upload, metadata, and receipts treated as one publish sequence
- [ ] tighten remaining copy and spacing so the route reads as one polished sequence
- [ ] finish final empty, loading, and retry behavior for slow Sepolia confirmations

## List

- [x] seller and marketplace actions split more clearly than the original mixed flow
- [x] wrong-network messaging aligned to the configured chain
- [x] clearer empty states when listings are absent
- [ ] tighten the seller action hierarchy so create, refresh, and manage feel less tool-like
- [ ] make the page read more like one guided selling workflow and less like stacked controls

## Discover

- [x] public mint feed split from moderation tooling
- [x] newest-first continuous feed model
- [x] feed-card presentation instead of utility rows
- [ ] improve visual rhythm so the feed feels more editorial and less operational
- [ ] make backend-unavailable vs no-indexed-mints states more explicit to users
- [ ] refine filters so they feel more intentional and less configuration-heavy

## Profile

- [x] setup route separated from the public profile route
- [x] ENS-linked identity model documented in the product
- [x] public creator page supports richer presentation fields
- [ ] continue tightening the public profile layout into a more intentional creator homepage
- [ ] reduce remaining diagnostic language on public-facing profile sections
- [ ] finalize profile setup ergonomics for multi-profile wallets

## Release sequence

1. finish route-level UI polish for Mint, List, Discover, and Profile
2. run the full Sepolia validation pass
3. confirm Safe ownership and operational controls
4. freeze the release candidate
5. deploy to mainnet

## Related pages

- [Home](./Home.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
- [Roadmap](./Roadmap.md)
