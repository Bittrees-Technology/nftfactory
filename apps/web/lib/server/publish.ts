import { createHash } from 'node:crypto';
import { buildIpfsAddUrl, buildIpfsAuthHeaders, parseIpfsAddResponse, resolveIpfsApiUrls, isPublicIpfsApiMissingRequiredAuth, buildGatewayUrl, resolveIpfsGatewayBaseUrl } from '../ipfsUpload';
export const MAX_PUBLISH_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BYTES = MAX_PUBLISH_BYTES - 64 * 1024;
export class PublishingUnavailable extends Error {}
function replicaConfig() {
  const api = process.env.IPFS_REPLICA_API_URL?.replace(/\/$/, '');
  const token = process.env.IPFS_REPLICA_API_TOKEN;
  const gateway = process.env.IPFS_REPLICA_GATEWAY_URL?.replace(/\/$/, '');
  if (!api || !token || !gateway) throw new PublishingUnavailable('Publishing is paused until the backup copy is available. Your draft is safe in this browser.');
  for (const value of [api, gateway]) {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && url.hostname === '127.0.0.1'))) throw new PublishingUnavailable('Storage configuration needs attention.');
  }
  const mode = process.env.IPFS_REPLICA_MODE || 'pinning-service';
  if (!['pinning-service', 'kubo-upload'].includes(mode)) throw new PublishingUnavailable('Storage configuration needs attention.');
  return { api, gateway, mode, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}
export function assertPublishingConfigured() {
  replicaConfig();
  const endpoints = resolveIpfsApiUrls();
  if (!endpoints.length || endpoints.some(url => isPublicIpfsApiMissingRequiredAuth(url))) throw new PublishingUnavailable('Publishing is temporarily unavailable. Please keep your draft and retry later.');
}
async function checkedJson(url: string, init: RequestInit) {
  const result = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  if (!result.ok) throw new PublishingUnavailable('The backup service could not confirm your content. Please retry.');
  return JSON.parse((await boundedBody(result, 64 * 1024)).toString());
}
export async function confirmReplica(cid: string, expected: Uint8Array, name: string) {
  const { api, gateway, mode, headers } = replicaConfig();
  let requestId: string;
  if (mode === 'kubo-upload') {
    if (!expected.byteLength || expected.byteLength > MAX_PUBLISH_BYTES) throw new PublishingUnavailable('The backup upload exceeds the allowed size.');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(expected)]), name);
    const result = await fetch(buildIpfsAddUrl(api), { method: 'POST', headers: { Authorization: headers.Authorization }, body: form, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!result.ok) throw new PublishingUnavailable('The backup upload failed. Keep your draft and retry.');
    const uploadedCid = parseIpfsAddResponse((await boundedBody(result, 64 * 1024)).toString());
    if (uploadedCid !== cid) throw new PublishingUnavailable('The backup receipt did not match this content.');
    const pinUrl = new URL(buildIpfsAddUrl(api));
    pinUrl.pathname = pinUrl.pathname.replace(/add$/, 'pin/ls');
    pinUrl.search = new URLSearchParams({ arg: cid, type: 'recursive' }).toString();
    const pins = await checkedJson(pinUrl.toString(), { method: 'POST', headers });
    if (pins.Keys?.[cid]?.Type !== 'recursive') throw new PublishingUnavailable('The backup service did not confirm a durable pin.');
    requestId = cid;
  } else {
    const existing = await checkedJson(`${api}/pins?cid=${encodeURIComponent(cid)}&limit=10`, { headers });
    // The pinning service retains a durable pin job; retries reuse its request ID.
    let job = existing.results?.find((p: any) => p.pin?.cid === cid && p.status !== 'failed');
    if (!job) job = await checkedJson(`${api}/pins`, { method: 'POST', headers, body: JSON.stringify({ cid, name, meta: { project: 'nftfactory' } }) });
    if (!job.requestid || job.pin?.cid !== cid) throw new PublishingUnavailable('The backup service returned an invalid storage receipt.');
    const deadline = Date.now() + 60_000;
    while (job.status !== 'pinned' && Date.now() < deadline) {
      if (job.status === 'failed') throw new PublishingUnavailable('The backup copy failed. Keep your draft and retry.');
      await new Promise(resolve => setTimeout(resolve, 1000));
      job = await checkedJson(`${api}/pins/${encodeURIComponent(job.requestid)}`, { headers });
      if (job.pin?.cid !== cid) throw new PublishingUnavailable('The backup receipt did not match this content.');
    }
    if (job.status !== 'pinned') throw new PublishingUnavailable('Your backup copy is still being prepared. Keep your draft and retry shortly.');
    requestId = job.requestid;
  }
  const result = await fetch(buildGatewayUrl({ gatewayBaseUrl: gateway, cid }), { redirect: 'error', signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  if (!result.ok || !result.body) throw new PublishingUnavailable('The backup copy is not readable yet. Please retry shortly.');
  const reader = result.body.getReader();
  const hash = createHash('sha256');
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > expected.byteLength) throw new PublishingUnavailable('The backup copy did not match the original.');
      hash.update(next.value);
    }
  } finally { await reader.cancel(); }
  if (size !== expected.byteLength || hash.digest('hex') !== createHash('sha256').update(expected).digest('hex')) throw new PublishingUnavailable('The backup copy did not match the original.');
  return { requestId, verifiedAt: new Date().toISOString() };
}
export async function publishFile(file: File, name: string) {
  assertPublishingConfigured();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_PUBLISH_BYTES) throw new Error('Choose a smaller file.');
  let cid: string | undefined;
  for (const base of resolveIpfsApiUrls()) {
    try {
      const form = new FormData(); form.append('file', file, name);
      const response = await fetch(buildIpfsAddUrl(base), { method: 'POST', headers: buildIpfsAuthHeaders(), body: form, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) continue;
      cid = parseIpfsAddResponse((await boundedBody(response, 64 * 1024)).toString()); break;
    } catch { /* Try the next explicitly configured primary endpoint. */ }
  }
  if (!cid) throw new PublishingUnavailable('Your home storage is unavailable. Keep your draft and retry when it returns.');
  const replica = await confirmReplica(cid, bytes, name);
  return { cid, uri: `ipfs://${cid}`, gatewayUrl: buildGatewayUrl({ gatewayBaseUrl: resolveIpfsGatewayBaseUrl(), cid }), storage: { copies: 2, ...replica } };
}
export async function boundedBody(request: Pick<Request, "headers" | "body">, limit = MAX_PUBLISH_BYTES) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('Upload must be smaller than 3 MiB in total.');
  if (!request.body) throw new Error('Upload is empty.');
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error('Upload must be smaller than 3 MiB in total.');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
