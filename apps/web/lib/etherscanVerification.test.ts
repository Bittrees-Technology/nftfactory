import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { verifyCollectionProxy } from "./etherscanVerification";

describe("verifyCollectionProxy", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ETHERSCAN_API_KEY;

  beforeEach(() => {
    process.env.ETHERSCAN_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ETHERSCAN_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("returns verified when ABI is already available", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: "1", message: "OK", result: "[]" }), { status: 200 })
    ) as typeof fetch;

    const result = await verifyCollectionProxy({
      chainId: 11155111,
      collectionAddress: "0x1111111111111111111111111111111111111111",
      expectedImplementation: "0x2222222222222222222222222222222222222222"
    });

    expect(result.state).toBe("verified");
    expect(result.message).toContain("already verified");
  });

  it("returns pending when verification stays queued", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "0", message: "NOTOK", result: "Contract source code not verified" }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "1", message: "OK", result: "guid-123" }), { status: 200 })
      )
      .mockImplementation(async () =>
        new Response(JSON.stringify({ status: "0", message: "NOTOK", result: "Pending in queue" }), { status: 200 })
      ) as typeof fetch;

    const result = await verifyCollectionProxy({
      chainId: 11155111,
      collectionAddress: "0x1111111111111111111111111111111111111111",
      expectedImplementation: "0x2222222222222222222222222222222222222222"
    });

    expect(result.state).toBe("pending");
    expect(result.guid).toBe("guid-123");
  });
});
