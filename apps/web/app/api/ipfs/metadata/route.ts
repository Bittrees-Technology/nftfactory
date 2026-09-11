import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/server/session';
import { assertPublishingConfigured, boundedBody, MAX_IMAGE_BYTES, publishFile, PublishingUnavailable } from '../../../../lib/server/publish';
import { rateLimitRequest } from '../../../../lib/requestRateLimit';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  try { requireSession(request); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 401 }); }
  const limited = rateLimitRequest(request, { bucket: 'publish-v1', maxRequests: 5, windowMs: 300_000, errorMessage: 'Please wait before uploading again.' });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: limited.headers });
  try {
    assertPublishingConfigured();
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return NextResponse.json({ error: 'Choose an artwork file.' }, { status: 415 });
    const bytes = await boundedBody(request);
    const form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type')! }, body: new Uint8Array(bytes) }).formData();
    const image = form.get('image');
    const name = String(form.get('name') || '').trim();
    const description = String(form.get('description') || '').trim();
    if (!name || name.length > 120 || description.length > 2000) return NextResponse.json({ error: 'Add a name of up to 120 characters and a description of up to 2,000 characters.' }, { status: 400 });
    if (form.get('audio') || form.get('custom_metadata_uri')) return NextResponse.json({ error: 'This release supports artwork images with generated metadata.' }, { status: 400 });
    if (!(image instanceof File) || !['image/png', 'image/jpeg', 'image/webp'].includes(image.type) || image.size <= 0 || image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Choose a PNG, JPEG, or WebP image smaller than 3 MiB.' }, { status: 400 });
    const signature = new Uint8Array(await image.slice(0, 12).arrayBuffer());
    const validImage = image.type === 'image/png' ? Buffer.from(signature.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])) : image.type === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255 : Buffer.from(signature.slice(0,4)).toString() === 'RIFF' && Buffer.from(signature.slice(8,12)).toString() === 'WEBP';
    if (!validImage) return NextResponse.json({ error: 'The file contents do not match a supported image format.' }, { status: 400 });
    const media = await publishFile(image, image.name || 'artwork');
    const metadata = new File([JSON.stringify({ name, description, image: media.uri })], 'metadata.json', { type: 'application/json' });
    const result = await publishFile(metadata, 'metadata.json');
    return NextResponse.json({ imageUri: media.uri, metadataUri: result.uri, imageGatewayUrl: media.gatewayUrl, metadataGatewayUrl: result.gatewayUrl, storage: result.storage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PublishingUnavailable ? error.message : 'The upload could not be completed. Check file size and retry.' }, { status: error instanceof PublishingUnavailable ? 503 : 400 });
  }
}
