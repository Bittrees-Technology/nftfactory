'use client';
import Link from 'next/link';
import {useState} from 'react';
import {profileLinkLabel} from '../../lib/profileLinkLabel';
import {profilePageDocument} from '../../lib/profilePageDocument';
import {customProfileDocument} from '../../lib/profileCustomCode';
import ArtworkImage from './ArtworkImage';
import ArtworkCard from '../artwork/ArtworkCard';
import {normalizeDesign,safeProfileLink} from '../../../../packages/profile/design.mjs';
import type {ApiMintFeedItem} from '../../lib/indexerApi';
import {collectionPath} from '../../lib/assetRoutes';
import s from './CreatorPresentation.module.css';
type Props={address:string;profile?:{displayName?:string|null;bio?:string|null;aboutMe?:string|null;avatarUrl?:string|null;bannerUrl?:string|null;links?:string[];design?:unknown}|null;items:ApiMintFeedItem[];readOnly?:boolean;holdingsError?:string|null;preview?:boolean;edit?:boolean};
export default function CreatorPresentation({address,profile,items,readOnly,holdingsError,preview,edit}:Props){
 const [copyStatus,setCopyStatus]=useState('');
 const copyWallet=async()=>{try{await navigator.clipboard.writeText(address);setCopyStatus('Wallet address copied');}catch{setCopyStatus('Unable to copy. Select the wallet address below.');}};
 const walletControl=<div className={s.wallet}><button type="button" className="secondary" onClick={()=>void copyWallet()} aria-label={`Copy wallet address for ${profile?.displayName||'this creator'}`}>Copy wallet address</button><span role="status">{copyStatus}</span><details><summary>Full wallet address</summary><p className="receiptHash">{address}</p></details></div>;
 const d=normalizeDesign(profile?.design);const retro=d.theme==='retro';
 if(d.customScope==='page')return <section>{walletControl}<p className="hint">Creator-designed profile{edit&&<> · <Link href="/profile/setup">Edit your page</Link></>}</p><iframe className="profileCustomPage" title="Custom profile page" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={profilePageDocument(address,profile,items)} style={{height:Math.max(800,d.customHeight)}}/></section>;
 const modules=[...d.modules];const about=modules.indexOf('about'),artwork=modules.indexOf('artwork');if(about>=0&&artwork>=0&&about>artwork){modules.splice(about,1);modules.splice(artwork,0,'about');}
 const featured=d.featured.flatMap(key=>items.filter(item=>`${item.collection.chainId}:${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`===key));
 const collections=[...new Map(items.map(item=>[`${item.collection.chainId}:${item.collection.contractAddress}`,item.collection])).values()];
 return <section className={`${s.page} ${retro?s.retro:`creatorTheme-${d.theme}`} creatorFont-${d.font}`} data-palette={d.palette} data-pattern={d.pattern}>
 <header className={s.hero}>
 {profile?.bannerUrl&&<div className={s.banner}><ArtworkImage source={profile.bannerUrl} alt="Creator banner"/></div>}
 {retro&&!profile?.bannerUrl&&<div className={s.orbit} aria-hidden="true">✳</div>}
 <div className={s.intro}>
 {d.headline&&<p className={s.kicker}>{d.headline}</p>}
 {profile?.avatarUrl&&<div className="creatorAvatar"><ArtworkImage source={profile.avatarUrl} alt="Creator avatar"/></div>}
 {preview?<h2>{profile?.displayName||'Your creator name'}</h2>:<h1><button type="button" className={s.nameCopy} onClick={()=>void copyWallet()} title="Copy wallet address" aria-label={`${profile?.displayName||'Independent creator'} — copy wallet address`}>{profile?.displayName||'Independent creator'}</button></h1>}
 <p className={s.bio}>{profile?.bio||'A collection of artwork and collectibles.'}</p>
 {d.mood&&<p className={s.mood}>Mood: {d.mood}</p>}
 {walletControl}
 {edit&&<Link className="ctaLink" href="/profile/setup">Edit your page</Link>}
 </div>{retro&&d.sticker&&<div className={s.sticker}>{d.sticker}</div>}
 </header>
 <div className={s.modules}>{modules.map(module=>{
 let content=null;
 if(module==='custom'&&d.customHtml.trim())content=<><h2>Custom creator section</h2><p style={{fontSize:12}}>Designed by this creator</p><iframe title="Creator custom HTML and CSS" sandbox="" referrerPolicy="no-referrer" srcDoc={customProfileDocument(d.customHtml,d.customCss)} style={{width:'100%',height:d.customHeight,border:0,display:'block',background:'#15182c'}}/></>;
 if(module==='about'&&profile?.aboutMe)content=<><h2>About the artist</h2><p className={s.prose}>{profile.aboutMe}</p></>;
 if(module==='top8'&&(d.top8.length||d.top8Targets.length))content=<><h2>My Top 8</h2><ol className={s.top8}>{d.top8Targets.length?d.top8Targets.map((target,i)=><li key={target.url}><span aria-hidden="true">{['✦','⌘','☾','✳','▧','◈','☺','?'][i]}</span><Link href={target.url}>{target.label||target.url.split('/').at(-1)}</Link></li>):d.top8.map((value,i)=><li key={i}><span aria-hidden="true">{['✦','⌘','☾','✳','▧','◈','☺','?'][i]}</span><b>{value}</b></li>)}</ol></>;
 if(module==='panels'&&d.panels.length)content=<><h2>From my corner</h2><div className={s.panels}>{d.panels.filter(p=>p.title||p.body).map((p,i)=><article key={i}><h3>{p.title}</h3><p className={s.prose}>{p.body}</p></article>)}</div></>;
 if(module==='links'&&profile?.links?.some(safeProfileLink))content=<><h2>Elsewhere</h2><ul className={s.socialLinks}>{profile.links.filter(safeProfileLink).map(link=>{const info=profileLinkLabel(link);return <li key={link}><a href={safeProfileLink(link)!} target="_blank" rel="noopener noreferrer"><strong>{info.label} ↗</strong><span>{info.account}</span><small>{info.destination}</small></a></li>;})}</ul></>;
 if(module==='featured'&&featured.length)content=<><h2>Featured artwork</h2><div className="creatorArtworkGrid">{featured.map(item=><ArtworkCard key={item.id} item={item} readOnly={readOnly}/>)}</div></>;
 if(module==='artwork')content=<><h2>Collected artwork</h2>{holdingsError?<p>Artwork is temporarily unavailable.</p>:items.length?<div className="creatorArtworkGrid">{items.map(item=><ArtworkCard key={item.id} item={item} readOnly={readOnly}/>)}</div>:<p>No artwork is available yet. Import or create your first piece to add it here.</p>}</>;
 if(module==='collections'&&collections.length)content=<><h2>Collected from</h2><div className="creatorArtworkGrid">{collections.map(c=><Link className="card" key={`${c.chainId}:${c.contractAddress}`} href={collectionPath(c.chainId,c.contractAddress)}>{c.ensSubname||`${c.contractAddress.slice(0,6)}…${c.contractAddress.slice(-4)}`}</Link>)}</div></>;
 return content?<section className={s.module} key={module} data-section={module}>{content}</section>:null;
 })}</div></section>;
}
