import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/server/session';
import { boundedBody, publishFile, PublishingUnavailable } from '../../../../lib/server/publish';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  let session;
  try { session = requireSession(request); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 401 }); }
  try {
    const payload = JSON.parse((await boundedBody(request, 128 * 1024)).toString());
    if (payload.profile?.ownerAddress?.toLowerCase() !== session.address) return NextResponse.json({ error: 'Only the signed-in owner can publish this profile.' }, { status: 403 });
    const manifest = { version: 1, publishedAt: new Date().toISOString(), profile: payload.profile };
    const result = await publishFile(new File([JSON.stringify(manifest)], 'profile.json', { type: 'application/json' }), 'profile.json');
    return NextResponse.json({ cid: result.cid, profileUri: result.uri, manifestUri: result.uri, gatewayUrl: result.gatewayUrl, profileGatewayUrl: result.gatewayUrl, storage: result.storage });
  } catch (error) { return NextResponse.json({ error: error instanceof PublishingUnavailable ? error.message : 'Profile publishing failed. Keep your changes and retry.' }, { status: 503 }); }
}
