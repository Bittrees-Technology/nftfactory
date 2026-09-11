import {expect,it} from 'vitest';
import {readonlySnapshot} from './profileSnapshotApi';
import type {ApiProfileViewResponse} from './profileViewApi';
it('never exposes actionable listings or offers from an outage snapshot',()=>{const source={name:'artist',activeSellerAddresses:['0x1'],listings:[{id:1}],offers:[{id:2}],holdings:[{activeListing:{id:3},bestOffer:{id:4},offerCount:1}]} as unknown as ApiProfileViewResponse;const fallback=readonlySnapshot(source);expect(fallback.readOnly).toBe(true);expect(fallback.listings).toEqual([]);expect(fallback.offers).toEqual([]);expect(fallback.holdings[0].activeListing).toBeNull();expect(source.listings).toHaveLength(1);});
