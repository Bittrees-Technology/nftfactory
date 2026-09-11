import { ImageResponse } from 'next/og';
import { getPublicCreator, getPublicArtwork, plainText } from '../../../lib/publicSeo';
import { getEnabledAppChainIds } from '../../../lib/chains';
import { validAssetRoute } from '../../../lib/assetRoutes';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, {params}: {params: Promise<{parts:string[]}>}) {
 const {parts}=await params; let title=''; let subtitle='';
 if(parts[0]==='creator'&&parts.length===2&&/^0x[0-9a-f]{40}$/i.test(parts[1])) {
  const p=await getPublicCreator(parts[1]); if(!p)return new Response('Not found',{status:404});
  title=plainText(p.displayName,70);subtitle=plainText(p.bio,140);
 } else if(parts[0]==='artwork'&&(parts.length===3||parts.length===4)&&getEnabledAppChainIds().includes(Number(parts[1]))&&validAssetRoute(parts[1],parts[2],parts[3])) {
  const data=await getPublicArtwork(Number(parts[1]),parts[2],parts[3]); const item=data?.tokens[0];
  if(!item)return new Response('Not found',{status:404});
  title=parts[3] ? plainText(item.draftName,70)||`Artwork #${parts[3]}` : plainText(item.collection.ensSubname,70)||'NFT collection';
  subtitle=parts[3] ? plainText(item.draftDescription,140) : `${parts[2]} · Chain ${parts[1]}`;
 } else return new Response('Not found',{status:404});
 return new ImageResponse(<div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',width:'100%',height:'100%',background:'#191c1b',color:'#f4f5f3',padding:64,borderLeft:'16px solid #ff9168',fontFamily:'sans-serif'}}><div style={{display:'flex',fontSize:30,color:'#ff9168'}}>NFTFactory</div><div style={{display:'flex',flexDirection:'column',gap:24}}><div style={{fontSize:64,lineHeight:1.1}}>{title}</div><div style={{fontSize:28,color:'#b3bdb5'}}>{subtitle}</div></div><div style={{fontSize:24}}>Make it yours. Make it collectible. · nftfactory.org</div></div>,{width:1200,height:630,headers:{'Cache-Control':'public, max-age=60','X-Robots-Tag':'noindex'}});
}
