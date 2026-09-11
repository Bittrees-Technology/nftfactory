import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function archiveMarketplace(db,backup,chainId,marketplace){
  await db.$transaction(async tx=>{
   const listings=await tx.listing.findMany({where:{chainId:chainId}}),offers=await tx.offer.findMany({where:{chainId:chainId}});
   // Exclusive archive creation precedes deletion; rollback preserves rows if any step fails.
   writeFileSync(join(backup,'retired-marketplace-records.json'),JSON.stringify({chainId:chainId,marketplace:marketplace,listings,offers},null,2)+'\n',{mode:0o600,flag:'wx'});
   await tx.listing.deleteMany({where:{chainId:chainId}});await tx.offer.deleteMany({where:{chainId:chainId}});
   console.log(`Archived ${listings.length} old listing and ${offers.length} old offer records; NFT, profile and tag data retained.`);
  });
}
