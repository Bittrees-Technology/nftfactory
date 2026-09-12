import {NextRequest,NextResponse} from 'next/server';
import {recoverMetadata} from '../../../../../../packages/profile/metadata-fallback.mjs';
import {rateLimitRequest} from '../../../../lib/requestRateLimit';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 const limited=rateLimitRequest(request,{bucket:'metadata-recovery',maxRequests:60,windowMs:60000,errorMessage:'Please retry metadata recovery shortly.'});
 if(limited)return NextResponse.json({error:limited.error},{status:limited.status,headers:limited.headers});
 const q=request.nextUrl.searchParams;
 try{const result=await recoverMetadata(Number(q.get('chainId')),q.get('contract')||'',q.get('tokenId')||'',{openSeaKey:process.env.OPENSEA_API_KEY});
 return NextResponse.json({metadata:result},{headers:{'Cache-Control':result?'public, s-maxage=900, stale-while-revalidate=300':'public, s-maxage=30'}});
 }catch{return NextResponse.json({error:'Invalid NFT identity.'},{status:400});}
}
