import type {ApiActiveListingItem} from './indexerApi';
import {ZERO_ADDRESS} from './marketplace';
export function listingMatchesDeployment(item:ApiActiveListingItem,chainId:number,marketplace:string):boolean {
 return item.marketplaceAddress?.toLowerCase()===marketplace.toLowerCase() && (item.chainId===undefined||item.chainId===chainId);
}
export function assertPurchasableListing(item:ApiActiveListingItem,listing:readonly [string,string,bigint,bigint,string,string,bigint,bigint,boolean],now:number) {
 if(listing[4]!==item.standard || !listing[8] || listing[7]<=BigInt(now) || listing[1].toLowerCase()!==item.collectionAddress.toLowerCase() || listing[2]!==BigInt(item.tokenId) || listing[0].toLowerCase()!==item.sellerAddress.toLowerCase() || listing[6]!==BigInt(item.priceRaw) || listing[5].toLowerCase()!==ZERO_ADDRESS || listing[3]!==BigInt(item.amountRaw)) throw new Error('This listing changed or is no longer available. Refresh listings before purchasing.');
}
