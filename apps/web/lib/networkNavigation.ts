// Collection addresses are chain-specific. A deliberate toolbar change may
// change the workspace chain, but must not carry its old contract into it.
export function networkWorkspaceUrl(href:string,chainId:number):string|null {
 const url=new URL(href);
 if(url.pathname!=='/mint')return null;
 if(Number(url.searchParams.get('chainId'))===chainId)return null;
 url.searchParams.set('chainId',String(chainId));
 for(const key of ['address','profile','identityMode'])url.searchParams.delete(key);
 return url.pathname+url.search+url.hash;
}
