import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCollectionContract } from "./collectionVerificationApi";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("collectionVerificationApi", () => {
  it("parses a successful verification response", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          state: "verified",
          message: "Collection contract verified on the explorer.",
          explorerUrl: "https://example.com/address/0x123#code"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    ) as typeof fetch;

    await expect(
      verifyCollectionContract({
        chainId: 11155111,
        collectionAddress: "0xeD8F6de4Cc63D4349042D1F9051a7E0882E9eB10",
        standard: "ERC721"
      })
    ).resolves.toMatchObject({
      state: "verified"
    });
  });

  it("surfaces the backend error field instead of raw JSON", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "ETHERSCAN_API_KEY is not configured for this deployment." }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      })
    ) as typeof fetch;

    await expect(
      verifyCollectionContract({
        chainId: 11155111,
        collectionAddress: "0xeD8F6de4Cc63D4349042D1F9051a7E0882E9eB10",
        standard: "ERC721"
      })
    ).rejects.toThrow("ETHERSCAN_API_KEY is not configured for this deployment.");
  });

  it("sanitizes Cloudflare tunnel HTML failures", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        "<!doctype html><html><head><title>Cloudflare Tunnel error</title></head><body>Error 1033</body></html>",
        {
          status: 530,
          headers: {
            "Content-Type": "text/html"
          }
        }
      )
    ) as typeof fetch;

    await expect(
      verifyCollectionContract({
        chainId: 11155111,
        collectionAddress: "0xeD8F6de4Cc63D4349042D1F9051a7E0882E9eB10",
        standard: "ERC721"
      })
    ).rejects.toThrow("Collection verification backend is temporarily unavailable because the upstream tunnel is down.");
  });
});
