import {encodeFunctionData,parseAbi,type Address,type PublicClient} from 'viem';
export const feeTermsAbi=parseAbi([
 'function protocolFeeBps() view returns (uint256)',
 'function treasury() view returns (address)',
 'function createListingWithFeeTerms(address nft,uint256 tokenId,uint256 amount,string standard,address paymentToken,uint256 price,uint256 durationDays,(uint256 feeBps,address treasury) expected)'
]);
export type FeeQuote={chainId:number;feeBps:bigint;treasury:Address};
export async function readFeeQuote(client:Pick<PublicClient,'getChainId'|'getBlockNumber'|'readContract'>,registry:Address,chainId:number):Promise<FeeQuote>{
 if(await client.getChainId()!==chainId)throw new Error('Fee quote network mismatch.');
 const blockNumber=await client.getBlockNumber();
 const [feeBps,treasury]=await Promise.all([client.readContract({address:registry,abi:feeTermsAbi,functionName:'protocolFeeBps',blockNumber}),client.readContract({address:registry,abi:feeTermsAbi,functionName:'treasury',blockNumber})]);
 if(feeBps<0n||feeBps>10000n||/^0x0{40}$/i.test(treasury))throw new Error('Marketplace fee configuration is invalid.');
 return{chainId,feeBps,treasury};
}
export function encodeQuotedListing(nft:Address,tokenId:bigint,amount:bigint,standard:string,paymentToken:Address,price:bigint,durationDays:bigint,quote:FeeQuote){
 return encodeFunctionData({abi:feeTermsAbi,functionName:'createListingWithFeeTerms',args:[nft,tokenId,amount,standard,paymentToken,price,durationDays,{feeBps:quote.feeBps,treasury:quote.treasury}]});
}
