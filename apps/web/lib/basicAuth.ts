type EnvLike = Record<string, string | undefined>;

const DEFAULT_BASIC_AUTH_USERNAME = "viewer";
const DISABLED_FLAGS = new Set(["0", "false", "off", "disabled", "no"]);

export type BasicAuthConfig = {
  enabled: boolean;
  misconfigured: boolean;
  username: string;
  password: string;
};

export type BasicAuthCredentials = {
  username: string;
  password: string;
};

export function resolveBasicAuthConfig(env: EnvLike = process.env): BasicAuthConfig {
  const password = String(env.SITE_BASIC_AUTH_PASSWORD || "").trim();
  const configuredUsername = String(env.SITE_BASIC_AUTH_USERNAME || "").trim();
  const username = configuredUsername || DEFAULT_BASIC_AUTH_USERNAME;
  const enabledFlag = String(env.SITE_BASIC_AUTH_ENABLED || "").trim().toLowerCase();
  const explicitlyDisabled = DISABLED_FLAGS.has(enabledFlag);
  const explicitlyEnabled = enabledFlag.length > 0 && !explicitlyDisabled;
  const enabled = explicitlyDisabled ? false : explicitlyEnabled || password.length > 0;

  return {
    enabled,
    misconfigured: enabled && password.length === 0,
    username,
    password
  };
}

export function buildBasicAuthChallenge(realm = "NFTFactory"): string {
  return `Basic realm="${realm}", charset="UTF-8"`;
}

function decodeBase64(value: string): string {
  if (typeof atob === "function") {
    return atob(value);
  }
  return Buffer.from(value, "base64").toString("utf8");
}

export function parseBasicAuthHeader(header: string | null | undefined): BasicAuthCredentials | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) {
    return null;
  }

  try {
    const decoded = decodeBase64(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

export function isAuthorizedBasicAuth(
  header: string | null | undefined,
  env: EnvLike = process.env
): boolean {
  const config = resolveBasicAuthConfig(env);
  if (!config.enabled) {
    return true;
  }
  if (config.misconfigured) {
    return false;
  }

  const credentials = parseBasicAuthHeader(header);
  return credentials?.username === config.username && credentials.password === config.password;
}
