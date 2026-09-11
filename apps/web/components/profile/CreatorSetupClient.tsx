'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import HeaderWalletButton from '../HeaderWalletButton';
import { ensureWalletSession } from '../../lib/walletSession';
export default function CreatorSetupClient() {
  const { address } = useAccount(); const { data: wallet } = useWalletClient();
  const [name,setName] = useState(''); const [bio,setBio] = useState(''); const [busy,setBusy] = useState(false); const [message,setMessage] = useState(''); const [saved,setSaved] = useState(false);
  useEffect(()=> { if (!address) return; try { const value = JSON.parse(localStorage.getItem(`creator-draft:${address.toLowerCase()}`) || '{}'); setName(value.name || ''); setBio(value.bio || ''); } catch { /* Private browsing may disable draft storage. */ } setSaved(false); },[address]);
  async function save() {
    if (!address || !wallet || busy) return;
    setBusy(true); setMessage('Confirm wallet sign-in to save your public page.');
    try {
      try { localStorage.setItem(`creator-draft:${address.toLowerCase()}`,JSON.stringify({name,bio})); } catch { /* Saving the public page does not depend on browser storage. */ }
      await ensureWalletSession(address,args=>wallet.signMessage(args));
      const response = await fetch('/api/indexer/api/profiles/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'wallet',name:address.toLowerCase(),ownerAddress:address.toLowerCase(),displayName:name.trim(),bio:bio.trim(),layoutMode:'default'})});
      const payload = await response.json(); if(!response.ok) throw new Error(payload.error || 'Your page could not be saved.');
      setSaved(true); setMessage('Your creator page is ready to share.');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Your page could not be saved. Please retry.'); } finally { setBusy(false); }
  }
  return <section className="studioPage"><header className="pageHeading"><p className="eyebrow">Your creator page</p><h1>A home for your work.</h1><p>Choose a display name and a short introduction. ENS is optional.</p></header><div className="createLayout"><div className="card formCard"><h2>About you</h2>{!address && <><p>Connect the wallet that owns your work.</p><HeaderWalletButton /></>}<label>Display name<input value={name} maxLength={80} onChange={e=>{setName(e.target.value);setSaved(false);}} /></label><label>About your work<textarea value={bio} maxLength={1200} onChange={e=>{setBio(e.target.value);setSaved(false);}} /></label><p className="hint">Your name, introduction, and wallet address will be public. This does not create an ENS name or send a transaction.</p><button disabled={!address || !name.trim() || busy} onClick={()=>void save()}>{busy?'Saving…':'Save creator page'}</button><p role="status">{message}</p>{saved && <Link className="ctaLink" href={`/profile/${address?.toLowerCase()}`}>View your page</Link>}</div><aside className="card artworkPreview"><p className="eyebrow">Public preview</p><h2>{name || 'Your creator name'}</h2><p>{bio || 'Tell visitors about your work.'}</p><p className="receiptHash hint">{address || 'Your connected wallet'}</p></aside></div><details className="advancedTools"><summary>Optional identity tools</summary><Link href="/profile/setup?advanced=1">Link or manage an ENS identity</Link></details></section>;
}
