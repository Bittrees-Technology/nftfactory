# Infrastructure and Operations

This page captures the practical local and hosted operating model for NFTFactory.

It is the live infrastructure reference for the current build, including:

- monorepo layout
- local service boundaries
- process management
- environment configuration
- manual startup and troubleshooting

This page should stay aligned with the active build, not historical one-off machine state.

## Monorepo layout

```text
nftfactory/
├── apps/
│   └── web/                 Next.js frontend
├── packages/
│   └── contracts/           Foundry contracts, scripts, tests
├── services/
│   └── indexer/             Node API + Prisma
├── docs/
│   └── wiki/                Source docs
├── data/
│   └── wiki/                In-app wiki source
├── scripts/                 Project helpers
└── package.json             npm workspace root
```

## Service model

The current active operating model is:

- **Web app**
  - Next.js 15
  - normally served on port `3000`
- **Indexer**
  - Node HTTP API
  - normally served on port `8791`
- **Database**
  - PostgreSQL
  - normally served on port `5432`
- **Chain**
  - primary proving environment is **Ethereum Sepolia** (`11155111`)
  - local Anvil remains optional for isolated local contract testing

## Active app surfaces

The infrastructure supports these user-facing flows:

- `/mint`
- `/list`
- `/discover`
- `/profile`
- `/profile/setup`
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
| `npm run typecheck:indexer` | Typecheck the indexer |
| `npm run test:web` | Run web tests |
| `npm run test:indexer` | Run indexer tests |

For contracts:

| Command | Purpose |
|------|---------|
| `forge build` | Compile contracts |
| `forge test -q` | Run contract tests |

## Environment configuration

### Web app

The web app expects `apps/web/.env.local` to provide:

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
- `NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS` (optional but recommended for wrapped ENS support)
- `NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS` (required for real `.eth` registration flow)
- `PINATA_JWT` (server-side web API route usage)

### Indexer

The indexer expects `services/indexer/.env` to provide:

- `DATABASE_URL`
- `RPC_URL`
- `CHAIN_ID`
- `INDEXER_HOST`
- `INDEXER_PORT`
- `INDEXER_ADMIN_TOKEN`
- `INDEXER_ADMIN_ALLOWLIST`
- `MODERATOR_REGISTRY_ADDRESS` (when using contract-backed moderator reads)

## Process management

The supported process models are:

1. Manual terminals
2. `pm2` for persistent local sessions

When using `pm2`, the important commands are:

```bash
pm2 list
pm2 logs nftfactory-web
pm2 logs nftfactory-indexer
pm2 restart nftfactory-web
pm2 restart nftfactory-indexer
pm2 save
```

## Manual startup

Use this sequence for local Sepolia-connected operation:

```bash
cd /home/robert/nftfactory
npm install
```

Start the indexer:

```bash
cd /home/robert/nftfactory/services/indexer
INDEXER_HOST=0.0.0.0 INDEXER_PORT=8791 npm run dev
```

Start the web app:

```bash
cd /home/robert/nftfactory
npm --workspace apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

Then open:

- `http://127.0.0.1:3000` locally
- `http://192.168.1.115:3000` on the LAN (when the machine IP matches that address)

## Data flow

The intended infrastructure data precedence is:

1. **Blockchain**
   - source of truth for ownership, mints, and contract state
2. **Indexer + Prisma**
   - primary application mirror of chain state
3. **Local browser cache**
   - short-lived UX fallback for immediate continuity

This means:

- contract actions should trust chain state
- normal discovery and app flows should prefer indexed data
- the UI can use targeted chain reads and local cache when the indexer is lagging

## Troubleshooting

### `Failed to fetch` in the web app

Most often this means:

- `NEXT_PUBLIC_INDEXER_API_URL` points to a host the browser cannot reach
- the indexer is only bound to `127.0.0.1` while the browser is calling a LAN IP

The fix is usually:

```bash
cd /home/robert/nftfactory/services/indexer
fuser -k 8791/tcp
INDEXER_HOST=0.0.0.0 INDEXER_PORT=8791 npm run dev
```

### Web app not visible on the network

Make sure Next is started with:

```bash
npm --workspace apps/web run dev -- --hostname 0.0.0.0 --port 3000
```

### Discover feed missing a fresh mint

The current system now has three visibility paths:

1. indexed feed data
2. local immediate post-mint cache
3. bounded direct-chain hydration for NFTFactory collections

If a mint still does not appear, verify:

- the mint transaction succeeded on-chain
- the collection was created through NFTFactory and therefore registered
- the web app was restarted after recent feed changes if needed

## Related docs

- [Architecture](./Architecture.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Testing and Validation](./Testing-and-Validation.md)
