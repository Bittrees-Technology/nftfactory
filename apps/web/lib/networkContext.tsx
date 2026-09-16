'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState,useRef,type ReactNode} from 'react';
import {setSelectedNetworkId} from './networkSelection';
import {useAccount} from 'wagmi';
import {getAppChain,getPrimaryAppChainId,getReadableAppChainIds} from './chains';
const storageKey='nftfactory:selected-network';
export function getToolbarChains(){return getReadableAppChainIds().map(getAppChain);}
type NetworkState={chainId:number;selectNetwork:(chainId:number)=>void};
const NetworkContext=createContext<NetworkState|null>(null);
export function NetworkProvider({children}:{children:ReactNode}){
 const [chainId,setChainId]=useState(getPrimaryAppChainId);
 const {chainId:walletChain,address}=useAccount();
 const explicitSelection=useRef(false);
 const previousWallet=useRef<string|undefined>(undefined);
 const applyNetwork=useCallback((next:number)=>{
  if(!getReadableAppChainIds().includes(next))return;
  setSelectedNetworkId(next);setChainId(next);try{localStorage.setItem(storageKey,String(next));}catch{/* Session selection works without storage. */}
 },[]);
 const selectNetwork=useCallback((next:number)=>{explicitSelection.current=true;applyNetwork(next);},[applyNetwork]);
 useEffect(()=>{if(explicitSelection.current)return;try{const saved=Number(localStorage.getItem(storageKey));if(saved)applyNetwork(saved);}catch{}},[applyNetwork]);
 useEffect(()=>{
  const previous=previousWallet.current;previousWallet.current=`${address||''}:${walletChain||''}`;
  if(address&&walletChain&&(previous!==undefined||!explicitSelection.current))applyNetwork(walletChain);
 },[address,walletChain,applyNetwork]);
 const value=useMemo(()=>({chainId,selectNetwork}),[chainId,selectNetwork]);
 return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}
export function useNetwork(){
 const context=useContext(NetworkContext);
 return context;
}
export function useSelectedNetwork(initialChainId?:number){
 const context=useNetwork();const select=context?.selectNetwork;
 // Explicit collection links choose the viewing network, never switch a wallet.
 useEffect(()=>{if(initialChainId!==undefined)select?.(initialChainId);},[initialChainId,select]);
 return context?.chainId??initialChainId??getPrimaryAppChainId();
}
