import { NextResponse } from "next/server";

const PINATA_FILE_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type PinataResponse = {
  IpfsHash: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function pinFile(file: File, fileName: string, jwt: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, fileName);
  form.append("pinataMetadata", JSON.stringify({ name: fileName }));

  const response = await fetch(PINATA_FILE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata upload failed: ${text}`);
  }

  const payload = (await response.json()) as PinataResponse;
  if (!payload.IpfsHash) {
    throw new Error("Pinata response missing IpfsHash");
  }
  return payload.IpfsHash;
}

export async function POST(request: Request) {
  try {
    const jwt = requireEnv("PINATA_JWT");
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

    const formData = await request.formData();
    const image = formData.get("image");
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const externalUrl = String(formData.get("external_url") || "").trim();

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image must be a valid image/* file type" }, { status: 400 });
    }
    if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image file size must be between 1 byte and 15MB" }, { status: 400 });
    }

    const imageHash = await pinFile(image, image.name || "asset.png", jwt);
    const imageUri = `ipfs://${imageHash}`;

    const metadata: Record<string, unknown> = {
      name: name || "Untitled NFT",
      description,
      image: imageUri
    };

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
    const metadataHash = await pinFile(metadataFile, "metadata.json", jwt);
    const metadataUri = `ipfs://${metadataHash}`;

    return NextResponse.json({
      imageUri,
      metadataUri,
      imageGatewayUrl: `${gateway}/${imageHash}`,
      metadataGatewayUrl: `${gateway}/${metadataHash}`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "IPFS upload failed" },
      { status: 500 }
    );
  }
}
