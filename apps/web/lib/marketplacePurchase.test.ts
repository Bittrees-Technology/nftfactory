import {expect,it} from 'vitest';
import {assertPurchasableListing,listingMatchesDeployment} from './marketplacePurchase';
import type {ApiActiveListingItem} from './indexerApi';
import {ZERO_ADDRESS} from './marketplace';
const item={collectionAddress:'0xabc',sellerAddress:'0xdef',tokenId:'1',priceRaw:'100',amountRaw:'1',marketplaceAddress:'0x123',chainId:1,standard:'ERC721'} as ApiActiveListingItem;
const listing=['0xdef','0xabc',1n,1n,'ERC721',ZERO_ADDRESS,100n,1000n,true] as const;
it('rejects the same listing number from another deployment or network',()=>{expect(listingMatchesDeployment(item,1,'0x123')).toBe(true);expect(listingMatchesDeployment(item,8453,'0x123')).toBe(false);expect(listingMatchesDeployment(item,1,'0x456')).toBe(false);expect(listingMatchesDeployment({...item,marketplaceAddress:null},1,'0x123')).toBe(false);});
it('requires the current price, seller, asset, amount, payment token and active lifetime',()=>{expect(()=>assertPurchasableListing(item,listing,999)).not.toThrow();expect(()=>assertPurchasableListing(item,listing,1000)).toThrow();for(const [index,value] of [[0,'0xother'],[1,'0xother'],[2,2n],[3,2n],[4,'ERC1155'],[5,'0xother'],[6,101n],[8,false]] as const){const changed=[...listing];changed[index]=value as never;expect(()=>assertPurchasableListing(item,changed as unknown as typeof listing,999)).toThrow();}});
