import { describe, expect, it } from "vitest";
import { sepolia } from "viem/chains";
import { getCollectionScanFromBlock, getRegistryBackfillChain } from "./registryBackfill.js";

describe("registryBackfill helpers", () => {
  it("pins historical backfill to Sepolia", () => {
    expect(getRegistryBackfillChain(sepolia.id).id).toBe(sepolia.id);
  });

  it("rejects unsupported chains", () => {
    expect(() => getRegistryBackfillChain(1)).toThrow(/Sepolia only/i);
  });

  it("uses the collection registration block when present", () => {
    expect(getCollectionScanFromBlock(10359510n, 10359500n)).toBe(10359510n);
  });

  it("falls back to the global from block when the registration block is missing", () => {
    expect(getCollectionScanFromBlock(undefined, 10359500n)).toBe(10359500n);
    expect(getCollectionScanFromBlock(null, 10359500n)).toBe(10359500n);
    expect(getCollectionScanFromBlock(0n, 10359500n)).toBe(10359500n);
  });
});
