"use client";

import { useEffect, useState } from "react";
import {artworkSources} from "../components/profile/ArtworkImage";

export type NftMetadataPreview = {
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
};

type CachedPreview = NftMetadataPreview & {
  ts: number;
};

type MetadataPayload = {
  name?: string;
  title?: string;
  description?: string;
  image?: string;
  image_url?: string;
  imageUrl?: string;
  animation_url?: string;
  animationUrl?: string;
};

const PREVIEW_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function previewCacheKey(metadataUri: string | null | undefined, mediaUri: string | null | undefined, gateway: string): string {
  const metadataKey = metadataUri || "none";
  const mediaKey = mediaUri || "none";
  return `nftfactory:nft-preview:v2:${encodeURIComponent(gateway)}:${encodeURIComponent(metadataKey)}:${encodeURIComponent(mediaKey)}`;
}

function getFallbackPreview(mediaUri: string | null): NftMetadataPreview {
  return {
    name: null,
    description: null,
    imageUrl: looksLikeImageUrl(mediaUri) ? mediaUri : null,
    audioUrl: looksLikeAudioUrl(mediaUri) ? mediaUri : null
  };
}

function readCachedPreview(metadataUri: string | null, mediaUri: string | null, gateway: string): NftMetadataPreview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(previewCacheKey(metadataUri, mediaUri, gateway));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPreview;
    if (Date.now() - parsed.ts > PREVIEW_CACHE_TTL_MS) return null;
    return {
      name: parsed.name || null,
      description: parsed.description || null,
      imageUrl: parsed.imageUrl || null,
      audioUrl: parsed.audioUrl || null
    };
  } catch {
    return null;
  }
}

function writeCachedPreview(metadataUri: string | null, mediaUri: string | null, gateway: string, preview: NftMetadataPreview): void {
  if (typeof window === "undefined") return;
  const payload: CachedPreview = {
    ...preview,
    ts: Date.now()
  };
  try {
    window.localStorage.setItem(previewCacheKey(metadataUri, mediaUri, gateway), JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

export function ipfsToGatewayUrl(value: string | null | undefined, gateway: string): string | null {
  if (typeof value!=="string" || !value) return null;
  if (value.startsWith("ipfs://")) {
    return `${gateway.replace(/\/$/, "")}/${value.replace(/^ipfs:\/\/(?:ipfs\/)?/, "")}`;
  }
  try {const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

export function toDisplayAssetUrl(value: string | null | undefined, gateway: string): string | null {
  if (typeof value!=="string" || !value) return null;
  if (value.startsWith("ipfs://")) {
    return ipfsToGatewayUrl(value, gateway);
  }
  try {const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

export function looksLikeImageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value) || value.includes("/ipfs/");
}

export function looksLikeAudioUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(value);
}

export async function resolveNftMetadataPreview(params: {
  metadataUri: string | null | undefined;
  mediaUri: string | null | undefined;
  gateway: string;
}): Promise<NftMetadataPreview> {
  const gateway = params.gateway.replace(/\/$/, "");
  const metadataUrl = ipfsToGatewayUrl(params.metadataUri, gateway);
  const mediaUrl = ipfsToGatewayUrl(params.mediaUri, gateway);
  const fallback = getFallbackPreview(mediaUrl);
  const cached = readCachedPreview(metadataUrl, mediaUrl, gateway);
  if (cached) return cached;

  if (!metadataUrl) {
    return fallback;
  }

  try {
    let response:Response|undefined;
    for(const url of artworkSources(metadataUrl)) {
      try {const candidate=await fetch(url,{credentials:"omit",redirect:"error",signal:AbortSignal.timeout(8000)});if(candidate.ok){response=candidate;break;}}catch{/* Try the configured replica. */}
    }
    if(!response)return fallback;
    if (!response.ok) {
      writeCachedPreview(metadataUrl, mediaUrl, gateway, fallback);
      return fallback;
    }

    if(Number(response.headers.get("content-length")||0)>524288)throw new Error("Metadata too large.");
    const reader=response.body?.getReader();if(!reader)return fallback;
    const chunks:Uint8Array[]=[];let length=0;
    try {while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>524288)throw new Error("Metadata too large.");chunks.push(chunk.value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const raw=JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;
    const text=(value:unknown,max:number)=>typeof value==="string"?value.slice(0,max):undefined;
    const metadata:MetadataPayload={name:text(raw.name,160),title:text(raw.title,160),description:text(raw.description,4000),image:text(raw.image||raw.image_url||raw.imageUrl,4096),animation_url:text(raw.animation_url||raw.animationUrl,4096)};
    const resolved: NftMetadataPreview = {
      name: metadata.name || metadata.title || null,
      description: metadata.description || null,
      imageUrl:
        fallback.imageUrl ||
        toDisplayAssetUrl(metadata.image || metadata.image_url || metadata.imageUrl || null, gateway),
      audioUrl:
        fallback.audioUrl ||
        toDisplayAssetUrl(metadata.animation_url || metadata.animationUrl || null, gateway)
    };

    writeCachedPreview(metadataUrl, mediaUrl, gateway, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}

export function useNftMetadataPreview(params: {
  metadataUri: string | null | undefined;
  mediaUri: string | null | undefined;
  gateway: string;
}): NftMetadataPreview {
  const gateway = params.gateway.replace(/\/$/, "");
  const metadataUri = params.metadataUri || null;
  const mediaUri = params.mediaUri || null;
  const [preview, setPreview] = useState<NftMetadataPreview>(() => {
    const metadataUrl = ipfsToGatewayUrl(metadataUri, gateway);
    const mediaUrl = ipfsToGatewayUrl(mediaUri, gateway);
    return readCachedPreview(metadataUrl, mediaUrl, gateway) || getFallbackPreview(mediaUrl);
  });

  useEffect(() => {
    let cancelled = false;
    const metadataUrl = ipfsToGatewayUrl(metadataUri, gateway);
    const mediaUrl = ipfsToGatewayUrl(mediaUri, gateway);
    const cached = readCachedPreview(metadataUrl, mediaUrl, gateway);
    if (cached) {
      setPreview(cached);
    } else {
      setPreview(getFallbackPreview(mediaUrl));
    }

    void resolveNftMetadataPreview({ metadataUri, mediaUri, gateway }).then((nextPreview) => {
      if (!cancelled) {
        setPreview(nextPreview);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [gateway, mediaUri, metadataUri]);

  return preview;
}
