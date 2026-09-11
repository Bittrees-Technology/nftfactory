import { describe, it, expect, vi, afterEach } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { POST, GET } from '../../app/api/auth/route';
import { requireSession } from './session';
const origin = 'http://localhost:3000';
const account = privateKeyToAccount(`0x${'12'.repeat(32)}`);
function request(body: unknown, cookie='') { return new Request(origin+'/api/auth', { method:'POST', headers:{Origin:origin,Cookie:cookie}, body:JSON.stringify(body) }); }
afterEach(()=>vi.unstubAllEnvs());
describe('wallet sign-in',()=>{
 it('verifies the wallet challenge and issues a same-origin owner session', async()=>{
  vi.stubEnv('SESSION_SECRET','test-secret-'.repeat(4));
  const challenge = await POST(request({address:account.address}));
  expect(challenge.status).toBe(200);
  const {message}=await challenge.json();
  const signature=await account.signMessage({message});
  const result=await POST(request({address:account.address,signature},challenge.headers.get('set-cookie')!.split(';')[0]));
  expect(result.status).toBe(200);
  const cookie=result.headers.get('set-cookie')!.split(';')[0];
  expect(requireSession(request({},cookie)).address).toBe(account.address.toLowerCase());
  expect((await GET(new Request(origin+'/api/auth',{headers:{cookie}}))).status).toBe(200);
  expect(()=>requireSession(new Request(origin+'/api/auth',{headers:{cookie,origin:'https://attacker.example'}}))).toThrow();
 });
 it('rejects an unsigned or mismatched wallet identity',async()=>{
  vi.stubEnv('SESSION_SECRET','test-secret-'.repeat(4));
  const response=await POST(request({address:account.address,signature:'0x1234'}));
  expect(response.status).toBe(401);
 });
});
