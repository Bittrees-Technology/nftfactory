'use client';
import {useEffect,useState} from 'react';
import {useAccount} from 'wagmi';
import {SharedProfileCard} from '../../../../shared/sso/SharedProfileCard.jsx';
import {readWalletSession,subscribeWalletSession} from '../../lib/walletSession';
export default function SharedBittreesProfile(){
 const {address}=useAccount(),[verified,setVerified]=useState<string|null>(null);
 useEffect(()=>{
  let active=true,generation=0;
  async function refresh(){const version=++generation;setVerified(null);if(!address||document.hidden)return;try{const session=await readWalletSession();if(active&&version===generation&&session.address?.toLowerCase()===address.toLowerCase())setVerified(address.toLowerCase());}catch{}}
  void refresh();const unsubscribe=subscribeWalletSession(()=>void refresh()),timer=setInterval(refresh,30000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;++generation;unsubscribe();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[address]);
 return <SharedProfileCard sessionRevision={verified===address?.toLowerCase()?verified:null}/>;
}
