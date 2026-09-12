import {beforeEach, afterEach, expect, it, vi} from 'vitest';
vi.mock('./chains', () => ({getPrimaryAppChainId: () => 11155111}));
const address = '0x1111111111111111111111111111111111111111';
function deferred<T>() {let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve};}
const response = (body:unknown = {}) => ({ok:true,json:async()=>body});
beforeEach(()=>vi.resetModules());
afterEach(()=>vi.unstubAllGlobals());
it('discards a late wallet signature without waiting for the prompt to close',async()=>{
 const {ensureWalletSession,clearWalletSession}=await import('./walletSession');
 const signing=deferred<`0x${string}`>(); const started=deferred<void>();
 const methods:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{methods.push(init?.method||'GET');return response(init?.method==='POST'?{message:'challenge'}:{address:null});}));
 const pending=ensureWalletSession(address,()=>{started.resolve();return signing.promise;});
 const rejected=expect(pending).rejects.toThrow('disconnected');
 await started.promise;await clearWalletSession();
 expect(methods).toEqual(['GET','POST','DELETE','GET']);
 signing.resolve('0x1234');await rejected;
 expect(methods).toEqual(['GET','POST','DELETE','GET']);
});
it('clears the cookie after a delayed verification response, never before it',async()=>{
 const {ensureWalletSession,clearWalletSession}=await import('./walletSession');
 const verify=deferred<ReturnType<typeof response>>();const started=deferred<void>();const methods:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init?.body||'{}');methods.push(body.signature?'VERIFY':init?.method||'GET');if(body.signature){started.resolve();return verify.promise;}return response(init?.method==='POST'?{message:'challenge'}:{address:null});}));
 const pending=ensureWalletSession(address,async()=> '0x1234');const rejected=expect(pending).rejects.toThrow('disconnected');
 await started.promise;const logout=clearWalletSession();await Promise.resolve();
 expect(methods).toEqual(['GET','POST','VERIFY']);
 verify.resolve(response());await logout;await rejected;
 expect(methods).toEqual(['GET','POST','VERIFY','DELETE','GET']);
});
it('waits for challenge writes before logout and never opens an obsolete prompt',async()=>{
 const {ensureWalletSession,clearWalletSession}=await import('./walletSession');
 const challenge=deferred<ReturnType<typeof response>>();const started=deferred<void>();const sign=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.method==='POST'){started.resolve();return challenge.promise;}return response({address:null});}));
 const pending=ensureWalletSession(address,sign);const rejected=expect(pending).rejects.toThrow('disconnected');
 await started.promise;const logout=clearWalletSession();challenge.resolve(response({message:'challenge'}));await logout;await rejected;expect(sign).not.toHaveBeenCalled();
});
it('shares simultaneous sign-in requests instead of replacing their challenge',async()=>{
 const {ensureWalletSession}=await import('./walletSession');
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>response(init?.method==='POST'?{message:'challenge'}:{address:null})));
 const sign=vi.fn(async()=> '0x1234' as const);const first=ensureWalletSession(address,sign);const second=ensureWalletSession(address,sign);
 expect(first).toBe(second);await first;expect(sign).toHaveBeenCalledOnce();
});
it('blocks sign-in after failed logout until logout is successfully retried',async()=>{
 const {ensureWalletSession,clearWalletSession}=await import('./walletSession');
 const fetchMock=vi.fn().mockResolvedValue({ok:false});vi.stubGlobal('fetch',fetchMock);
 await expect(clearWalletSession()).rejects.toThrow('Sign-out');
 const sign=vi.fn();await expect(ensureWalletSession(address,sign)).rejects.toThrow('Sign-out');expect(sign).not.toHaveBeenCalled();
 fetchMock.mockImplementation(async(_url,init)=>response(init?.method==='POST'?{message:'challenge'}:{address:null}));
 await clearWalletSession();await ensureWalletSession(address,async()=> '0x1234');
});
