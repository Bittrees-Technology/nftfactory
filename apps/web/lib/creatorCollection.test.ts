import { describe, expect, it } from "vitest";
import {
  encodeAcceptOwnership,
  encodeCancelOwnershipTransfer,
  encodeTransferOwnership
} from "./creatorCollection";

describe("creator collection ownership encoders", () => {
  it("encodes transferOwnership(address)", () => {
    const result = encodeTransferOwnership("0x0000000000000000000000000000000000000001");
    expect(result.startsWith("0xf2fde38b")).toBe(true);
  });

  it("encodes canceling a pending transfer via zero-address transferOwnership", () => {
    const result = encodeCancelOwnershipTransfer();
    expect(result).toBe("0xf2fde38b" + "0".repeat(64));
  });

  it("encodes acceptOwnership()", () => {
    const result = encodeAcceptOwnership();
    expect(result.startsWith("0x79ba5097")).toBe(true);
  });
});
