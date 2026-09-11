'use client';
import Link from 'next/link';
import CreatorPresentation from './CreatorPresentation';
import type {ApiMintFeedItem, ApiProfileRecord} from '../../lib/indexerApi';
import {fetchProfileViewSnapshot} from '../../lib/profileSnapshotApi';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { fetchProfileView, type ApiProfileViewResponse } from '../../lib/profileViewApi';
export default function CreatorPageClient({address,initialProfile}:{address:string;initialProfile?:ApiProfileRecord|null}) {
 const {address:viewer}=useAccount(); const [data,setData]=useState<ApiProfileViewResponse|null>(null); const [error,setError]=useState(''); const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true,liveLoaded=false,hasSaved=false;setData(null);setError('');
  // Show an exported public copy while the primary service responds. A late
  // snapshot must never replace a newer live result.
  void fetchProfileViewSnapshot(address).then(saved=>{if(active&&!liveLoaded&&saved){hasSaved=true;setData(saved);setError('');}}).catch(()=>{});
  void fetchProfileView(address,{limit:48}).then(value=>{if(active){liveLoaded=true;setData(value);setError('');}}).catch(()=>{if(active&&!hasSaved)setError('This creator page is temporarily unavailable. Please try again shortly.');});
  return()=>{active=false;};
 },[address,attempt]);

 const ownedProfiles=data?.resolution?.profiles?.filter(p=>p.ownerAddress.toLowerCase()===address.toLowerCase())||[];
 const profile=ownedProfiles.find(p=>p.source==='wallet')||ownedProfiles[0]||(!data?initialProfile:undefined);
 const items=(data?.holdings || []).filter((item):item is ApiMintFeedItem=>item.collection!==null);
 return <div>{data?.readOnly&&<p role="status" className="card">Showing a saved, read-only copy. Profile edits will return when the service is available.</p>}
 <CreatorPresentation address={address} profile={profile} items={items} readOnly={data?.readOnly} holdingsError={data?.holdingsError} edit={!data?.readOnly&&viewer?.toLowerCase()===address.toLowerCase()}/>
 {error?<div role="status"><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>Retry</button></div>:!data?<p role="status">Loading artwork…</p>:null}<p><Link href="/discover">Explore more artwork</Link></p></div>;
}
