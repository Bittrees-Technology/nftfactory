# Profiles and Identity

## Overview

NFTFactory treats creator identity as a product layer built on top of wallets, creator collections, and ENS-linked names.

The key distinction is:

- some identities are created on-chain by NFTFactory
- others are linked in the app and indexed as metadata

## Routes

| Route | Role |
|-------|------|
| `/profile` | Resolves a primary profile for the connected wallet or routes into setup |
| `/profile/setup` | Register `.eth`, link existing ENS, or create `nftfactory.eth` identity |
| `/profile/[name]` | Public creator page resolved by slug or linked identity |

## Current identity modes

Supported identity modes:

| Mode | Example | Created by NFTFactory? |
|------|---------|------------------------|
| Fresh `.eth` registration | `artist.eth` | No. The app drives the ENS controller flow, then links the result |
| Existing ENS name | `artist.eth` | No. Linked in app only |
| Existing ENS subname | `drops.artist.eth` | No. Linked in app only |
| `nftfactory.eth` subname | `studio.nftfactory.eth` | Yes. Created on-chain via `SubnameRegistrar` |

Only the `nftfactory.eth` subname mode is a native NFTFactory contract-owned identity creation path.

## `/profile/setup`

This route supports:

- checking `.eth` availability and estimated pricing through the ENS controller
- running the `.eth` commit/register flow when the controller env is configured
- linking an existing ENS name
- linking an existing ENS subname
- creating a new `nftfactory.eth` subname
- associating a collection with the profile

It does not create external ENS subnames on-chain.

## `/profile/[name]`

The public creator page renders:

- resolved identity
- display name
- avatar and banner
- tagline and bio
- links
- featured media
- a pinned collection when available
- a creator collection wall
- a storefront feed based on indexed data
- optional Myspace-style profile customization with blurbs, Top Friends, testimonials, a profile song, structured custom boxes, a status headline, sidebar facts, structured media embeds, retro stamps, a guestbook with owner moderation, plus sandboxed custom HTML/CSS modules

## Data sources

Profile data is sourced in this order:

1. indexer-backed profile registry
2. indexer-backed owner collection lookup
3. local cache only as a fallback

The browser should not chain-scan to discover profile state.

## IPFS snapshot path

The live profile page remains indexer-backed, but the repo now supports publishing a static profile snapshot JSON through the shared IPFS project tooling. The snapshot source is the public web route `/api/profile/view/:name`, which already composes the indexer-backed public profile view.

Example:

- `npm run ipfs:publish:profile-snapshot -- demo --source https://nftfactory.org --basic-auth-user viewer --basic-auth-password <password> --skip-publish`
- `npm run ipfs:publish:profile-snapshot -- demo --source https://nftfactory.org --basic-auth-user viewer --basic-auth-password <password>`

This gives the project a portable, publishable profile artifact without trying to use IPFS as the live indexer backend.

For frontend fallback, set either `NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE` with a `{name}` placeholder or `NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL` that maps profile names to published snapshot URLs.

## Backend routes

- `GET /api/profiles?owner=<address>`
- `POST /api/profiles/link`
- `POST /api/profiles/transfer`
- `GET /api/profile/:name`

## Current status

The profile system is functional. Ongoing work includes:

- better canonical-profile selection for wallets with multiple identities
- clearer ownership validation for linked identities
- cleaner public presentation with less diagnostic copy
- richer creator customization controls, starting with Myspace-style layout mode, blurbs, Top Friends, testimonials, a profile song, structured custom boxes, a guestbook, and sandboxed HTML/CSS modules

## Related pages

- [ENS Integration](./ENS-Integration.md)
- [Architecture](./Architecture.md)
- [Contracts](./Contracts.md)
