import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCollectionTokens,
  fetchCollectionsByOwner,
  fetchProfileDirectory,
  type ApiCollectionTokens,
  type ApiOwnedCollections,
  type ApiProfileDirectoryResponse
} from "./indexerApi";

const originalFetch = global.fetch;
const originalWindow = global.window;

function buildDirectoryResponse(): ApiProfileDirectoryResponse {
  return {
    ownerAddress: null,
    total: 1,
    nextCursor: 1,
    canLoadMore: false,
    profiles: [],
    filters: {
      q: "",
      source: null,
      layoutMode: null,
      hasCollection: null,
      sort: "popular",
      limit: 24,
      cursor: 0
    }
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  vi.restoreAllMocks();
});

describe("indexerApi", () => {
  it("loads the public profile directory through the same-origin proxy by default", async () => {
    global.window = {} as typeof window;
    const payload = buildDirectoryResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/profiles");
      expect(url).toContain("sort=popular");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(fetchProfileDirectory({ sort: "popular", limit: 24 })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads collection tokens through the same-origin proxy with chain routing", async () => {
    global.window = {} as typeof window;
    const payload: ApiCollectionTokens = {
      contractAddress: "0x1234",
      count: 1,
      tokens: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/indexer/api/collections/0x1234/tokens");
      expect(url).toContain("sync=1");
      expect(url).toContain("_chainId=11155111");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(fetchCollectionTokens("0x1234", { chainId: 11155111, sync: true })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads owned collections through the same-origin proxy with chain routing", async () => {
    global.window = {} as typeof window;
    const payload: ApiOwnedCollections = {
      ownerAddress: "0xabc",
      collections: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/indexer/api/collections");
      expect(url).toContain("owner=0xabc");
      expect(url).toContain("_chainId=11155111");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(fetchCollectionsByOwner("0xabc", { chainId: 11155111 })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
