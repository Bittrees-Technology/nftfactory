import { describe, expect, it } from "vitest";
import { sepolia } from "viem/chains";
import {
  getCollectionScanFromBlock,
  getRegistryBackfillChain,
  getSharedBackfillTargets,
  normalizeExplicitBackfillTargets,
  isStaleIsoTimestamp
} from "./registryBackfill.js";

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

  it("treats missing or invalid timestamps as stale", () => {
    expect(isStaleIsoTimestamp(null, 60_000)).toBe(true);
    expect(isStaleIsoTimestamp("", 60_000)).toBe(true);
    expect(isStaleIsoTimestamp("nope", 60_000)).toBe(true);
  });

  it("treats recent timestamps as fresh until the ttl passes", () => {
    const now = Date.parse("2026-04-09T10:00:00.000Z");
    expect(isStaleIsoTimestamp("2026-04-09T09:59:30.000Z", 60_000, now)).toBe(false);
    expect(isStaleIsoTimestamp("2026-04-09T09:59:00.000Z", 60_000, now)).toBe(true);
  });

  it("returns shared backfill targets from env", () => {
    expect(
      getSharedBackfillTargets({
        NEXT_PUBLIC_SHARED_721_ADDRESS: "0xA98Db2732baD732aA588cad65478D3153A48f606",
        NEXT_PUBLIC_SHARED_1155_ADDRESS: "0xe0F306B9fB44C3d46C0360503D3B1b68366BA97d"
      })
    ).toEqual([
      {
        contractAddress: "0xa98db2732bad732aa588cad65478d3153a48f606",
        standard: "ERC721",
        isNftFactoryCreated: true
      },
      {
        contractAddress: "0xe0f306b9fb44c3d46c0360503d3b1b68366ba97d",
        standard: "ERC1155",
        isNftFactoryCreated: true
      }
    ]);
  });

  it("normalizes explicit custom collection backfill targets", () => {
    expect(
      normalizeExplicitBackfillTargets([
        {
          contractAddress: "0xabc",
          ownerAddress: "0xdef",
          standard: "ERC721"
        },
        {
          contractAddress: "0xA98Db2732baD732aA588cad65478D3153A48f606",
          ownerAddress: "0xFDd45904F8f0ec01Ff3e198A96673634F3761185",
          ensSubname: "artist",
          standard: "erc721",
          isFactoryCreated: false
        }
      ])
    ).toEqual([
      {
        contractAddress: "0xa98db2732bad732aa588cad65478d3153a48f606",
        ownerAddress: "0xfdd45904f8f0ec01ff3e198a96673634f3761185",
        ensSubname: "artist",
        standard: "ERC721",
        isNftFactoryCreated: false
      }
    ]);
  });
});
