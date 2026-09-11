import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

const digest = (value) => createHash("sha256").update(value).digest();
const addOptions = {
  pin: ["true"],
  "cid-version": ["1"],
  "wrap-with-directory": ["false", "true"],
  progress: ["false"],
  "stream-channels": ["false"],
  quieter: ["true", "false"]
};

function reply(response, status, message) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", Connection: "close" });
  response.end(JSON.stringify({ error: message }));
}

export function createIpfsGateway({ token, upstream = "http://127.0.0.1:5001", maxBytes = 32 * 1024 * 1024, concurrency = 2, timeoutMs = 60_000 } = {}) {
  if (typeof token !== "string" || token.length < 32 || /\s/.test(token)) throw new Error("Gateway token must contain at least 32 non-whitespace characters.");
  const base = new URL(upstream);
  if (base.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(base.hostname) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Kubo upstream must be an HTTP loopback origin, without credentials or a path.");
  }
  for (const value of [maxBytes, concurrency, timeoutMs]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Gateway limits must be positive integers.");
  }
  const expected = digest(`Bearer ${token}`);
  let active = 0;
  const server = http.createServer(async (request, response) => {
    if (!timingSafeEqual(digest(request.headers.authorization || ""), expected)) return reply(response, 401, "Unauthorized.");
    // Match the raw path so encoded or normalized paths never broaden the RPC allowlist.
    const [pathname, query = ""] = (request.url || "").split("?");
    if (!["/api/v0/add", "/api/v0/version"].includes(pathname)) return reply(response, 404, "Not found.");
    if (request.method !== "POST") return reply(response, 405, "POST required.");
    const params = new URLSearchParams(query);
    const seen = new Set();
    for (const [key, value] of params) {
      if (pathname !== "/api/v0/add" || seen.has(key) || !Object.hasOwn(addOptions, key) || !addOptions[key].includes(value)) return reply(response, 400, "Unsupported query option.");
      seen.add(key);
    }
    if (request.headers["content-encoding"]) return reply(response, 415, "Encoded request bodies are not supported.");
    const contentType = request.headers["content-type"] || "";
    if (pathname === "/api/v0/add" && !/^multipart\/form-data\s*;\s*boundary=.+/i.test(contentType)) return reply(response, 415, "Multipart file body required.");
    const limit = pathname === "/api/v0/version" ? 0 : maxBytes;
    if (Number(request.headers["content-length"] || 0) > limit) return reply(response, 413, "Request too large.");
    if (active >= concurrency) return reply(response, 429, "Upload capacity reached. Retry later.");
    active += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      if (!request.complete) request.destroy();
    }, timeoutMs);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) { reply(response, 413, "Request too large."); return; }
        chunks.push(chunk);
      }
      const target = new URL(pathname, base);
      if (pathname === "/api/v0/add") {
        for (const [key, values] of Object.entries(addOptions)) target.searchParams.set(key, params.get(key) || values[0]);
      }
      const result = await fetch(target, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: pathname === "/api/v0/add" ? { "Content-Type": contentType } : {},
        body: pathname === "/api/v0/add" ? Buffer.concat(chunks) : undefined
      });
      // Never forward upstream headers, credentials, HTML, or internal error details.
      if (!result.ok) { await result.body?.cancel(); reply(response, 502, "IPFS operation failed."); return; }
      const output = [];
      let outputSize = 0;
      for await (const chunk of result.body) {
        outputSize += chunk.length;
        if (outputSize > 1024 * 1024) throw new Error("Response too large.");
        output.push(chunk);
      }
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(Buffer.concat(output));
    } catch {
      if (!response.destroyed) reply(response, controller.signal.aborted ? 504 : 502, "IPFS backend unavailable.");
    } finally {
      clearTimeout(timer);
      active -= 1;
    }
  });
  server.requestTimeout = timeoutMs;
  server.headersTimeout = Math.min(timeoutMs, 15_000);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createIpfsGateway({ token: process.env.IPFS_API_BEARER_TOKEN, upstream: process.env.KUBO_API_ORIGIN });
  const port = Number(process.env.IPFS_APP_GATEWAY_PORT || 8788);
  server.listen(port, "127.0.0.1", () => console.log(`NFTFactory IPFS application gateway listening on loopback port ${port}.`));
}
