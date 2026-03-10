type EnvLike = Record<string, string | undefined>;

export function buildIpfsAddUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();
  if (!normalized) {
    throw new Error("IPFS_API_URL is required.");
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.endsWith("/api/v0/add")) {
    url.pathname = pathname;
  } else if (pathname.endsWith("/api/v0")) {
    url.pathname = `${pathname}/add`;
  } else {
    url.pathname = `${pathname}/api/v0/add`;
  }

  if (!url.searchParams.has("pin")) {
    url.searchParams.set("pin", "true");
  }
  if (!url.searchParams.has("cid-version")) {
    url.searchParams.set("cid-version", "1");
  }
  if (!url.searchParams.has("wrap-with-directory")) {
    url.searchParams.set("wrap-with-directory", "false");
  }

  return url.toString();
}

export function buildIpfsAuthHeaders(env: EnvLike = process.env): HeadersInit {
  const bearerToken = String(env.IPFS_API_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const username = String(env.IPFS_API_BASIC_AUTH_USERNAME || "").trim();
  const password = String(env.IPFS_API_BASIC_AUTH_PASSWORD || "").trim();

  if (!username && !password) {
    return {};
  }
  if (!username || !password) {
    throw new Error("IPFS API basic auth requires both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD.");
  }

  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
  };
}

type IpfsAddResponse = {
  Hash?: string;
};

export function parseIpfsAddResponse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("IPFS add response was empty.");
  }

  const tryParse = (value: string): string | null => {
    try {
      const payload = JSON.parse(value) as IpfsAddResponse;
      return payload.Hash?.trim() || null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) {
    return direct;
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const hash = tryParse(lines[index]);
    if (hash) {
      return hash;
    }
  }

  throw new Error("IPFS add response missing Hash.");
}
