import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getIpfsStorageConfig,
  IpfsStorageClient,
  publishJsonArtifact,
} from "../../ipfs-evm-system/src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function main() {
  const inputPath = process.argv[2];
  const artifactKind = process.argv[3] ?? "nft-metadata-json";

  if (!inputPath) {
    console.error("usage: node scripts/publish-metadata-json.mjs <metadata-json-path> [artifact-kind]");
    process.exitCode = 1;
    return;
  }

  const absolutePath = path.resolve(rootDir, inputPath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw);

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

  const result = await publishJsonArtifact(client, {
    project: "nftfactory",
    artifactKind,
    data: parsed,
    fileName: path.basename(absolutePath),
    extraMetadata: {
      nftName: String(parsed.name ?? "untitled-nft"),
      nftExternalUrl: typeof parsed.external_url === "string" ? parsed.external_url : undefined,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

await main();
