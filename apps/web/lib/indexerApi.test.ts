import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProfileDirectory, type ApiProfileDirectoryResponse } from "./indexerApi";

const originalFetch = global.fetch;

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
  vi.restoreAllMocks();
});

describe("indexerApi", () => {
  it("loads the public profile directory through the same-origin proxy by default", async () => {
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
});
