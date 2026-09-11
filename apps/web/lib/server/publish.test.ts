import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assertPublishingConfigured, boundedBody, confirmReplica } from './publish';
const cid='bafybeigdyrzt5sfp7udm7hu76uh7y26nf3uyhd7t4d4erwzu6du7izcd4e';
const bytes=new TextEncoder().encode('original artwork');
beforeEach(()=>{vi.stubEnv('IPFS_REPLICA_API_URL','https://pins.example');vi.stubEnv('IPFS_REPLICA_API_TOKEN','private-test-token');vi.stubEnv('IPFS_REPLICA_GATEWAY_URL','https://backup.example');});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('blocks publication without an independent replica',()=>{vi.stubEnv('IPFS_REPLICA_API_TOKEN','');expect(assertPublishingConfigured).toThrow('backup copy');});
it('reuses a durable pin and verifies the exact bytes through the backup gateway',async()=>{const mock=vi.fn().mockResolvedValueOnce(Response.json({results:[{requestid:'existing',pin:{cid},status:'pinned'}]})).mockResolvedValueOnce(new Response(bytes));vi.stubGlobal('fetch',mock);expect(await confirmReplica(cid,bytes,'artwork')).toEqual(expect.objectContaining({requestId:'existing'}));expect(mock).toHaveBeenCalledTimes(2);expect(mock.mock.calls[1][1].headers).toBeUndefined();});
it('does not accept a pin receipt when the backup serves different bytes',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({results:[]})).mockResolvedValueOnce(Response.json({requestid:'new',pin:{cid},status:'pinned'})).mockResolvedValueOnce(new Response('different')));await expect(confirmReplica(cid,bytes,'artwork')).rejects.toThrow('did not match');});
it('rejects a receipt for a different CID',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({results:[]})).mockResolvedValueOnce(Response.json({requestid:'new',pin:{cid:'wrong'},status:'pinned'})));await expect(confirmReplica(cid,bytes,'artwork')).rejects.toThrow('invalid storage receipt');});
it('enforces the upload ceiling on streamed bodies without content-length',async()=>{const request=new Request('https://site.example',{method:'POST',body:new Uint8Array(100)});await expect(boundedBody(request,50)).rejects.toThrow('smaller');});

it('uploads directly and requires a recursive pin plus exact gateway bytes', async () => {
  vi.stubEnv('IPFS_REPLICA_MODE', 'kubo-upload');
  const mock = vi.fn().mockResolvedValueOnce(Response.json({ Hash: cid }))
    .mockResolvedValueOnce(Response.json({ Keys: { [cid]: { Type: 'recursive' } } }))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal('fetch', mock);
  expect(await confirmReplica(cid, bytes, 'artwork')).toEqual(expect.objectContaining({ requestId: cid }));
  expect(mock.mock.calls[0][1].body).toBeInstanceOf(FormData);
  expect(mock.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  expect(mock.mock.calls[1][0]).toContain('/api/v0/pin/ls?');
  expect(mock.mock.calls[2][1].headers).toBeUndefined();
});
it('rejects a direct upload with a different CID before checking the gateway', async () => {
  vi.stubEnv('IPFS_REPLICA_MODE', 'kubo-upload');
  const mock = vi.fn().mockResolvedValueOnce(Response.json({ Hash: 'QmatgCVzpmnJBZhb38moPnKJD6zG8hZxX2ZDV5s7G4oLHm' }));
  vi.stubGlobal('fetch', mock);
  await expect(confirmReplica(cid, bytes, 'artwork')).rejects.toThrow('did not match');
  expect(mock).toHaveBeenCalledTimes(1);
});
it('rejects an uploaded replica without a recursive pin', async () => {
  vi.stubEnv('IPFS_REPLICA_MODE', 'kubo-upload');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ Hash: cid }))
    .mockResolvedValueOnce(Response.json({ Keys: { [cid]: { Type: 'indirect' } } })));
  await expect(confirmReplica(cid, bytes, 'artwork')).rejects.toThrow('durable pin');
});
it('rejects unknown replication modes', () => {
  vi.stubEnv('IPFS_REPLICA_MODE', 'unknown');
  expect(assertPublishingConfigured).toThrow('configuration');
});
