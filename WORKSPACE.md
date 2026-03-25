# NFTFactory Workspace Note

## Workspace Role

This local project workspace contains the cloned `Bittrees-Technology/nftfactory` monorepo under `projects/` so the shared workspace can track implementation through a matching plan, design, and task board.

The repo already includes substantial application code across `apps/web`, `packages/contracts`, `services/indexer`, and `docs/wiki/`. The current workspace focus is release hardening of the existing Sepolia-first build rather than greenfield product design.

## Related Artifacts

- Plan: `plans/nftfactory.md`
- Design: `designs/nftfactory-design.md`
- Tasks: `tasks/nftfactory-tasks.md`

## Key Directories

- `apps/web`: Next.js product surface for mint, list, discover, profile, moderation, and admin flows
- `packages/contracts`: Foundry-based Solidity contracts, deploy scripts, and tests
- `services/indexer`: Prisma-backed indexing and moderation/admin APIs
- `docs/wiki`: architecture, roadmap, testing, deployment, and operational runbooks
- `scripts`: readiness and release helper scripts used by the monorepo
