import { mkdir, writeFile } from "node:fs/promises";
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

function printUsage() {
  console.error(
    [
      "usage: node scripts/publish-profile-snapshot.mjs <profile-name> [options]",
      "",
      "Options:",
      "  --source <url>               Base URL of the web app exposing /api/profile/view/:name",
      "  --out <path>                 Write snapshot JSON to a file before publishing",
      "  --limit <number>             Listing/offer scan limit to forward to the profile view route",
      "  --seller <address>           Optional seller override forwarded to the profile view route",
      "  --basic-auth-user <name>     Optional Basic Auth username for protected deployments",
      "  --basic-auth-password <pw>   Optional Basic Auth password for protected deployments",
      "  --artifact-kind <kind>       Override artifact kind (default: nftfactory-profile-snapshot)",
      "  --skip-publish               Only export the JSON locally; do not publish to IPFS",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const profileName = args[0];
  if (!profileName || profileName.startsWith("-")) {
    printUsage();
    process.exitCode = 1;
    return null;
  }

  const options = {
    sourceBaseUrl:
      process.env.PROFILE_SNAPSHOT_SOURCE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "",
    outPath: "",
    seller: "",
    limit: "",
    basicAuthUser:
      process.env.PROFILE_SNAPSHOT_BASIC_AUTH_USERNAME ||
      process.env.SITE_BASIC_AUTH_USERNAME ||
      "",
    basicAuthPassword:
      process.env.PROFILE_SNAPSHOT_BASIC_AUTH_PASSWORD ||
      process.env.SITE_BASIC_AUTH_PASSWORD ||
      "",
    artifactKind: "nftfactory-profile-snapshot",
    skipPublish: false,
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--skip-publish") {
      options.skipPublish = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      console.error(`Missing value for ${arg}`);
      process.exitCode = 1;
      return null;
    }
    if (arg === "--source") {
      options.sourceBaseUrl = value;
    } else if (arg === "--out") {
      options.outPath = value;
    } else if (arg === "--seller") {
      options.seller = value;
    } else if (arg === "--limit") {
      options.limit = value;
    } else if (arg === "--basic-auth-user") {
      options.basicAuthUser = value;
    } else if (arg === "--basic-auth-password") {
      options.basicAuthPassword = value;
    } else if (arg === "--artifact-kind") {
      options.artifactKind = value;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exitCode = 1;
      return null;
    }
    index += 1;
  }

  return { profileName, options };
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error(
      "Missing source base URL. Set PROFILE_SNAPSHOT_SOURCE_URL or pass --source with the public web origin, for example https://nftfactory.org"
    );
  }
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Profile snapshot source URL must use http or https.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function buildBasicAuthHeader(username, password) {
  const normalizedPassword = String(password || "");
  if (!normalizedPassword) {
    return undefined;
  }
  const normalizedUsername = String(username || "viewer");
  return `Basic ${Buffer.from(`${normalizedUsername}:${normalizedPassword}`).toString("base64")}`;
}

async function fetchProfileViewSnapshot({ profileName, sourceBaseUrl, seller, limit, basicAuthUser, basicAuthPassword }) {
  const params = new URLSearchParams();
  if (String(seller || "").trim()) {
    params.set("seller", String(seller).trim());
  }
  if (String(limit || "").trim()) {
    params.set("limit", String(limit).trim());
  }

  const baseUrl = normalizeBaseUrl(sourceBaseUrl);
  const url = `${baseUrl}/api/profile/view/${encodeURIComponent(profileName)}${params.size ? `?${params.toString()}` : ""}`;
  const authorization = buildBasicAuthHeader(basicAuthUser, basicAuthPassword);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) {
      throw new Error(
        `Profile snapshot fetch was denied by site authentication. Pass --basic-auth-user/--basic-auth-password or set PROFILE_SNAPSHOT_BASIC_AUTH_USERNAME and PROFILE_SNAPSHOT_BASIC_AUTH_PASSWORD.`
      );
    }
    throw new Error(text || `Profile snapshot fetch failed (${response.status})`);
  }

  const profileView = await response.json();
  return {
    profileName,
    sourceUrl: url,
    generatedAt: new Date().toISOString(),
    profileView,
  };
}

async function writeSnapshotFile(outPath, snapshot) {
  const absolutePath = path.resolve(rootDir, outPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return absolutePath;
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    return;
  }

  const { profileName, options } = parsed;
  const snapshot = await fetchProfileViewSnapshot({
    profileName,
    sourceBaseUrl: options.sourceBaseUrl,
    seller: options.seller,
    limit: options.limit,
    basicAuthUser: options.basicAuthUser,
    basicAuthPassword: options.basicAuthPassword,
  });

  const resolvedOutPath = options.outPath
    ? await writeSnapshotFile(options.outPath, snapshot)
    : await writeSnapshotFile(`artifacts/profile-snapshots/${profileName}.json`, snapshot);

  if (options.skipPublish) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          published: false,
          outputPath: resolvedOutPath,
          snapshot,
        },
        null,
        2
      )
    );
    return;
  }

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
    artifactKind: options.artifactKind,
    data: snapshot,
    fileName: `${profileName}.profile.snapshot.json`,
    extraMetadata: {
      profileName,
      profileSourceUrl: snapshot.sourceUrl,
      profileGeneratedAt: snapshot.generatedAt,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        published: true,
        outputPath: resolvedOutPath,
        snapshot,
        publishResult: result,
      },
      null,
      2
    )
  );
}

await main();
