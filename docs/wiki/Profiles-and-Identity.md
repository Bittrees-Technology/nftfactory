# Profiles and Identity

## Overview

NFTFactory treats creator identity as a product-level layer built on top of on-chain wallets, creator collections, and ENS-linked names.

## Routes

| Route | Role |
|-------|------|
| `/profile` | Detects profiles linked to the connected wallet; auto-redirects or shows a selector |
| `/profile/setup` | Creator toolkit: link identity, set profile content, associate collections |
| `/profile/[name]` | Public creator page, resolved by slug or linked ENS name |

## Current identity modes

The product currently supports three identity modes:

| Mode | Example | Created by NFTFactory? |
|------|---------|------------------------|
| External ENS name | `artist.eth` | No — linked in app only |
| External ENS subname | `drops.artist.eth` | No — linked in app only |
| `nftfactory.eth` subname | `studio.nftfactory.eth` | Yes — via `SubnameRegistrar` on-chain |

Only the third mode is a native on-chain identity creation flow in the current build.

## `/profile/setup` route

This is the creator toolkit surface. It currently supports:

- selecting an existing profile linked to the active wallet
- linking an external ENS name or subname
- creating a new `nftfactory.eth` subname
- associating a creator collection
- editing public-facing profile content:
  - display name, tagline, bio
  - avatar URL, banner URL, featured media URL
  - accent color, external links

## `/profile/[name]` route

This is the public creator page. It currently renders:

- resolved identity and display name
- avatar and banner
- tagline and bio
- linked wallets
- featured media
- pinned collection
- collection wall
- storefront feed

## Data sources

Profile data should currently be sourced in this order:

1. **Indexer-backed profile registry**
2. **Indexer-backed owner collection lookup**
3. **Local cached state as fallback**

The browser should not scan the chain to discover profile state.

## Backend routes

- `GET /api/profiles?owner=<address>` — profile list for the connected owner
- `POST /api/profiles/link` — creates or updates a linked profile record
- `GET /api/profile/:name` — resolves the public profile by slug or linked name

## Near-future scope

- stronger creator-page presentation
- more embedded media options
- richer social and link sections
- better canonical profile selection when a wallet owns multiple profiles

## Related pages

- [ENS Integration](./ENS-Integration.md)
- [Architecture](./Architecture.md)
- [Contracts](./Contracts.md)
