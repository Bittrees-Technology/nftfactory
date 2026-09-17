import {afterEach, describe, expect, it, vi} from 'vitest';
import {getIndexerBaseUrl} from './indexerApi';
import {resolveIndexerServerUrl} from './indexerServerEnv';

afterEach(()=>vi.unstubAllEnvs());
describe('indexer network isolation',()=>{
  function configure(){
    vi.stubEnv('NEXT_PUBLIC_PRIMARY_CHAIN_ID','11155111');
    vi.stubEnv('NEXT_PUBLIC_INDEXER_API_URL','https://sepolia.example');
    vi.stubEnv('INDEXER_API_URL','https://private-sepolia.example');
    for(const id of [8453,4663]){
      vi.stubEnv(`NEXT_PUBLIC_INDEXER_API_URL_${id}`,'');
      vi.stubEnv(`INDEXER_API_URL_${id}`,'');
    }
  }
  it.each([8453,4663])('never routes an unconfigured network %i to Sepolia',chainId=>{
    configure();
    expect(resolveIndexerServerUrl(chainId)).toBeUndefined();
    expect(()=>getIndexerBaseUrl({chainId})).toThrow(`network ${chainId}`);
  });
  it.each([8453,4663])('uses the configured backend for network %i',chainId=>{
    configure();
    vi.stubEnv(`NEXT_PUBLIC_INDEXER_API_URL_${chainId}`,`https://public-${chainId}.example`);
    vi.stubEnv(`INDEXER_API_URL_${chainId}`,`https://private-${chainId}.example`);
    expect(resolveIndexerServerUrl(chainId)).toBe(`https://private-${chainId}.example`);
    expect(getIndexerBaseUrl({chainId})).toBe(`https://public-${chainId}.example`);
  });
  it('preserves the explicitly scoped artwork import backend for networks without a dedicated indexer',()=>{
    configure();
    expect(resolveIndexerServerUrl(1)).toBeUndefined();
    expect(resolveIndexerServerUrl(1,true)).toBe('https://private-sepolia.example');
  });
  it('keeps legacy settings for the primary network',()=>{
    configure();
    expect(resolveIndexerServerUrl(11155111)).toBe('https://private-sepolia.example');
    expect(getIndexerBaseUrl({chainId:11155111})).toBe('https://sepolia.example');
  });
});
