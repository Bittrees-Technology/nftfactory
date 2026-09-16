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

it('extracts only a successful factory deployment event, not implementation updates',async()=>{
  const {extractDeployedCollectionAddress}=await import('./creatorCollection');
  const {pad,toEventSelector}=await import('viem');
  const factory='0x1111111111111111111111111111111111111111';
  const owner='0x2222222222222222222222222222222222222222';
  const collection='0x3333333333333333333333333333333333333333';
  const event={address:factory,topics:[toEventSelector('CreatorCollectionDeployed(address,address,string,string,string,string)'),pad(owner),pad(collection)],data:'0x'};
  const receipt={status:'success',logs:[event]} as unknown as import('viem').TransactionReceipt;
  expect(extractDeployedCollectionAddress(receipt,factory)).toBe(collection);
  expect(extractDeployedCollectionAddress({...receipt,status:'reverted'},factory)).toBeNull();
  expect(extractDeployedCollectionAddress(receipt,owner)).toBeNull();
  const wrong={...event,topics:[toEventSelector('ImplementationsUpdated(address,address)'),pad(owner),pad(collection)]};
  expect(extractDeployedCollectionAddress({...receipt,logs:[wrong as unknown as import('viem').Log]},factory)).toBeNull();
});
