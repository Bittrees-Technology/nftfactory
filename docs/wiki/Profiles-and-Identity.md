# Profiles and Identity

## Overview

NFTFactory treats creator identity as a product-level layer built on top of on-chain wallets, creator collections, and ENS-linked names.

## Routes

| Route | Role |
|-------|------|
| `/profile` | Resolves one primary profile for the connected wallet, or routes the user into setup |
| `/profile/setup` | Identity setup: register `.eth`, link ENS, or create an `nftfactory.eth` subname |
| `/profile/[name]` | Public creator page, resolved by slug or linked ENS name |

## Current identity modes

The product currently supports four identity modes:

| Mode | Example | Created by NFTFactory? |
|------|---------|------------------------|
| Fresh `.eth` registration | `artist.eth` | No — executed through the ENS controller, then linked into NFTFactory |
| External ENS name | `artist.eth` | No — linked in app only |
| External ENS subname | `drops.artist.eth` | No — linked in app only |
| `nftfactory.eth` subname | `studio.nftfactory.eth` | Yes — via `SubnameRegistrar` on-chain |

Only the `nftfactory.eth` subname mode is a native NFTFactory-owned identity creation flow in the current build. Fresh `.eth` registration now uses the ENS controller commit/register flow directly when the controller address is configured, then links the resulting ENS name into NFTFactory after registration succeeds.

## `/profile/setup` route

This is the identity setup surface. It currently supports:

- checking `.eth` name availability and rent pricing through the ENS controller
- running the ENS controller commit/register flow for fresh `.eth` names
- linking an external ENS name or subname
- creating a new `nftfactory.eth` subname
- associating a creator collection

Public-facing profile content is edited on the public profile page itself, not in setup.

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
