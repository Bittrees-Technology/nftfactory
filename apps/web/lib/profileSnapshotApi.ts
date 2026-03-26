import type { ApiProfileViewResponse } from "./profileViewApi";

export type ApiProfileSnapshotEntry =
  | string
  | {
      url?: string;
      generatedAt?: string;
      sourceUrl?: string;
    };

export type ApiProfileSnapshotManifest =
  | {
      profiles?: Record<string, ApiProfileSnapshotEntry>;
    }
  | Record<string, ApiProfileSnapshotEntry>;

const PROFILE_SNAPSHOT_TIMEOUT_MS = 8_000;

function withTimeout(timeoutMs = PROFILE_SNAPSHOT_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout)
  };
}

function parseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return `Profile snapshot request timed out after ${PROFILE_SNAPSHOT_TIMEOUT_MS}ms`;
    }
    return error.message || fallback;
  }
  return fallback;
}

function normalizeNameKey(value: string): string {
  return decodeURIComponent(String(value || "")).trim().toLowerCase();
}

function getSnapshotManifestUrl(): string | undefined {
  const value = String(process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL || "").trim();
  return value || undefined;
}

function getSnapshotUrlTemplate(): string | undefined {
  const value = String(process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE || "").trim();
  return value || undefined;
}

export function hasProfileSnapshotFallbackConfigured(): boolean {
  return Boolean(getSnapshotManifestUrl() || getSnapshotUrlTemplate());
}

async function fetchJsonWithTimeout<T>(url: string, fallbackMessage: string): Promise<T> {
  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${fallbackMessage} (${response.status})`);
    }
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(parseErrorMessage(error, fallbackMessage));
  } finally {
    cleanup();
  }
}

function resolveSnapshotEntryUrl(entry: ApiProfileSnapshotEntry | undefined): string | null {
  if (!entry) return null;
  if (typeof entry === "string") {
    const value = entry.trim();
    return value || null;
  }
  const value = String(entry.url || "").trim();
  return value || null;
}

async function resolveProfileSnapshotUrl(name: string): Promise<string | null> {
  const template = getSnapshotUrlTemplate();
  if (template) {
    return template.includes("{name}") ? template.replaceAll("{name}", encodeURIComponent(name)) : template;
  }

  const manifestUrl = getSnapshotManifestUrl();
  if (!manifestUrl) {
    return null;
  }

  const manifest = await fetchJsonWithTimeout<ApiProfileSnapshotManifest>(manifestUrl, "Failed to load profile snapshot manifest.");
  const profiles = (("profiles" in manifest && manifest.profiles ? manifest.profiles : manifest) as Record<string, ApiProfileSnapshotEntry>);
  const normalizedName = normalizeNameKey(name);
  const directEntry = resolveSnapshotEntryUrl(profiles[normalizedName] || profiles[name]);
  if (directEntry) {
    return directEntry;
  }

  for (const [key, value] of Object.entries(profiles)) {
    if (normalizeNameKey(key) === normalizedName) {
      const resolved = resolveSnapshotEntryUrl(value);
      if (resolved) return resolved;
    }
  }

  return null;
}

function isProfileViewPayload(value: unknown): value is ApiProfileViewResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && Array.isArray(record.activeSellerAddresses) && Array.isArray(record.listings);
}

export async function fetchProfileViewSnapshot(name: string): Promise<ApiProfileViewResponse | null> {
  const snapshotUrl = await resolveProfileSnapshotUrl(name);
  if (!snapshotUrl) {
    return null;
  }

  const payload = await fetchJsonWithTimeout<unknown>(snapshotUrl, "Failed to load profile snapshot.");
  if (isProfileViewPayload(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && "profileView" in payload) {
    const profileView = (payload as { profileView?: unknown }).profileView;
    if (isProfileViewPayload(profileView)) {
      return profileView;
    }
  }

  throw new Error("Profile snapshot payload is invalid.");
}
