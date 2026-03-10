import { decodeFunctionData, keccak256, stringToBytes } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildEnsSubnameCreationTx,
  ENS_NAME_WRAPPER_WRITE_ABI,
  ENS_REGISTRY_ADDRESS,
  ENS_REGISTRY_WRITE_ABI,
  type EnsSubnameCreationContext,
  validateEnsSubnameCreation,
  ZERO_ADDRESS
} from "./ensSubnameCreation";

function createContext(overrides?: Partial<EnsSubnameCreationContext>): EnsSubnameCreationContext {
  return {
    fullName: "music.artist.eth",
    label: "music",
    parentName: "artist.eth",
    parentNode: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    parentExpiry: 1700000000n,
    currentOwner: ZERO_ADDRESS,
    parentOwner: "0x1111111111111111111111111111111111111111",
    parentWrapped: false,
    walletAddress: "0x1111111111111111111111111111111111111111",
    wrapperAddress: "0x2222222222222222222222222222222222222222",
    ...overrides
  };
}

describe("validateEnsSubnameCreation", () => {
  it("accepts a valid unwrapped parent context", () => {
    expect(validateEnsSubnameCreation(createContext())).toBeNull();
  });

  it("rejects an already-owned subname", () => {
    expect(
      validateEnsSubnameCreation(
        createContext({ currentOwner: "0x3333333333333333333333333333333333333333" })
      )
    ).toBe("music.artist.eth is already registered in ENS.");
  });

  it("rejects wrapped parents without expiry", () => {
    expect(
      validateEnsSubnameCreation(
        createContext({ parentWrapped: true, parentExpiry: null })
      )
    ).toBe("artist.eth is wrapped, but its wrapper expiry could not be read.");
  });
});

describe("buildEnsSubnameCreationTx", () => {
  it("builds an ENS Registry transaction for unwrapped parents", () => {
    const tx = buildEnsSubnameCreationTx(createContext());
    expect(tx.to).toBe(ENS_REGISTRY_ADDRESS);

    const decoded = decodeFunctionData({
      abi: ENS_REGISTRY_WRITE_ABI,
      data: tx.data
    });
    expect(decoded.functionName).toBe("setSubnodeOwner");
    expect(decoded.args).toEqual([
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      keccak256(stringToBytes("music")),
      "0x1111111111111111111111111111111111111111"
    ]);
  });

  it("builds a NameWrapper transaction for wrapped parents", () => {
    const tx = buildEnsSubnameCreationTx(
      createContext({
        parentWrapped: true
      })
    );
    expect(tx.to).toBe("0x2222222222222222222222222222222222222222");

    const decoded = decodeFunctionData({
      abi: ENS_NAME_WRAPPER_WRITE_ABI,
      data: tx.data
    });
    expect(decoded.functionName).toBe("setSubnodeOwner");
    expect(decoded.args).toEqual([
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "music",
      "0x1111111111111111111111111111111111111111",
      0,
      1700000000n
    ]);
  });
});
