# Profiles And Identity

## Overview

NFTFactory now treats creator identity as a product-level layer built on top of on-chain wallets, creator collections, and ENS-linked names.

The current profile system is split across three routes:

- `/profile`
  - selector and redirect surface
- `/profile/setup`
  - creator toolkit and identity setup
- `/profile/[name]`
  - public creator page

## Current identity modes

The product currently supports three identity modes:

1. **External ENS name**
   - example: `artist.eth`
   - linked in the app
   - not minted by NFTFactory
2. **External ENS subname**
   - example: `drops.artist.eth`
   - linked in the app
   - not minted by NFTFactory
3. **`nftfactory.eth` subname**
   - example: `studio.nftfactory.eth`
   - created on-chain through `SubnameRegistrar`

Only the third mode is a native on-chain identity creation flow in the current build.

## `/profile` route

`/profile` is not the setup page anymore.

Its current role is:

- detect profiles linked to the connected wallet
- auto-redirect if there is exactly one clear profile
- show a profile selector if there are multiple
- route users to setup if no profile exists yet

## `/profile/setup` route

This is the creator toolkit surface.

It currently supports:

- selecting an existing profile linked to the active wallet
- linking an external ENS name
- linking an external ENS subname
- creating a new `nftfactory.eth` subname
- associating a creator collection
- editing public-facing profile content:
  - display name
  - tagline
  - bio
  - avatar URL
  - banner URL
  - featured media URL
  - accent color
  - external links

## `/profile/[name]` route

This is the public creator page.

It currently renders:

- resolved identity and display name
- avatar and banner
- tagline and bio
- linked wallets
- featured media
- pinned collection
- collection wall
- storefront feed

The direction of travel is a more expressive, personal creator page rather than a plain storefront dashboard.

## Data sources

Profile data should currently be sourced in this order:

1. **Indexer-backed profile registry**
2. **Indexer-backed owner collection lookup**
3. **Local cached state as fallback**

The browser should not scan the chain to discover profile state.

## Current backend routes

- `GET /api/profiles?owner=<address>`
  - profile list for the connected owner
- `POST /api/profiles/link`
  - creates or updates a linked profile record
- `GET /api/profile/:name`
  - resolves the public profile route by slug or linked name

## Near-future scope

The profile system is expected to grow in these directions:

- stronger creator-page presentation
- more embedded media options
- richer social and link sections
- better canonical profile selection when a wallet owns multiple profiles

## Related pages

- [ENS Integration](./ENS-Integration.md)
- [Architecture](./Architecture.md)
- [Contracts](./Contracts.md)
