# Archive

The active documentation surface now has two mirrored trees:

- `docs/wiki` for maintainers
- `data/wiki` for the in-app rendered wiki

Everything under `docs/archive` should be treated as historical reference, not the current source of truth.

## Current archive layout

- `docs/archive/legacy-docs/`
  - former standalone docs that were absorbed into the wiki
- `docs/archive/generated/`
  - generated artifacts such as dependency-tree snapshots
- `docs/archive/*.md`
  - dated notes, progress records, and point-in-time historical documents

## What belongs here

Archive content includes:

- dated launch or status snapshots
- PR-specific descriptions
- release-note snapshots
- generated dependency outputs
- superseded standalone docs

## How to use it

Use the archive when you need:

- historical context
- old release framing
- point-in-time operational notes

Start with:

- [docs/archive/README.md](../archive/README.md)

Do not use archive pages as the primary source for current behavior. The current source of truth is the active wiki content in `docs/wiki` and its mirrored `data/wiki` copy.
