'use client';
import { useState } from 'react';

export function artworkSources(source: string, primary = process.env.NEXT_PUBLIC_IPFS_GATEWAY, replica = process.env.NEXT_PUBLIC_IPFS_REPLICA_GATEWAY) {
  const path = source.startsWith('ipfs://') ? source.slice(7) : source.match(/\/ipfs\/([^?#]+)/)?.[1];
  const gateways = path && /^[a-zA-Z0-9]+(?:\/[^?#]*)?$/.test(path)
    ? [primary, replica].filter(Boolean).map(gateway => `${gateway!.replace(/\/$/, '').replace(/\/ipfs$/, '')}/ipfs/${path}`)
    : [];
  return [...new Set([...gateways, source].filter(url => /^https:\/\//i.test(url)))];
}

export default function ArtworkImage({ source, alt }: { source: string; alt: string }) {
  const sources = artworkSources(source);
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find(url => !failed.includes(url));
  return src ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(previous => [...previous, src])} />
    : <div className="artworkPlaceholder" role="status">Artwork preview temporarily unavailable</div>;
}
