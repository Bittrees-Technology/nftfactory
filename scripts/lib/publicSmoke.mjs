import { isTruthyEnvFlag, resolveReleaseWebBaseUrl } from "./runtimeHealth.mjs";

const REQUIRED_SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()"
});

export function resolveReleaseSmokeBasicAuth(env = process.env) {
  const password = String(env.RELEASE_SMOKE_BASIC_AUTH_PASSWORD || env.SITE_BASIC_AUTH_PASSWORD || "").trim();
  const username = String(env.RELEASE_SMOKE_BASIC_AUTH_USERNAME || env.SITE_BASIC_AUTH_USERNAME || "viewer").trim() || "viewer";

  return {
    username,
    password,
    enabled: password.length > 0
  };
}

export function buildBasicAuthHeader(username, password) {
  const normalizedPassword = String(password || "");
  if (!normalizedPassword) {
    return null;
  }

  const normalizedUsername = String(username || "viewer") || "viewer";
  return `Basic ${Buffer.from(`${normalizedUsername}:${normalizedPassword}`).toString("base64")}`;
}

export function buildPublicSmokeChecks(env = process.env) {
  const baseUrl = resolveReleaseWebBaseUrl(env);
  if (!baseUrl) {
    return [];
  }

  const checks = [
    { label: "page:/", path: "/", expectedContentType: "text/html" },
    { label: "page:/mint", path: "/mint", expectedContentType: "text/html" },
    { label: "page:/discover", path: "/discover", expectedContentType: "text/html" },
    { label: "page:/profile", path: "/profile", expectedContentType: "text/html" },
    { label: "page:/profile/setup", path: "/profile/setup", expectedContentType: "text/html" },
    { label: "api:/api/profiles", path: "/api/profiles", expectedContentType: "application/json" }
  ];

  const profileRouteName = String(env.RELEASE_PROFILE_ROUTE_NAME || "").trim();
  if (profileRouteName) {
    checks.push({
      label: `page:/profile/${profileRouteName}`,
      path: `/profile/${encodeURIComponent(profileRouteName)}`,
      expectedContentType: "text/html"
    });
  }

  if (isTruthyEnvFlag(env.RELEASE_INCLUDE_PROFILE_MODERATION)) {
    checks.push({
      label: "page:/profile/moderation",
      path: "/profile/moderation",
      expectedContentType: "text/html"
    });
  }

  return checks;
}

export function validatePublicSmokeSecurityHeaders({ response, requireStrictTransportSecurity = false }) {
  for (const [name, expectedValue] of Object.entries(REQUIRED_SECURITY_HEADERS)) {
    const actualValue = String(response.headers.get(name) || "");
    if (!actualValue) {
      return `Missing security header: ${name}`;
    }
    if (actualValue !== expectedValue) {
      return `Unexpected security header value for ${name}: ${actualValue}`;
    }
  }

  if (requireStrictTransportSecurity) {
    const strictTransportSecurity = String(response.headers.get("strict-transport-security") || "");
    if (!strictTransportSecurity) {
      return "Missing security header: strict-transport-security";
    }
    if (!strictTransportSecurity.toLowerCase().includes("max-age=")) {
      return `Unexpected security header value for strict-transport-security: ${strictTransportSecurity}`;
    }
  }

  return null;
}

export function validatePublicSmokeResponse({ expectedContentType, response, bodyText }) {
  if (!response.ok) {
    return `HTTP ${response.status}`;
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes(expectedContentType)) {
    return `Unexpected content-type: ${contentType || "missing"} (expected ${expectedContentType})`;
  }

  const trimmedBody = String(bodyText || "").trim();
  if (!trimmedBody) {
    return "Response body was empty.";
  }

  if (expectedContentType === "application/json") {
    try {
      JSON.parse(trimmedBody);
    } catch {
      return "Response body was not valid JSON.";
    }
  }

  return null;
}
