import { isPrivateOrLocalUrl } from "./ipfsUpload";

type BackendFetchErrorOptions = {
  serviceLabel: string;
  envVarName: string;
  baseUrl?: string;
};

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

function isLikelyFetchFailure(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes("fetch failed") || message.includes("failed to fetch");
}

function looksLikeHtmlDocument(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<head") ||
    normalized.includes("<body")
  );
}

function looksLikeCloudflareTunnelError(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("cloudflare tunnel error") ||
    (normalized.includes("cloudflare") && normalized.includes("error 1033")) ||
    normalized.includes("configured as a cloudflare tunnel")
  );
}

export function normalizeBackendFetchError(error: unknown, options: BackendFetchErrorOptions): Error {
  const { serviceLabel, envVarName, baseUrl } = options;

  if (baseUrl && isPrivateOrLocalUrl(baseUrl)) {
    return new Error(
      `${serviceLabel} ${baseUrl} is not reachable from this deployment. Set ${envVarName} to a public HTTP(S) endpoint.`
    );
  }

  if (isLikelyFetchFailure(error)) {
    return new Error(
      `${serviceLabel} request failed. Verify ${envVarName} points to a reachable public HTTP(S) endpoint and the service is online.`
    );
  }

  return error instanceof Error ? error : new Error(extractErrorMessage(error) || `${serviceLabel} request failed.`);
}

export function sanitizeBackendErrorMessage(
  rawText: string,
  fallbackMessage: string,
  options?: {
    serviceLabel?: string;
  }
): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return fallbackMessage;
  }
  if (looksLikeCloudflareTunnelError(trimmed)) {
    return `${options?.serviceLabel || "Backend service"} is temporarily unavailable because the upstream tunnel is down.`;
  }
  if (looksLikeHtmlDocument(trimmed)) {
    return fallbackMessage;
  }
  if (trimmed.length > 300) {
    return `${trimmed.slice(0, 297)}...`;
  }
  return trimmed;
}

export function parseJsonResponse<T>(text: string, fallbackMessage: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
