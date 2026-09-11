'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import HeaderWalletButton from '../HeaderWalletButton';
import { ensureWalletSession } from '../../lib/walletSession';
import {fetchProfileView} from '../../lib/profileViewApi';
import {normalizeDesign,PROFILE_MODULES,safeProfileLink,type ProfileDesign} from '../../../../packages/profile/design.mjs';
import ArtworkImage from './ArtworkImage';
type Draft={name:string;bio:string;avatarUrl:string;bannerUrl:string;links:string;design:ProfileDesign};
const empty=():Draft=>({name:'',bio:'',avatarUrl:'',bannerUrl:'',links:'',design:normalizeDesign(null)});
export default function CreatorSetupClient() {
  const { address } = useAccount(); const { data: wallet } = useWalletClient();
  const [draft,setDraft]=useState<Draft>(empty); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(false); const [message,setMessage]=useState(''); const [saved,setSaved]=useState(false); const [preview,setPreview]=useState(false);
  const generation=useRef(0); const dirty=useRef(false);
  useEffect(()=>{
    const gen=++generation.current;dirty.current=false;setDraft(empty());setSaved(false);setMessage('');setLoading(Boolean(address));
    if(!address)return;
    void fetchProfileView(address).then(value=>{
      if(generation.current!==gen||dirty.current)return;
      const profile=value.resolution?.profiles?.find(p=>p.source==='wallet'&&p.ownerAddress.toLowerCase()===address.toLowerCase());
      if(profile)setDraft({name:profile.displayName||'',bio:profile.bio||'',avatarUrl:profile.avatarUrl||'',bannerUrl:profile.bannerUrl||'',links:(profile.links||[]).join('\n'),design:normalizeDesign(profile.design)});
    }).catch(()=>{if(generation.current===gen)setMessage('Saved profile could not be loaded. Retry before replacing an existing page.');}).finally(()=>{if(generation.current===gen)setLoading(false);});
    return()=>{generation.current++;};
  },[address]);
  function change(next:Partial<Draft>){dirty.current=true;setSaved(false);setDraft(current=>({...current,...next}));}
  function localDraft(action:'save'|'restore'){
    if(!address)return;
    try {const key=`creator-design-draft:${address.toLowerCase()}`;if(action==='save'){localStorage.setItem(key,JSON.stringify(draft));setMessage('Draft saved on this device. Your public page is unchanged.');}else{const value=JSON.parse(localStorage.getItem(key)||'null');if(value){change({...empty(),...value,design:normalizeDesign(value.design)});setMessage('Local draft restored. Preview it before publishing.');}else setMessage('No draft is saved on this device.');}}catch{setMessage('Device storage is unavailable. You can still publish your page.');}
  }
  async function save(){
    if(!address||!wallet||busy)return;const gen=generation.current;const current=draft;
    const links=current.links.split('\n').map(v=>v.trim()).filter(Boolean);
    if(links.some(link=>!safeProfileLink(link))||[current.avatarUrl,current.bannerUrl].some(url=>url&&!/^https:\/\//i.test(url))){setMessage('Use HTTPS image URLs and complete http or https links.');return;}
    setBusy(true);setMessage('Confirm wallet sign-in to save your public page.');
    try{
      await ensureWalletSession(address,args=>wallet.signMessage(args));
      if(generation.current!==gen)return;
      const response=await fetch('/api/indexer/api/profiles/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'wallet',name:address.toLowerCase(),ownerAddress:address.toLowerCase(),displayName:current.name.trim(),bio:current.bio.trim(),avatarUrl:current.avatarUrl,bannerUrl:current.bannerUrl,links,design:current.design,layoutMode:'default'})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Your page could not be saved.');
      if(generation.current===gen){setSaved(true);setMessage('Your creator page is ready to share.');dirty.current=false;}
    }catch(error){if(generation.current===gen)setMessage(error instanceof Error?error.message:'Please retry.');}finally{setBusy(false);}
  }
  return <section className="studioPage"><header className="pageHeading"><p className="eyebrow">Your creator page</p><h1>Make this space yours.</h1><p>Build a home for your work with your own imagery, style, and arrangement. ENS is optional.</p></header><div className="createLayout"><div className="card formCard"><h2>About you</h2>{!address&&<><p>Connect the wallet that owns your work.</p><HeaderWalletButton/></>}{loading&&<p role="status">Loading your saved profile…</p>}<label>Display name<input value={draft.name} maxLength={80} onChange={e=>change({name:e.target.value})}/></label><label>About your work<textarea value={draft.bio} maxLength={1200} onChange={e=>change({bio:e.target.value})}/></label><label>Avatar image URL<input type="url" value={draft.avatarUrl} maxLength={2048} onChange={e=>change({avatarUrl:e.target.value})}/></label><label>Banner image URL<input type="url" value={draft.bannerUrl} maxLength={2048} onChange={e=>change({bannerUrl:e.target.value})}/></label><label>Links (one per line)<textarea value={draft.links} maxLength={4000} onChange={e=>change({links:e.target.value})}/></label><h2>Appearance</h2><label>Theme<select value={draft.design.theme} onChange={e=>change({design:normalizeDesign({...draft.design,theme:e.target.value})})}><option value="gallery">Gallery</option><option value="midnight">Midnight</option><option value="paper">Paper</option></select></label><label>Typography<select value={draft.design.font} onChange={e=>change({design:normalizeDesign({...draft.design,font:e.target.value})})}><option value="sans">Modern</option><option value="serif">Editorial</option></select></label><h3>Page sections</h3><p className="hint">Choose sections and change their order. Your introduction stays at the top.</p>{PROFILE_MODULES.map(module=><label key={module}><input type="checkbox" checked={draft.design.modules.includes(module)} onChange={e=>change({design:{...draft.design,modules:e.target.checked?[...draft.design.modules,module]:draft.design.modules.filter(m=>m!==module)}})}/>{module}</label>)}<ol className="moduleOrder">{draft.design.modules.map((module,index)=><li key={module}>{module}<button type="button" className="secondary" disabled={!index} aria-label={`Move ${module} up`} onClick={()=>{const modules=[...draft.design.modules];[modules[index-1],modules[index]]=[modules[index],modules[index-1]];change({design:{...draft.design,modules}});}}>Move up</button></li>)}</ol><div className="row"><button className="secondary" onClick={()=>change({design:normalizeDesign(null)})}>Reset appearance</button><button className="secondary" onClick={()=>{setPreview(true);}}>Preview images</button><button className="secondary" onClick={()=>localDraft('save')}>Save draft</button><button className="secondary" onClick={()=>localDraft('restore')}>Restore draft</button></div><p className="hint">Your name, introduction, links, and wallet address will be public. This does not create an ENS name or send a transaction.</p><button disabled={!address||!draft.name.trim()||busy} onClick={()=>void save()}>{busy?'Saving…':'Save creator page'}</button><p role="status">{message}</p>{saved&&<Link className="ctaLink" href={`/profile/${address?.toLowerCase()}`}>View your page</Link>}</div><aside className={`card artworkPreview creatorTheme-${draft.design.theme} creatorFont-${draft.design.font}`}><p className="eyebrow">Public preview</p>{preview&&draft.bannerUrl&&<div className="creatorBanner"><ArtworkImage source={draft.bannerUrl} alt="Banner preview"/></div>}{preview&&draft.avatarUrl&&<div className="creatorAvatar"><ArtworkImage source={draft.avatarUrl} alt="Avatar preview"/></div>}<h2>{draft.name||'Your creator name'}</h2><p>{draft.bio||'Tell visitors about your work.'}</p><p className="receiptHash hint">{address||'Your connected wallet'}</p><p>Sections: {draft.design.modules.join(' → ')||'Introduction only'}</p></aside></div><details className="advancedTools"><summary>Optional identity tools</summary><Link href="/profile/setup?advanced=1">Link or manage an ENS identity</Link></details></section>;
}
