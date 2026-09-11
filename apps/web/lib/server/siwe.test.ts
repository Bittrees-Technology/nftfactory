import {beforeEach,describe,expect,it,vi} from 'vitest';
import {parseSiweMessage} from 'viem/siwe';
import {makeSignInMessage,consumeSignInMessage,verifySignInMessage} from './siwe';
vi.mock('../chains',()=>({getEnabledAppChainIds:()=>[11155111],getPrimaryAppChainId:()=>11155111,getAppChain:()=>({id:11155111})}));
vi.mock('../indexerServerEnv',()=>({resolveIndexerServerUrl:()=> 'https://api.example.test'}));
vi.mock('../publicEnv',()=>({resolveScopedChainPublicRpcUrls:()=>['https://rpc.example.test']}));
const address='0x1111111111111111111111111111111111111111';
beforeEach(()=>{vi.unstubAllGlobals();vi.stubEnv('SESSION_SECRET','s'.repeat(48));});
describe('SIWE boundary',()=>{
 it('binds a short-lived challenge to domain, URI, network and address',()=>{const now=new Date();const message=makeSignInMessage(address,'https://nftfactory.org',11155111,now);const parsed=parseSiweMessage(message);expect(parsed).toMatchObject({domain:'nftfactory.org',uri:'https://nftfactory.org',chainId:11155111,address,version:'1'});expect(parsed.expirationTime!.getTime()-now.getTime()).toBe(300000);expect(parsed.nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);expect(makeSignInMessage(address,'https://nftfactory.org',11155111)).not.toBe(message);});
 it('rejects unsupported networks before issuing a challenge',()=>{expect(()=>makeSignInMessage(address,'https://nftfactory.org',1)).toThrow('Unsupported');});
 it('rejects a valid-format challenge from another origin before RPC verification',async()=>{const message=makeSignInMessage(address,'https://other.test',11155111);expect(await verifySignInMessage(address,'https://nftfactory.org',message,'0x1234')).toBe(false);});
 it('fails closed when durable replay protection rejects consumption',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:409}));await expect(consumeSignInMessage(address,'message',Date.now()+10000)).rejects.toThrow('already used');});
 it('sends only a scoped signed proof to replay storage',async()=>{const fetchMock=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal('fetch',fetchMock);await consumeSignInMessage(address,'message',Date.now()+10000);expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/auth/consume',expect.objectContaining({method:'POST',redirect:'error'}));const proof=fetchMock.mock.calls[0][1].headers.Authorization.split(' ')[1];const body=JSON.parse(Buffer.from(proof.split('.')[0],'base64url').toString());expect(body.purpose).toBe('nonce-consume');expect(body.message).toMatch(/^[a-f0-9]{64}$/);});
});
