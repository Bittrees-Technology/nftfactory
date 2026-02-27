# ENSv2 Forward Compatibility (Sepolia + Mainnet)

Updated: 2026-02-27 UTC

## Why this matters
- ENSv2 is now live on Sepolia.
- ENS docs call out that ENS integrations should use a modern `viem` version (`>= 2.35.0`) for ENSv2 support.

## Current status in this repo
- Web app uses `viem ^2.46.2` and `wagmi ^2.19.5` (compatible baseline).
- Indexer dependency was upgraded to `viem ^2.46.2` to remove version skew.
- Profile identity currently uses indexer-backed mapping (`ensSubname`) and does not hardcode ENS contract addresses.
- This architecture is resilient to ENS contract-address changes because resolution is not tied to fixed registry/resolver addresses in app/indexer code.

## Remaining operational requirement
- Ensure your environment uses valid RPC endpoints for:
  - mainnet ENS checks (`MAINNET_RPC_URL`)
  - sepolia ENS checks (`SEPOLIA_RPC_URL` or `RPC_URL`)

## Verification command
```bash
cd /home/robert/nftfactory
MAINNET_RPC_URL="https://..." SEPOLIA_RPC_URL="https://..." npm run check:ensv2
```

What this verifies:
- Universal resolver path check: `ur.gtest.eth`
- CCIP-read path check: `test.offchaindemo.eth`
- Sepolia ENS sanity read: `nick.eth`

## Go / No-Go
- `GO` if `npm run check:ensv2` passes all non-skipped checks.
- `NO-GO` if universal resolver or CCIP-read checks fail under your intended production RPC providers.

## References
- ENSv2 on Sepolia announcement and app-alpha context: https://ens.domains/blog/post/ensv2-testnet-launch
- ENS integration guidance (`viem >= 2.35.0`, test names): https://docs.ens.domains/web/ensv2/overview

