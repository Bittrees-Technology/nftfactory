import {it,expect} from 'vitest';
import {publicSeedAddress,fetchSeedContent,boundedSeedBody} from './seedFetch.js';
it('blocks private, loopback, metadata and unsupported address families',()=>{for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.164','172.16.0.1','100.64.0.1','::1','::ffff:127.0.0.1'])expect(publicSeedAddress(address)).toBe(false);expect(publicSeedAddress('8.8.8.8')).toBe(true);});
it('bounds downloads and rejects unsafe schemes and IPFS traversal',async()=>{await expect(boundedSeedBody(new Response('12345'),4)).rejects.toThrow('limit');await expect(fetchSeedContent('file:///etc/passwd',100)).rejects.toThrow();await expect(fetchSeedContent('ipfs://'+'a'.repeat(46)+'/../private',100)).rejects.toThrow('Invalid IPFS path');});
