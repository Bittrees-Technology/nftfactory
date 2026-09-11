import http from 'node:http';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

// Public content only: a CID must be explicitly pinned on this node.
export function createIpfsReadGateway({ api = 'http://127.0.0.1:5001', gateway = 'http://127.0.0.1:8080', maxBytes = 16 * 1024 * 1024, concurrency = 4, timeoutMs = 30000 } = {}) {
  for (const origin of [api, gateway]) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Upstreams must be HTTP loopback origins.');
  }
  for (const value of [maxBytes, concurrency, timeoutMs]) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Limits must be positive integers.');
  let active = 0;
  const server = http.createServer(async (req, res) => {
    const reject = (code, error) => { if (res.headersSent) return res.destroy(); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error })); };
    if (!['GET', 'HEAD'].includes(req.method)) return reject(405, 'Read requests only.');
    const match = /^\/ipfs\/([a-zA-Z0-9]{32,120})((?:\/[^?#]*)?)$/.exec(req.url || '');
    if (!match) return reject(404, 'Content path not found.');
    try { if (decodeURIComponent(match[2]).split('/').some(part => part === '..' || part === '.' || part.includes('\\'))) return reject(400, 'Invalid content path.'); } catch { return reject(400, 'Invalid content path.'); }
    if (active >= concurrency) return reject(429, 'Read capacity reached.');
    active += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const close = () => controller.abort(); res.on('close', close);
    try {
      const pin = await fetch(`${api}/api/v0/pin/ls?arg=${match[1]}&type=recursive`, { method: 'POST', signal: controller.signal, redirect: 'error' });
      if (!pin.ok) return reject(404, 'Content is not published on this node.');
      const pinBytes = await pin.text();
      if (pinBytes.length > 65536 || !JSON.parse(pinBytes).Keys?.[match[1]]) return reject(404, 'Content is not published on this node.');
      const result = await fetch(`${gateway}${req.url}`, { method: req.method, signal: controller.signal, redirect: 'error' });
      if (!result.ok) return reject(result.status === 404 ? 404 : 502, 'Content is unavailable.');
      if (Number(result.headers.get('content-length') || 0) > maxBytes) return reject(413, 'Content exceeds this gateway limit.');
      res.writeHead(200, { 'Content-Type': result.headers.get('content-type') || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'", 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
      if (req.method === 'HEAD') { res.end(); return; }
      if (!result.body) throw new Error('Empty upstream response');
      let bytes = 0;
      const bound = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(bytes > maxBytes ? new Error('Content limit') : null, chunk); } });
      await pipeline(Readable.fromWeb(result.body), bound, res, { signal: controller.signal });
    } catch { reject(controller.signal.aborted ? 504 : 502, 'Content is temporarily unavailable.'); }
    finally { clearTimeout(timer); res.off('close', close); active -= 1; }
  });
  server.headersTimeout = 10000; server.requestTimeout = timeoutMs;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createIpfsReadGateway().listen(Number(process.env.IPFS_READ_PORT || 8789), '127.0.0.1');
}
