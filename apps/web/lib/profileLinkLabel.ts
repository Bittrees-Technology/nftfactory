export function profileLinkLabel(link:string){
 const url=new URL(link);const host=url.hostname.replace(/^www\./,'');
 const platform:Record<string,string>={'x.com':'X','twitter.com':'X','instagram.com':'Instagram','youtube.com':'YouTube','youtu.be':'YouTube','bsky.app':'Bluesky','warpcast.com':'Farcaster','tiktok.com':'TikTok','discord.gg':'Discord','discord.com':'Discord'};
 const path=url.pathname.replace(/^\/+|\/+$/g,'');
 return {label:platform[host]||'Website',account:platform[host]?(path||host):host,destination:host+(path?'/'+path:'')};
}
