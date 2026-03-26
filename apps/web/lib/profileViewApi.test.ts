import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProfileView, type ApiProfileViewResponse } from "./profileViewApi";

const originalFetch = global.fetch;
const originalSnapshotManifestUrl = process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL;
const originalSnapshotUrlTemplate = process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE;

function buildProfileViewResponse(name = "demo"): ApiProfileViewResponse {
  return {
    name,
    resolution: null,
    resolutionFailures: [],
    resolutionError: null,
    activeSellerAddresses: [],
    listings: [],
    listingFailures: [],
    listingError: null,
    hiddenListingRecordIds: [],
    hiddenListingFailures: [],
    hiddenListingError: null,
    offers: [],
    offerFailures: [],
    offerError: null,
    holdings: [],
    holdingsFailures: [],
    holdingsError: null
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  if (originalSnapshotManifestUrl === undefined) {
    delete process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL;
  } else {
    process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL = originalSnapshotManifestUrl;
  }
  if (originalSnapshotUrlTemplate === undefined) {
    delete process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE;
  } else {
    process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE = originalSnapshotUrlTemplate;
  }
  vi.restoreAllMocks();
});

describe("profileViewApi", () => {
  it("falls back to a template-driven snapshot when the live profile view fails", async () => {
    process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE = "https://snapshots.example/{name}.json";
    const snapshotPayload = buildProfileViewResponse("demo");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/profile/view/")) {
        throw new TypeError("fetch failed");
      }
      if (url === "https://snapshots.example/demo.json") {
        return new Response(JSON.stringify({ profileView: snapshotPayload }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(fetchProfileView("demo")).resolves.toEqual(snapshotPayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back through a manifest-mapped snapshot URL", async () => {
    process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL = "https://snapshots.example/manifest.json";
    const snapshotPayload = buildProfileViewResponse("demo");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/profile/view/")) {
        return new Response("Indexer unavailable", { status: 503 });
      }
      if (url === "https://snapshots.example/manifest.json") {
        return new Response(
          JSON.stringify({
            profiles: {
              demo: {
                url: "https://gateway.example/demo.profile.snapshot.json"
              }
            }
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
      if (url === "https://gateway.example/demo.profile.snapshot.json") {
        return new Response(JSON.stringify({ profileView: snapshotPayload }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(fetchProfileView("demo")).resolves.toEqual(snapshotPayload);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves the live request error when no snapshot fallback is configured", async () => {
    delete process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL;
    delete process.env.NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE;
    global.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    await expect(fetchProfileView("demo")).rejects.toThrow("fetch failed");
  });
});
