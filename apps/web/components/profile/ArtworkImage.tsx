'use client';
import { useEffect, useRef, useState } from 'react';

export function artworkSources(source: string, primary = process.env.NEXT_PUBLIC_IPFS_GATEWAY, replica = process.env.NEXT_PUBLIC_IPFS_REPLICA_GATEWAY) {
  const path = source.startsWith('ipfs://') ? source.slice(7).replace(/^ipfs\//,'') : source.match(/\/ipfs\/([^?#]+)/)?.[1];
  const gateways = path && /^[a-zA-Z0-9]+(?:\/[^?#]*)?$/.test(path)
    ? [primary, replica].filter(Boolean).map(gateway => `${gateway!.replace(/\/$/, '').replace(/\/ipfs$/, '')}/ipfs/${path}`)
    : [];
  const publicSource=path&&/^[a-zA-Z0-9]+(?:\/[^?#]*)?$/.test(path)?(path.startsWith('b')?`https://${path.split('/')[0]}.ipfs.dweb.link/${path.split('/').slice(1).join('/')}`:`https://ipfs.io/ipfs/${path}`):'';
  return [...new Set([...gateways, source, publicSource].filter(url => /^https:\/\//i.test(url)))];
}

export default function ArtworkImage({ source, alt }: { source: string; alt: string }) {
  const image=useRef<HTMLImageElement>(null);
  const [loaded,setLoaded]=useState('');
  const sources = artworkSources(source);
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find(url => !failed.includes(url));
  useEffect(()=>{
    if(!src||loaded===src)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const start=()=>{if(timer)return;timer=setTimeout(()=>setFailed(previous=>previous.includes(src)?previous:[...previous,src]),8000);};
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))start();},{rootMargin:'200px'}):null;
    if(observer&&image.current)observer.observe(image.current.parentElement||image.current);else start();
    return()=>{observer?.disconnect();if(timer)clearTimeout(timer);};
  },[src,loaded]);
  return src ? <img ref={image} onLoad={()=>setLoaded(src)} src={src} alt={alt} loading="lazy" onError={() => setFailed(previous => [...previous, src])} />
    : <div className="artworkPlaceholder" role="status">Artwork preview temporarily unavailable</div>;
}
