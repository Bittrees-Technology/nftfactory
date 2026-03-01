# Testing And Validation

## Purpose

This page is the practical validation checklist for the current build.

It is intended to align the docs with how NFTFactory should actually be verified today:

- contracts
- web app
- indexer
- chain wiring
- Sepolia product flows

## Contract validation

Run the core contract checks first:

```bash
cd packages/contracts
forge build
forge test -q
```

Use this before reasoning about deployment quality or frontend behavior.

## Deployment validation

For a deployed network, verify:

- code exists at each deployed address
- key owners and pointers match expectations
- factory and registrar wiring is correct

Typical checks:

```bash
cast code <address> --rpc-url "$SEPOLIA_RPC_URL"
cast call <address> "owner()(address)" --rpc-url "$SEPOLIA_RPC_URL"
```

For current validated Sepolia addresses, see [Contracts](./Contracts.md).

## Web validation

The current web release gates are:

```bash
npm run typecheck:web
npm run build:web
```

Then verify the core product paths manually:

- mint and publish
- collection management
- profile setup
- public profile rendering
- listing and discovery
- admin and moderation

## Indexer validation

Validate the indexer separately:

```bash
npm run typecheck:indexer
```

Then confirm:

- the service starts
- `/health` responds
- profile and collection lookup routes behave as expected
- moderation endpoints behave as expected

If Prisma is unavailable locally, confirm the degraded startup mode still supports the expected local testing path.

## Environment validation

Before testing flows, confirm:

- web and indexer are pointed at the same chain
- contract addresses match the intended deployment set
- wallet and IPFS env vars are present
- the configured chain matches what the UI expects

Most “the app is broken” issues in the current build are environment mismatches, not logic defects.

## Manual Sepolia flow matrix

Use this as the current end-to-end acceptance path:

1. connect wallet on Sepolia
2. publish via shared mint
3. deploy or select a creator collection
4. mint into the creator collection
5. create or link a creator profile
6. open the public profile route
7. create a listing
8. verify discovery
9. submit and review a moderation action

## Current best practice

The intended validation rhythm is:

1. local iteration
2. local checks
3. Sepolia smoke tests
4. ownership and deployment verification
5. only then consider mainnet

## Related pages

- [Deployment and Launch](./Deployment-and-Launch.md)
- [Contracts](./Contracts.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
