#!/usr/bin/env node

function printSection(title, lines) {
  console.log(`## ${title}`);
  for (const line of lines) {
    console.log(line);
  }
  console.log("");
}

const webEnv = [
  "NEXT_PUBLIC_PRIMARY_CHAIN_ID=1",
  "NEXT_PUBLIC_ENABLED_CHAIN_IDS=1",
  "NEXT_PUBLIC_RPC_URL_1=",
  "NEXT_PUBLIC_INDEXER_API_URL_1=",
  "NEXT_PUBLIC_REGISTRY_ADDRESS_1=",
  "NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_1=",
  "NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_1=",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS_1=",
  "NEXT_PUBLIC_SHARED_721_ADDRESS_1=",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS_1=",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_1=",
  "NEXT_PUBLIC_FACTORY_ADDRESS_1="
];

const indexerEnv = [
  "CHAIN_ID=1",
  "RPC_URL=",
  "RPC_URLS=",
  "REGISTRY_ADDRESS=",
  "MARKETPLACE_ADDRESS=",
  "MODERATOR_REGISTRY_ADDRESS="
];

const sharedEnv = [
  "TREASURY_SAFE=",
  "PRIVATE_KEY=",
  "ETHERSCAN_API_KEY=",
  "IPFS_API_URL=",
  "IPFS_API_BEARER_TOKEN=",
  "IPFS_API_BASIC_AUTH_USERNAME=",
  "IPFS_API_BASIC_AUTH_PASSWORD=",
  "ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=",
  "PAYMENT_TOKEN_ALLOWLIST=",
  "MODERATOR_ADDRESSES=",
  "OWNABLE_ADDRESSES="
];

console.log("# NFTFactory Mainnet Cutover");
console.log("");
console.log("Use this after the mainnet broadcast is complete and before calling the stack production-ready.");
console.log("");

printSection("Pre-broadcast checks", [
  "1. Export the intended root .env values except the deployed contract addresses.",
  "2. Run: npm run typecheck:web",
  "3. Run: npm run test:web",
  "4. Run: npm run typecheck:indexer",
  "5. Run: npm run test:indexer",
  "6. Run: FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge npm run test:contracts",
  "7. Confirm deployer balance, TREASURY_SAFE, PAYMENT_TOKEN_ALLOWLIST, and MODERATOR_ADDRESSES."
]);

printSection("Mainnet env block", [
  "# Web",
  ...webEnv,
  "",
  "# Indexer",
  ...indexerEnv,
  "",
  "# Shared",
  ...sharedEnv
]);

printSection("Mainnet broadcast", [
  "cd packages/contracts",
  "source ../../.env",
  "FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge ./script/run-forge.sh script script/Deploy.s.sol:DeployScript \\",
  "  --rpc-url \"$NEXT_PUBLIC_RPC_URL_1\" \\",
  "  --broadcast \\",
  "  --verify \\",
  "  --etherscan-api-key \"$ETHERSCAN_API_KEY\" \\",
  "  -vvv"
]);

printSection("Immediately record", [
  "- deploy commit SHA",
  "- broadcast timestamp",
  "- deploy tx hash",
  "- final gas used",
  "- final ETH spent",
  "- deployed addresses for registry, royalty split registry, moderator registry, subname registrar, shared721, shared1155, factory, marketplace"
]);

printSection("Post-deploy env fill", [
  "1. Paste the deployed addresses into the root .env.",
  "2. Set NEXT_PUBLIC_*_ADDRESS_1 for the web app.",
  "3. Set REGISTRY_ADDRESS, MARKETPLACE_ADDRESS, and MODERATOR_REGISTRY_ADDRESS for the indexer.",
  "4. Populate OWNABLE_ADDRESSES with the protocol-owned contracts.",
  "5. Re-export the env with: set -a && source .env && set +a"
]);

printSection("Post-deploy commands", [
  "npm run check:web-env",
  "npm run build:web",
  "npm run check:deployments",
  "npm run check:release"
]);

printSection("Follow-up contract actions", [
  "cd packages/contracts",
  "source ../../.env",
  "./script/VerifyCreatorImplementations.sh 1",
  "",
  "# optional moderator seed",
  "FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge ./script/run-forge.sh script script/SeedModerators.s.sol:SeedModeratorsScript --rpc-url \"$NEXT_PUBLIC_RPC_URL_1\" --broadcast -vvv",
  "",
  "# ownership transfer to Safe",
  "FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge ./script/run-forge.sh script script/PostDeployTransferToSafe.s.sol:PostDeployTransferToSafeScript --rpc-url \"$NEXT_PUBLIC_RPC_URL_1\" --broadcast -vvv"
]);

printSection("Production validation", [
  "1. Check https://nftfactory.org/api/deploy/health",
  "2. Validate /, /mint, /profile, /profile/setup, /profile/[name], and /profile/moderation if moderation is in scope",
  "3. Confirm IPFS upload, shared mint, creator collection deploy, collection verification, listing management, and profile resolution",
  "4. Confirm the live web app and live indexer use the same mainnet address set that passed the release gate",
  "5. Archive the final addresses, tx hashes, and owner posture in the deployment log"
]);
