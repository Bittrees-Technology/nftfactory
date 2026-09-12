'use client';
import {useEffect,useState} from 'react';
import {useNftMetadataPreview,toDisplayAssetUrl} from './nftMetadata';
import type {RecoveredMetadata} from '../../../packages/profile/metadata-fallback.mjs';
export function useArtworkMetadata(params:{chainId:number;contract:string;tokenId:string;metadataUri?:string|null;mediaUri?:string|null;gateway:string}){
 const original=useNftMetadataPreview({...params,metadataUri:params.metadataUri,mediaUri:params.mediaUri});const [recovered,setRecovered]=useState<RecoveredMetadata|null>(null);
 useEffect(()=>{setRecovered(null);if(original.name&&original.imageUrl)return;const controller=new AbortController();const q=new URLSearchParams({chainId:String(params.chainId),contract:params.contract,tokenId:params.tokenId});
 fetch(`/api/artwork/metadata?${q}`,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!controller.signal.aborted)setRecovered(data?.metadata||null);}).catch(()=>{});return()=>controller.abort();
 },[params.chainId,params.contract,params.tokenId,original.name,original.imageUrl]);
 const used=Boolean(recovered&&(!original.name||!original.imageUrl));
 return {...original,name:original.name||recovered?.name||null,description:original.description||recovered?.description||null,imageUrl:original.imageUrl||toDisplayAssetUrl(recovered?.imageUrl,params.gateway),source:used?recovered?.source:null,sourceUrl:used?recovered?.sourceUrl:undefined};
}
