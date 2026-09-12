import {it,expect,vi,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('./requestRateLimit',()=>({rateLimitRequest:()=>null}));
import {GET} from '../app/api/artwork/suggestions/route';
afterEach(()=>vi.unstubAllGlobals());
const wallet='0x'+'1'.repeat(40),contract='0x'+'2'.repeat(40);
it('returns cursor-based contract suggestions without asserting authority',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[{token:{address_hash:contract,name:'Collection'}}],next_page_params:{token_contract_address_hash:contract,items_count:50}})));const result=await(await GET(new NextRequest(`https://nftfactory.org/api/artwork/suggestions?chainId=1&wallet=${wallet}`))).json();expect(result.items[0]).toMatchObject({contract,name:'Collection'});expect(result.items[0]).not.toHaveProperty('authorized');expect(result.nextCursor).toContain(contract);});
it('rejects untrusted cursor parameters before any outbound request',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const cursor=encodeURIComponent(JSON.stringify({url:'https://private.example'}));const result=await GET(new NextRequest(`https://nftfactory.org/api/artwork/suggestions?chainId=1&wallet=${wallet}&cursor=${cursor}`));expect(result.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();});
