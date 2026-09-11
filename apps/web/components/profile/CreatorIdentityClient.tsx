'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {fetchProfileView} from '../../lib/profileViewApi';
import CreatorPageClient from './CreatorPageClient';
export default function CreatorIdentityClient({name}:{name:string}) {
 const [owner,setOwner]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setOwner('');setError('');void (async()=>{
  const view=await fetchProfileView(name);
  const candidates=view.resolution?.profiles?.filter(profile=>profile.source!=='wallet')||[];
  const identity=candidates.find(profile=>profile.slug.toLowerCase()===name.toLowerCase()||profile.fullName.toLowerCase()===name.toLowerCase());
  if(!identity)throw new Error('No verified creator page was found for this name.');
  // Recheck forward resolution so a transferred or expired alias cannot keep
  // presenting the former owner's page as its current identity.
  const response=await fetch(`/api/ens/resolve?name=${encodeURIComponent(identity.fullName)}`,{cache:'no-store'});
  const resolved=await response.json();
  if(!response.ok||resolved.address?.toLowerCase()!==identity.ownerAddress.toLowerCase())throw new Error('This name no longer resolves to the linked creator, or name verification is temporarily unavailable. Find their wallet page through Explore.');
  if(active)setOwner(identity.ownerAddress);
 })().catch(error=>{if(active)setError(error instanceof Error?error.message:'Name verification is unavailable.');});return()=>{active=false;};},[name,attempt]);
 if(owner)return <CreatorPageClient address={owner}/>;
 return <section className="studioPage"><h1>{name}</h1><p role="status">{error||'Verifying creator identity…'}</p>{error&&<button onClick={()=>setAttempt(value=>value+1)}>Retry verification</button>}<p><Link href="/discover">Explore creator pages</Link></p></section>;
}
