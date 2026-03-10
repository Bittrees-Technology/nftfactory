# Infrastructure and Operations

## Monorepo layout

```text
nftfactory/
├── apps/
│   └── web/                 Next.js frontend
├── packages/
│   └── contracts/           Foundry contracts, scripts, tests
├── services/
│   └── indexer/             Node HTTP API + Prisma
├── docs/
│   └── wiki/                Wiki source (used by maintainers and the in-app /wiki route)
├── scripts/                 Project helpers
└── package.json             npm workspace root
```

## Service model

Service layout:

- **Web app**
  - Next.js 15
  - usually runs on port `3000`
- **Indexer**
  - Node HTTP API
  - code default: `127.0.0.1:8787`
  - current local env in this repo: port `8791`
- **Database**
  - PostgreSQL
  - local env points to `localhost:5432`
- **Chain**
  - primary proving chain is Ethereum Sepolia (`11155111`)

## Active app surfaces

Active user-facing routes:

- `/`
- `/mint`
- `/list`
- `/discover`
- `/profile`
- `/profile/setup`
- `/profile/[name]`
- `/mod`
- `/admin`
- `/wiki`

## Workspace scripts

Run these from the project root:

| Command | Purpose |
|------|---------|
| `npm install` | Sync workspace dependencies |
| `npm run dev:web` | Start the web app |
| `npm run dev:indexer` | Start the indexer |
| `npm run typecheck:web` | Typecheck the web app |
| `npm run build:web` | Build the web app |
| `npm run test:web` | Run web tests |
| `npm run typecheck:indexer` | Typecheck the indexer |
| `npm run test:indexer` | Run indexer tests |
| `npm run test:contracts` | Run contract tests |
| `npm run docs:contracts-deps` | Regenerate archived contract dependency output |

## Environment configuration

### Web app

The web app currently reads these keys:

- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_MARKETPLACE_ADDRESS`
- `NEXT_PUBLIC_SHARED_721_ADDRESS`
- `NEXT_PUBLIC_SHARED_1155_ADDRESS`
- `NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS`
- `NEXT_PUBLIC_FACTORY_ADDRESS`
- `NEXT_PUBLIC_INDEXER_API_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_IPFS_GATEWAY`
- `NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS` (optional)
- `NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS` (needed for the real `.eth` registration flow)
- `IPFS_API_URL` (server-side IPFS add endpoint for mint uploads)
- `IPFS_API_BEARER_TOKEN` or `IPFS_API_BASIC_AUTH_USERNAME` + `IPFS_API_BASIC_AUTH_PASSWORD` (optional server-side IPFS API auth)

Note: `apps/web/.env.example` is not a complete list of every variable the current app can use.

### Indexer

The indexer currently reads these keys:

- `DATABASE_URL`
- `RPC_URL`
- `CHAIN_ID`
- `INDEXER_HOST`
- `INDEXER_PORT`
- `INDEXER_ADMIN_TOKEN`
- `INDEXER_ADMIN_ALLOWLIST`
- `TRUST_PROXY`
- `REGISTRY_ADDRESS`
- `MARKETPLACE_ADDRESS`
- `MODERATOR_REGISTRY_ADDRESS`

Note: `services/indexer/.env.example` is also a minimal example, not a full mirror of the current local env.

## Manual startup

Use this sequence for local Sepolia-connected work:

```bash
npm install
```

Start the indexer:

```bash
cd services/indexer
INDEXER_HOST=0.0.0.0 INDEXER_PORT=8791 npm run dev
```

Or from the workspace root:

```bash
npm run dev:indexer
```

Start the web app:

```bash
npm --workspace apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

The current local `.env.local` in this repo uses a LAN URL for `NEXT_PUBLIC_INDEXER_API_URL`.

Use your machine's actual reachable host and port there. Do not copy another machine's private LAN IP literally.

## Process management

The practical process models are:

1. manual terminals
2. `pm2` for persistent local sessions

Useful `pm2` commands:

```bash
pm2 list
pm2 logs nftfactory-web
pm2 logs nftfactory-indexer
pm2 restart nftfactory-web
pm2 restart nftfactory-indexer
pm2 save
```

## Data flow

The intended precedence is:

1. blockchain for authoritative ownership and contract state
2. indexer for normal product reads
3. local browser cache as a short-lived UX fallback

Recent admin tooling reinforces this model:

- single-token sync
- listing sync
- collection token backfill
- full registry-driven collection backfill

## Troubleshooting

### `Failed to fetch` in the web app

Most often this means:

- `NEXT_PUBLIC_INDEXER_API_URL` points to a host the browser cannot reach
- the indexer is still bound to `127.0.0.1`
- the web app and indexer are not on the same port/host assumptions

Typical fix:

```bash
cd services/indexer
fuser -k 8791/tcp
INDEXER_HOST=0.0.0.0 INDEXER_PORT=8791 npm run dev
```

### Discover feed missing a fresh mint

Check:

- the mint transaction succeeded on-chain
- the token was synced into the indexer
- the collection is registered if you expect registry-driven discovery
- the relevant admin backfill/sync endpoint has been run if the index is behind

### Long-running admin jobs fail from the browser

The current build has explicit long-running backfill routes. If HTTP is still unreliable for a large recovery job, use the standalone indexer script path from `services/indexer/scripts` instead of keeping the browser request open.

## Related pages

- [Architecture](./Architecture.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Testing and Validation](./Testing-and-Validation.md)
