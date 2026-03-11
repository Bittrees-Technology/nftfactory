import { NextResponse } from "next/server";
import {
  buildIpfsAddUrl,
  buildIpfsAuthRequirementError,
  buildIpfsAuthHeaders,
  buildIpfsReachabilityError,
  hasIpfsApiAuthConfigured,
  isPrivateOrLocalUrl,
  parseIpfsAddResponse
} from "../../../../lib/ipfsUpload";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function pinFile(file: File, fileName: string, apiUrl: string, authHeaders: HeadersInit): Promise<string> {
  const form = new FormData();
  form.append("file", file, fileName);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: authHeaders,
      body: form
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && isPrivateOrLocalUrl(apiUrl)
        ? buildIpfsReachabilityError(apiUrl)
        : error instanceof Error
          ? `IPFS upload request failed: ${error.message}`
          : "IPFS upload request failed."
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IPFS upload failed (HTTP ${response.status}): ${text}`);
  }

  return parseIpfsAddResponse(await response.text());
}

export async function POST(request: Request) {
  try {
    const apiUrl = buildIpfsAddUrl(requireEnv("IPFS_API_URL"));
    if (!isPrivateOrLocalUrl(apiUrl) && !hasIpfsApiAuthConfigured(process.env)) {
      throw new Error(buildIpfsAuthRequirementError(apiUrl));
    }
    const authHeaders = buildIpfsAuthHeaders(process.env);
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://dweb.link/ipfs";

    const formData = await request.formData();
    const image = formData.get("image");
    const audio = formData.get("audio");
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const externalUrl = String(formData.get("external_url") || "").trim();
    const customMetadataUri = String(formData.get("custom_metadata_uri") || "").trim();

    if (customMetadataUri) {
      if (!/^ipfs:\/\/.+/.test(customMetadataUri)) {
        return NextResponse.json({ error: "custom_metadata_uri must be a valid ipfs:// URI" }, { status: 400 });
      }
      return NextResponse.json({
        metadataUri: customMetadataUri
      });
    }

    if (image instanceof File) {
      if (!image.type.startsWith("image/")) {
        return NextResponse.json({ error: "Image must be a valid image/* file type" }, { status: 400 });
      }
      if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Image file size must be between 1 byte and 15MB" }, { status: 400 });
      }
    }

    if (audio instanceof File) {
      if (!audio.type.startsWith("audio/")) {
        return NextResponse.json({ error: "Audio must be a valid audio/* file type" }, { status: 400 });
      }
      if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Audio file size must be between 1 byte and 25MB" }, { status: 400 });
      }
    }

    let imageHash: string | null = null;
    let audioHash: string | null = null;
    let imageUri: string | null = null;
    let audioUri: string | null = null;

    if (image instanceof File) {
      imageHash = await pinFile(image, image.name || "asset.png", apiUrl, authHeaders);
      imageUri = `ipfs://${imageHash}`;
    }

    if (audio instanceof File) {
      audioHash = await pinFile(audio, audio.name || "audio.mp3", apiUrl, authHeaders);
      audioUri = `ipfs://${audioHash}`;
    }

    const metadata: Record<string, unknown> = {
      name: name || "Untitled NFT",
      description
    };

    if (imageUri) {
      metadata.image = imageUri;
    }
    if (audioUri) {
      metadata.animation_url = audioUri;
    }

    if (externalUrl) {
      try {
        const parsed = new URL(externalUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ error: "external_url must use http or https" }, { status: 400 });
        }
        metadata.external_url = parsed.toString();
      } catch {
        return NextResponse.json({ error: "external_url must be a valid URL" }, { status: 400 });
      }
    }

    const metadataFile = new File([JSON.stringify(metadata, null, 2)], "metadata.json", {
      type: "application/json"
    });
    const metadataHash = await pinFile(metadataFile, "metadata.json", apiUrl, authHeaders);
    const metadataUri = `ipfs://${metadataHash}`;

    return NextResponse.json({
      imageUri,
      audioUri,
      metadataUri,
      imageGatewayUrl: imageHash ? `${gateway}/${imageHash}` : null,
      audioGatewayUrl: audioHash ? `${gateway}/${audioHash}` : null,
      metadataGatewayUrl: `${gateway}/${metadataHash}`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "IPFS upload failed" },
      { status: 500 }
    );
  }
}
