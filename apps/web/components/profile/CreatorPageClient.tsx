'use client';
import Link from 'next/link';
import ArtworkImage from './ArtworkImage';
import ArtworkCard from '../artwork/ArtworkCard';
import {normalizeDesign,safeProfileLink} from '../../../../packages/profile/design.mjs';
import type {ApiMintFeedItem} from '../../lib/indexerApi';
import {collectionPath} from '../../lib/assetRoutes';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { fetchProfileView, type ApiProfileViewResponse } from '../../lib/profileViewApi';
export default function CreatorPageClient({address}:{address:string}) {
 const {address:viewer}=useAccount(); const [data,setData]=useState<ApiProfileViewResponse|null>(null); const [error,setError]=useState(''); const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError('');void fetchProfileView(address,{limit:48}).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError('This creator page is temporarily unavailable. Please try again shortly.');});return()=>{active=false;};},[address,attempt]);
 const profile=data?.resolution?.profiles?.find(p=>p.ownerAddress.toLowerCase()===address.toLowerCase());
 const items=(data?.holdings || []).filter((item):item is ApiMintFeedItem=>item.collection!==null);
 const design=normalizeDesign(profile?.design);
 const collections=[...new Map(items.map(item=>[`${item.collection.chainId}:${item.collection.contractAddress}`,item.collection])).values()];
 return <section className={`studioPage creatorTheme-${design.theme} creatorFont-${design.font}`}>
 {profile?.bannerUrl&&<div className="creatorBanner"><ArtworkImage source={profile.bannerUrl} alt="Creator banner"/></div>}
 {data?.readOnly&&<p role="status" className="card">Showing a saved, read-only copy{data.snapshotAt ? ` from ${new Date(data.snapshotAt).toLocaleDateString()}` : ""}. Profile edits and live ownership updates will return when the service is available.</p>}
 <header className="pageHeading">{profile?.avatarUrl&&<div className="creatorAvatar"><ArtworkImage source={profile.avatarUrl} alt={profile.displayName||'Creator avatar'}/></div>}<p className="eyebrow">Creator page</p><h1>{profile?.displayName || 'Independent creator'}</h1><p>{profile?.bio || 'A collection of artwork and collectibles.'}</p><details><summary>Wallet address</summary><p className="receiptHash">{address}</p></details>{!data?.readOnly&&viewer?.toLowerCase()===address.toLowerCase() && <Link className="ctaLink" href="/profile/setup">Edit your page</Link>}</header>
 {error ? <div role="status"><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>Retry</button></div> : !data ? <p role="status">Loading artwork…</p> : design.modules.map(module=><section key={module} className="creatorModule">
 {module==='artwork'&&<><h2>Collected artwork</h2>{data.holdingsError ? <p role="status">Artwork is temporarily unavailable. Your creator page is still visible.</p> : items.length ? <div className="creatorArtworkGrid">{items.map(item=><ArtworkCard key={item.id} item={item}/>)}</div> : <p>No artwork is available yet. New mints appear after indexing completes.</p>}</>}
 {module==='about'&&profile?.aboutMe&&<><h2>About the artist</h2><p>{profile.aboutMe}</p></>}
 {module==='links'&&Boolean(profile?.links?.length)&&<><h2>Elsewhere</h2><ul>{profile?.links.map(link=>safeProfileLink(link)?<li key={link}><a href={safeProfileLink(link)!} target="_blank" rel="noopener noreferrer">{new URL(link).hostname}</a></li>:null)}</ul></>}
 {module==='collections'&&collections.length>0&&<><h2>Collected from</h2><div className="creatorArtworkGrid">{collections.map(c=><Link className="card" key={`${c.chainId}:${c.contractAddress}`} href={collectionPath(c.chainId,c.contractAddress)}>{c.ensSubname||`${c.contractAddress.slice(0,6)}…${c.contractAddress.slice(-4)}`}</Link>)}</div></>}
 </section>)}<p><Link href="/discover">Explore more artwork</Link></p></section>;
}
