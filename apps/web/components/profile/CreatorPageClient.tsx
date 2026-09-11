'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { fetchProfileView, type ApiProfileViewResponse } from '../../lib/profileViewApi';
export default function CreatorPageClient({address}:{address:string}) {
 const {address:viewer}=useAccount(); const [data,setData]=useState<ApiProfileViewResponse|null>(null); const [error,setError]=useState(''); const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setError('');void fetchProfileView(address,{limit:48}).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError('This creator page is temporarily unavailable. Please try again shortly.');});return()=>{active=false;};},[address,attempt]);
 const profile=data?.resolution?.profiles?.find(p=>p.ownerAddress.toLowerCase()===address.toLowerCase());
 const items=data?.holdings || [];
 return <section className="studioPage"><header className="pageHeading"><p className="eyebrow">Creator page</p><h1>{profile?.displayName || 'Independent creator'}</h1><p>{profile?.bio || 'A collection of artwork and collectibles.'}</p><details><summary>Wallet address</summary><p className="receiptHash">{address}</p></details>{viewer?.toLowerCase()===address.toLowerCase() && <Link className="ctaLink" href="/profile/setup">Edit your page</Link>}</header>{error ? <div role="status"><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>Retry</button></div> : !data ? <p role="status">Loading artwork…</p> : <><h2>Collected artwork</h2>{data.holdingsError ? <p role="status">Artwork is temporarily unavailable. Your creator page is still visible.</p> : items.length ? <div className="creatorArtworkGrid">{items.map(item=><article className="card" key={item.id}>{item.mediaUrl && /^https:\/\//i.test(item.mediaUrl) ? <img src={item.mediaUrl} alt={item.draftName || `Artwork ${item.tokenId}`} loading="lazy"/>:<div className="artworkPlaceholder">Artwork preview unavailable</div>}<h3>{item.draftName || `Artwork #${item.tokenId}`}</h3><p>{item.draftDescription}</p><p className="hint">{item.creatorAddress.toLowerCase()===address.toLowerCase()?'Created by this artist':'Collected by this artist'}</p></article>)}</div> : <p>No artwork is available yet. New mints appear after indexing completes.</p>}</>}<p><Link href="/discover">Explore more artwork</Link></p></section>;
}
