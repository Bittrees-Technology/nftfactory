'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useAccount} from 'wagmi';
const tools=[
 {id:'page',title:'Your creator page',description:'Choose artwork, imagery, and a style that feels like you.',href:'/profile/setup'},
 {id:'import',title:'Import artwork',description:'Add NFTs you already own without moving them.',href:'/profile/import'},
 {id:'listings',title:'Your listings',description:'Offer artwork for sale or cancel an existing listing.',href:'/profile/listings'},
 {id:'marketplace',title:'Marketplace',description:'Discover fixed-price artwork from other creators.',href:'/marketplace'}
];
const defaults=()=>tools.map(tool=>tool.id);
export default function StudioWorkspaceClient(){
 const {address}=useAccount();
 const [order,setOrder]=useState(defaults),[editing,setEditing]=useState(false),[message,setMessage]=useState('');
 const key=`nftfactory:studio-layout:${address?.toLowerCase()||'visitor'}`;
 useEffect(()=>{setMessage('');setEditing(false);try{const saved=JSON.parse(localStorage.getItem(key)||'null');setOrder(Array.isArray(saved)?[...new Set(saved.filter(id=>tools.some(tool=>tool.id===id))),...defaults().filter(id=>!saved.includes(id))]:defaults());}catch{setOrder(defaults());}},[key]);
 function save(next:string[]){setOrder(next);try{localStorage.setItem(key,JSON.stringify(next));setMessage('Studio arrangement saved on this device. Your public page is unchanged.');}catch{setMessage('Device storage is unavailable. This arrangement lasts until you leave.');}}
 return <section className="studioWorkspace"><div className="row"><h2>Your workspace</h2><button className="secondary" onClick={()=>setEditing(!editing)}>{editing?'Done arranging':'Arrange workspace'}</button>{editing&&<button className="secondary" onClick={()=>save(defaults())}>Reset order</button>}</div><p className="hint">Arrange these tools for yourself. Customize your public creator page separately.</p><div className="studioToolGrid">{order.map((id,index)=>{const tool=tools.find(tool=>tool.id===id)!;return <article className="card studioTool" key={id}><h3><Link href={tool.href}>{tool.title}</Link></h3><p>{tool.description}</p>{editing&&<div className="row"><button className="secondary" disabled={index===0} aria-label={`Move ${tool.title} earlier`} onClick={()=>{const next=[...order];[next[index-1],next[index]]=[next[index],next[index-1]];save(next);}}>Move earlier</button><button className="secondary" disabled={index===order.length-1} aria-label={`Move ${tool.title} later`} onClick={()=>{const next=[...order];[next[index+1],next[index]]=[next[index],next[index+1]];save(next);}}>Move later</button></div>}</article>;})}</div><p role="status">{message}</p></section>;
}
