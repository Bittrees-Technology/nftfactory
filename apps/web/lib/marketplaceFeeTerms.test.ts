import {describe,it,expect,vi} from 'vitest';
import {decodeFunctionData} from 'viem';
import {readFeeQuote,encodeQuotedListing,feeTermsAbi} from './marketplaceFeeTerms';
const address='0x1111111111111111111111111111111111111111';
describe('marketplace quoted terms',()=>{
 it('reads fee and treasury at one block on the expected chain',async()=>{const client={getChainId:vi.fn().mockResolvedValue(1),getBlockNumber:vi.fn().mockResolvedValue(123n),readContract:vi.fn().mockImplementation(({functionName})=>Promise.resolve(functionName==='treasury'?address:500n))};expect(await readFeeQuote(client as any,address,1)).toEqual({chainId:1,feeBps:500n,treasury:address});expect(client.readContract.mock.calls.every(([args])=>args.blockNumber===123n)).toBe(true);});
 it('rejects wrong-chain quotes before reading registry state',async()=>{const client={getChainId:vi.fn().mockResolvedValue(2),readContract:vi.fn()};await expect(readFeeQuote(client as any,address,1)).rejects.toThrow('network');expect(client.readContract).not.toHaveBeenCalled();});
 it('encodes the displayed terms into the guarded listing transaction',()=>{const data=encodeQuotedListing(address,7n,2n,'ERC1155',address,100n,7n,{chainId:1,feeBps:500n,treasury:address});const decoded=decodeFunctionData({abi:feeTermsAbi,data});expect(decoded.functionName).toBe('createListingWithFeeTerms');expect(decoded.args?.[7]).toEqual({feeBps:500n,treasury:address});expect(decoded.args?.[2]).toBe(2n);expect(decoded.args?.[5]).toBe(100n);});
});
