import { isTruthyEnvFlag, resolveReleaseWebBaseUrl } from "./runtimeHealth.mjs";

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
