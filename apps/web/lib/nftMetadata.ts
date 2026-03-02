"use client";

import { useEffect, useState } from "react";

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
  return `nftfactory:nft-preview:v1:${encodeURIComponent(gateway)}:${encodeURIComponent(metadataKey)}:${encodeURIComponent(mediaKey)}`;
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
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    return `${gateway.replace(/\/$/, "")}/${value.replace(/^ipfs:\/\//, "")}`;
  }
  return value;
}

export function toDisplayAssetUrl(value: string | null | undefined, gateway: string): string | null {
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    return ipfsToGatewayUrl(value, gateway);
  }
  return value;
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
    writeCachedPreview(metadataUrl, mediaUrl, gateway, fallback);
    return fallback;
  }

  try {
    const response = await fetch(metadataUrl);
    if (!response.ok) {
      writeCachedPreview(metadataUrl, mediaUrl, gateway, fallback);
      return fallback;
    }

    const metadata = (await response.json()) as MetadataPayload;
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
    writeCachedPreview(metadataUrl, mediaUrl, gateway, fallback);
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
