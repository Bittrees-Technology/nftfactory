import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  buildIpfsAuthHeaders,
  buildIpfsVersionUrl,
  maskUrl,
  resolveIpfsApiUrls,
  sanitizeBackendErrorMessage
} from "./ipfsBackend.mjs";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function buildIpfsAddUrl(baseUrl, { wrapWithDirectory = false } = {}) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) throw new Error("IPFS_API_URL is required.");

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/api/v0/add")) url.pathname = pathname;
  else if (pathname.endsWith("/api/v0")) url.pathname = `${pathname}/add`;
  else url.pathname = `${pathname}/api/v0/add`;

  url.searchParams.set("pin", "true");
  url.searchParams.set("cid-version", "1");
  url.searchParams.set("wrap-with-directory", wrapWithDirectory ? "true" : "false");
  url.searchParams.set("progress", "false");
  url.searchParams.set("stream-channels", "false");
  return url.toString();
}

export function parseIpfsAddEntries(text) {
  const entries = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (entries.length === 0 || !String(entries.at(-1)?.Hash || "").trim()) {
    throw new Error("IPFS add response missing Hash.");
  }
  return entries;
}

export function buildGatewayUrl(gatewayBaseUrl, cid) {
  const base = normalizeBaseUrl(gatewayBaseUrl || "https://dweb.link").replace(/\/ipfs$/i, "");
  return `${base}/ipfs/${String(cid || "").trim()}`;
}

export function getIpfsStorageConfig(env = process.env) {
  const apiBaseUrls = resolveIpfsApiUrls(env);
  return {
    apiBaseUrls,
    apiBaseUrl: apiBaseUrls[0] || "",
    gatewayBaseUrl: normalizeBaseUrl(env.IPFS_GATEWAY_BASE_URL || env.NEXT_PUBLIC_IPFS_GATEWAY || "https://dweb.link"),
    authHeaders: buildIpfsAuthHeaders(env),
    defaultSourceProject: String(env.IPFS_DEFAULT_SOURCE_PROJECT || "").trim()
  };
}

async function collectFiles(rootPath, currentPath = rootPath) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(rootPath, absolutePath));
    else if (entry.isFile()) files.push({ absolutePath, relativePath: path.relative(rootPath, absolutePath) });
  }
  return files;
}

export class IpfsStorageClient {
  constructor(config = {}) {
    const resolved = getIpfsStorageConfig();
    this.apiBaseUrls = config.apiBaseUrls?.length
      ? config.apiBaseUrls
      : config.apiBaseUrl ? [config.apiBaseUrl] : resolved.apiBaseUrls;
    this.gatewayBaseUrl = config.gatewayBaseUrl || resolved.gatewayBaseUrl;
    this.authHeaders = config.authHeaders || resolved.authHeaders;
    this.defaultSourceProject = config.defaultSourceProject || resolved.defaultSourceProject;
  }

  async checkNodeHealth() {
    if (this.apiBaseUrls.length === 0) {
      return { available: false, error: "Missing IPFS_API_URL, IPFS_API_URLS, or IPFS_API_BASE_URL." };
    }

    let lastError = "IPFS node unavailable.";
    for (const baseUrl of this.apiBaseUrls) {
      try {
        const response = await fetch(buildIpfsVersionUrl(baseUrl), { method: "POST", headers: this.authHeaders, redirect: "error", signal: AbortSignal.timeout(8_000) });
        if (response.ok) return { available: true, apiBaseUrl: baseUrl };
        lastError = sanitizeBackendErrorMessage(
          await response.text(),
          `IPFS health check failed (HTTP ${response.status}).`
        );
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    return { available: false, error: lastError };
  }

  async addForm(form, { wrapWithDirectory = false } = {}) {
    let lastError = null;
    for (const baseUrl of this.apiBaseUrls) {
      const target = buildIpfsAddUrl(baseUrl, { wrapWithDirectory });
      try {
        const response = await fetch(target, { method: "POST", headers: this.authHeaders, body: form, redirect: "error", signal: AbortSignal.timeout(60_000) });
        const body = await response.text();
        if (!response.ok) {
          throw new Error(sanitizeBackendErrorMessage(body, `IPFS add failed (HTTP ${response.status}).`));
        }
        const entries = parseIpfsAddEntries(body);
        return { cid: String(entries.at(-1).Hash), entries, apiBaseUrl: maskUrl(baseUrl) };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError || new Error("IPFS add failed: no API endpoint is configured.");
  }

  async addBytes(bytes, fileName) {
    const form = new FormData();
    form.append("file", new Blob([bytes]), fileName);
    return this.addForm(form);
  }

  async addPath(inputPath) {
    const inputStat = await stat(inputPath);
    if (inputStat.isFile()) return this.addBytes(await readFile(inputPath), path.basename(inputPath));
    if (!inputStat.isDirectory()) throw new Error(`Unsupported IPFS artifact path: ${inputPath}`);

    const files = await collectFiles(inputPath);
    if (files.length === 0) throw new Error(`Cannot publish empty directory: ${inputPath}`);
    const form = new FormData();
    for (const file of files) {
      form.append("file", new Blob([await readFile(file.absolutePath)]), file.relativePath);
    }
    return this.addForm(form, { wrapWithDirectory: true });
  }
}

async function publishManifest(client, input) {
  const publishedAt = new Date().toISOString();
  const manifest = {
    schema: "nftfactory.ipfs-artifact.v1",
    project: input.project || client.defaultSourceProject || "nftfactory",
    artifactKind: input.artifactKind,
    fileName: input.fileName,
    contentCid: input.contentCid,
    contentUri: `ipfs://${input.contentCid}`,
    publishedAt,
    metadata: input.extraMetadata || {}
  };
  const manifestResult = await client.addBytes(
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    `${input.artifactKind || "artifact"}.manifest.json`
  );
  return {
    ...manifest,
    contentGatewayUrl: buildGatewayUrl(client.gatewayBaseUrl, input.contentCid),
    manifestCid: manifestResult.cid,
    manifestUri: `ipfs://${manifestResult.cid}`,
    manifestGatewayUrl: buildGatewayUrl(client.gatewayBaseUrl, manifestResult.cid)
  };
}

export async function publishJsonArtifact(client, input) {
  const bytes = Buffer.from(`${JSON.stringify(input.data, null, 2)}\n`, "utf8");
  const content = await client.addBytes(bytes, input.fileName || "artifact.json");
  return publishManifest(client, { ...input, contentCid: content.cid });
}

export async function publishProjectPath(client, input) {
  const content = await client.addPath(input.inputPath);
  return publishManifest(client, {
    ...input,
    fileName: path.basename(input.inputPath),
    contentCid: content.cid
  });
}
