import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createIpfsGateway } from "../../services/ipfs-gateway/server.mjs";
import { IpfsStorageClient } from "./ipfsPublisher.mjs";

const token = "test-only-" + "a".repeat(40);
const auth = { Authorization: `Bearer ${token}` };
async function listen(server, t) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test("gateway integrates with publisher, forces safe add options, and strips bearer before Kubo", async t => {
  const seen = [];
  const upstream = await listen(http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({ url: new URL(req.url, "http://localhost"), auth: req.headers.authorization, body });
    res.end(req.url === "/api/v0/version" ? '{"Version":"test"}' : '{"Name":"metadata.json","Hash":"bafytest"}\n');
  }), t);
  const endpoint = await listen(createIpfsGateway({ token, upstream }), t);
  const client = new IpfsStorageClient({ apiBaseUrl: endpoint, authHeaders: auth });
  assert.equal((await client.checkNodeHealth()).available, true);
  assert.equal((await client.addBytes(Buffer.from('{"name":"intentional public test"}'), "metadata.json")).cid, "bafytest");
  assert.equal(seen.length, 2);
  assert.equal(seen[1].auth, undefined);
  assert.equal(seen[1].url.searchParams.get("pin"), "true");
  assert.equal(seen[1].url.searchParams.get("cid-version"), "1");
  assert.match(seen[1].body, /intentional public test/);
});

test("gateway denies unauthenticated access, arbitrary RPC, unsafe queries, and oversized bodies", async t => {
  let calls = 0;
  const upstream = await listen(http.createServer((req, res) => { calls++; res.end("{}"); }), t);
  const endpoint = await listen(createIpfsGateway({ token, upstream, maxBytes: 32 }), t);
  const cases = [
    ["/api/v0/version", { method: "POST" }, 401],
    ["/api/v0/config", { method: "POST", headers: auth }, 404],
    ["/api/v0/shutdown", { method: "POST", headers: auth }, 404],
    ["/api/v0/version", { headers: auth }, 405],
    ["/api/v0/add?pin=false", { method: "POST", headers: auth }, 400],
    ["/api/v0/add?arg=/etc/passwd", { method: "POST", headers: auth }, 400],
    ["/api/v0/add?__proto__=x", { method: "POST", headers: auth }, 400],
    ["/api/v0/add?pin=true&pin=false", { method: "POST", headers: auth }, 400],
    ["/api/v0/version?arg=x", { method: "POST", headers: auth }, 400],
    ["/api/v0/add", { method: "POST", headers: auth, body: "text" }, 415],
    ["/api/v0/add", { method: "POST", headers: { ...auth, "Content-Type": "multipart/form-data; boundary=test" }, body: "x".repeat(33) }, 413]
  ];
  for (const [path, options, status] of cases) {
    const result = await fetch(endpoint + path, options);
    assert.equal(result.status, status, path);
    await result.text();
  }
  assert.equal(calls, 0);
});

test("gateway refuses upstream redirects and hides internal failures", async t => {
  let destinationCalls = 0;
  const destination = await listen(http.createServer((req, res) => { destinationCalls++; res.end("secret"); }), t);
  const upstream = await listen(http.createServer((req, res) => { res.writeHead(302, { Location: destination }); res.end(); }), t);
  const endpoint = await listen(createIpfsGateway({ token, upstream }), t);
  const result = await fetch(endpoint + "/api/v0/version", { method: "POST", headers: auth });
  assert.equal(result.status, 502);
  assert.equal(destinationCalls, 0);
  assert.doesNotMatch(await result.text(), /secret|127\.0\.0\.1/);
});

test("gateway times out a stalled Kubo and releases capacity", async t => {
  const upstream = await listen(http.createServer(() => {}), t);
  const endpoint = await listen(createIpfsGateway({ token, upstream, timeoutMs: 100 }), t);
  for (let i = 0; i < 2; i++) {
    const result = await fetch(endpoint + "/api/v0/version", { method: "POST", headers: auth });
    assert.equal(result.status, 504);
    await result.text();
  }
});

test("gateway refuses weak tokens and non-loopback Kubo origins", () => {
  assert.throws(() => createIpfsGateway({ token: "weak" }));
  for (const upstream of ["http://10.42.50.105:5001", "https://example.com", "http://127.0.0.1:5001/api", "http://secret@127.0.0.1:5001"]) {
    assert.throws(() => createIpfsGateway({ token, upstream }));
  }
});

test("gateway rejects chunked bodies over the limit without reaching Kubo", async t => {
  let calls = 0;
  const upstream = await listen(http.createServer((req, res) => { calls++; res.end("{}"); }), t);
  const endpoint = await listen(createIpfsGateway({ token, upstream, maxBytes: 32 }), t);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(endpoint + "/api/v0/add", {
      method: "POST", headers: { ...auth, "Content-Type": "multipart/form-data; boundary=test" }
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject);
    req.write("x".repeat(16));
    req.end("x".repeat(20));
  });
  assert.equal(status, 413);
  assert.equal(calls, 0);
});

test("gateway bounds concurrent backend operations", async t => {
  let release;
  let arrived;
  const seen = new Promise(resolve => { arrived = resolve; });
  const upstream = await listen(http.createServer((req, res) => {
    release = () => res.end('{"Version":"test"}');
    arrived();
  }), t);
  const endpoint = await listen(createIpfsGateway({ token, upstream, concurrency: 1 }), t);
  const first = fetch(endpoint + "/api/v0/version", { method: "POST", headers: auth });
  await seen;
  const second = await fetch(endpoint + "/api/v0/version", { method: "POST", headers: auth });
  assert.equal(second.status, 429);
  await second.text();
  release();
  assert.equal((await first).status, 200);
});
