'use client';
import React,{useEffect,useState} from 'react';
import {profileEnvelope} from './profile-model.mjs';
/** Own-account display only: never returns identities or writes local names/contacts/roles. */
export function SharedProfileCard({sessionRevision}){
 const [state,setState]=useState(null);
 useEffect(()=>{
  setState(null);if(!sessionRevision)return;
  let active=true,generation=0,expiry,controller;
  async function load(){
   const id=++generation;clearTimeout(expiry);controller?.abort();controller=new AbortController();setState(null);
   if(document.hidden)return;
   try{const r=await fetch('/api/sso/profile',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const p=profileEnvelope(await r.json());if(active&&id===generation){setState({sessionRevision,profile:p});expiry=setTimeout(()=>setState(null),60000);}}catch{/* Local account UI remains available. */}
  }
  load();const timer=setInterval(load,45000);window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
  return()=>{active=false;++generation;clearInterval(timer);clearTimeout(expiry);controller?.abort();window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
 },[sessionRevision]);
 if(!sessionRevision)return null;
 const p=state?.sessionRevision===sessionRevision?state.profile:null,f=p?.fields;
 return <details data-shared-profile="own" style={{margin:'12px 0',padding:'12px 16px',border:'1px solid #d9e3dd',borderRadius:8,maxWidth:560,textAlign:'left'}}><summary>My Bittrees profile{f?.name?' · '+f.name:''}</summary>
 {f?<div style={{paddingTop:12}}>{f.avatar&&<img key={f.avatar} src={f.avatar} alt="" width="48" height="48" referrerPolicy="no-referrer" loading="lazy" style={{borderRadius:'50%',objectFit:'cover'}} onError={e=>{e.currentTarget.hidden=true;}}/>}{f.name&&<p><strong>{f.name}</strong></p>}{f.bio&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{f.bio}</p>}{f.website&&<p><a href={f.website} target="_blank" rel="noopener noreferrer">Website</a></p>}</div>:<p>{p?.status==='not-shared'?'No profile is shared with this app. Choose the fields and apps in Roles.':'Shared profile is unavailable. Your local account is unchanged.'}</p>}
 <p><a href="https://roles.bittrees.org/profile" target="_blank" rel="noopener noreferrer">Manage shared profile</a></p><small>Display information only. Access and private account settings stay in this app.</small></details>;
}
