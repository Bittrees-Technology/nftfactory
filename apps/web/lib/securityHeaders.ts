export const BASE_SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()"
});

export const STRICT_TRANSPORT_SECURITY_HEADER = "max-age=31536000; includeSubDomains";
export const BASIC_AUTH_CACHE_CONTROL_HEADER = "private, no-store, max-age=0";
export const BASIC_AUTH_ROBOTS_HEADER = "noindex, nofollow, noarchive";

export type SecurityHeaderOptions = {
  basicAuthEnabled?: boolean;
  production?: boolean;
};

function mergeVaryHeader(existing: string | null, value: string): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const part of String(existing || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const normalized = part.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(part);
  }

  const normalizedValue = value.toLowerCase();
  if (!seen.has(normalizedValue)) {
    merged.push(value);
  }

  return merged.join(", ");
}

export function applySecurityHeaders(
  headers: Pick<Headers, "get" | "set">,
  options: SecurityHeaderOptions = {}
): void {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (options.production) {
    headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY_HEADER);
  }

  if (!options.basicAuthEnabled) {
    return;
  }

  headers.set("Cache-Control", BASIC_AUTH_CACHE_CONTROL_HEADER);
  headers.set("Pragma", "no-cache");
  headers.set("X-Robots-Tag", BASIC_AUTH_ROBOTS_HEADER);
  headers.set("Vary", mergeVaryHeader(headers.get("Vary"), "Authorization"));
}
