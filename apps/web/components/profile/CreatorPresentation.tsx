'use client';
import Link from 'next/link';
import ArtworkImage from './ArtworkImage';
import ArtworkCard from '../artwork/ArtworkCard';
import {normalizeDesign,safeProfileLink} from '../../../../packages/profile/design.mjs';
import type {ApiMintFeedItem} from '../../lib/indexerApi';
import {collectionPath} from '../../lib/assetRoutes';
import s from './CreatorPresentation.module.css';
type Props={address:string;profile?:{displayName?:string|null;bio?:string|null;aboutMe?:string|null;avatarUrl?:string|null;bannerUrl?:string|null;links?:string[];design?:unknown}|null;items:ApiMintFeedItem[];readOnly?:boolean;holdingsError?:string|null;preview?:boolean;edit?:boolean};
export default function CreatorPresentation({address,profile,items,readOnly,holdingsError,preview,edit}:Props){
 const d=normalizeDesign(profile?.design);const retro=d.theme==='retro';
 const featured=d.featured.flatMap(key=>items.filter(item=>`${item.collection.chainId}:${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`===key));
 const collections=[...new Map(items.map(item=>[`${item.collection.chainId}:${item.collection.contractAddress}`,item.collection])).values()];
 return <section className={`${s.page} ${retro?s.retro:`creatorTheme-${d.theme}`} creatorFont-${d.font}`} data-palette={d.palette} data-pattern={d.pattern}>
 <header className={s.hero}>
 {profile?.bannerUrl&&<div className={s.banner}><ArtworkImage source={profile.bannerUrl} alt="Creator banner"/></div>}
 {retro&&!profile?.bannerUrl&&<div className={s.orbit} aria-hidden="true">✳</div>}
 <div className={s.intro}>
 <p className={s.kicker}>{d.headline||'A personal corner of the internet'}</p>
 {profile?.avatarUrl&&<div className="creatorAvatar"><ArtworkImage source={profile.avatarUrl} alt="Creator avatar"/></div>}
 {preview?<h2>{profile?.displayName||'Your creator name'}</h2>:<h1>{profile?.displayName||'Independent creator'}</h1>}
 <p className={s.bio}>{profile?.bio||'A collection of artwork and collectibles.'}</p>
 {d.mood&&<p className={s.mood}>Mood: {d.mood}</p>}
 <details><summary>Wallet address</summary><p className="receiptHash">{address}</p></details>
 {edit&&<Link className="ctaLink" href="/profile/setup">Edit your page</Link>}
 </div>{retro&&d.sticker&&<div className={s.sticker}>{d.sticker}</div>}
 </header>
 <div className={s.modules}>{d.modules.map(module=>{
 let content=null;
 if(module==='about'&&profile?.aboutMe)content=<><h2>About the artist</h2><p className={s.prose}>{profile.aboutMe}</p></>;
 if(module==='top8'&&d.top8.length)content=<><h2>My Top 8</h2><ol className={s.top8}>{d.top8.map((value,i)=><li key={i}><span aria-hidden="true">{['✦','⌘','☾','✳','▧','◈','☺','?'][i]}</span><b>{value}</b></li>)}</ol></>;
 if(module==='panels'&&d.panels.length)content=<><h2>From my corner</h2><div className={s.panels}>{d.panels.filter(p=>p.title||p.body).map((p,i)=><article key={i}><h3>{p.title}</h3><p className={s.prose}>{p.body}</p></article>)}</div></>;
 if(module==='links'&&profile?.links?.some(safeProfileLink))content=<><h2>Elsewhere</h2><ul>{profile.links.filter(safeProfileLink).map(link=><li key={link}><a href={safeProfileLink(link)!} target="_blank" rel="noopener noreferrer">{new URL(link).hostname}</a></li>)}</ul></>;
 if(module==='featured'&&featured.length)content=<><h2>Featured artwork</h2><div className="creatorArtworkGrid">{featured.map(item=><ArtworkCard key={item.id} item={item} readOnly={readOnly}/>)}</div></>;
 if(module==='artwork')content=<><h2>Collected artwork</h2>{holdingsError?<p>Artwork is temporarily unavailable.</p>:items.length?<div className="creatorArtworkGrid">{items.map(item=><ArtworkCard key={item.id} item={item} readOnly={readOnly}/>)}</div>:<p>No artwork is available yet. Import or create your first piece to add it here.</p>}</>;
 if(module==='collections'&&collections.length)content=<><h2>Collected from</h2><div className="creatorArtworkGrid">{collections.map(c=><Link className="card" key={`${c.chainId}:${c.contractAddress}`} href={collectionPath(c.chainId,c.contractAddress)}>{c.ensSubname||`${c.contractAddress.slice(0,6)}…${c.contractAddress.slice(-4)}`}</Link>)}</div></>;
 return content?<section className={s.module} key={module} data-section={module}>{content}</section>:null;
 })}</div></section>;
}
