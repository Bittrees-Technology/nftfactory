import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getIpfsStorageConfig,
  IpfsStorageClient,
  publishProjectPath,
} from "../../ipfs-evm-system/src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function main() {
  const inputPath = process.argv[2];
  const artifactKind = process.argv[3] ?? "nftfactory-artifact";

  if (!inputPath) {
    console.error("usage: node scripts/publish-artifact.mjs <path> [artifact-kind]");
    process.exitCode = 1;
    return;
  }

  const absolutePath = path.resolve(rootDir, inputPath);
  const client = new IpfsStorageClient({
    ...getIpfsStorageConfig(),
    defaultSourceProject: "nftfactory",
  });

  const nodeHealth = await client.checkNodeHealth();
  if (!nodeHealth.available) {
    console.error("ipfs-node:unavailable");
    if (nodeHealth.error) {
      console.error(nodeHealth.error);
    }
    process.exitCode = 1;
    return;
  }

  const result = await publishProjectPath(client, {
    project: "nftfactory",
    inputPath: absolutePath,
    artifactKind,
    extraMetadata: {
      nftSurface: artifactKind,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

await main();
