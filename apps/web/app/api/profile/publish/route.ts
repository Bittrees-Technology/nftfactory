import { NextResponse } from "next/server";
import {
  buildGatewayUrl,
  buildIpfsAddUrl,
  buildIpfsAuthHeaders,
  buildIpfsAuthRequirementError,
  buildIpfsReachabilityError,
  buildIpfsTerminatedError,
  isPrivateOrLocalUrl,
  isPublicIpfsApiMissingRequiredAuth,
  isRetryableIpfsUploadErrorMessage,
  isRetryableIpfsUploadStatus,
  parseIpfsAddResponse,
  resolveIpfsApiUrl,
  resolveIpfsApiUrls,
  resolveIpfsGatewayBaseUrl
} from "../../../../lib/ipfsUpload";
import { sanitizeBackendErrorMessage } from "../../../../lib/networkErrors";
import { parseJsonRequestBody } from "../../../../lib/requestBody";
import { validateRequestContentType } from "../../../../lib/requestContentType";
import { rateLimitRequest, resolveRequestRateLimitConfig } from "../../../../lib/requestRateLimit";
import { validateRequestContentLength } from "../../../../lib/requestSize";

const MAX_IPFS_UPLOAD_ATTEMPTS = 3;
const IPFS_UPLOAD_RETRY_DELAYS_MS = [250, 750];
const MAX_PROFILE_PUBLISH_REQUEST_BYTES = 512 * 1024;
const PROFILE_PUBLISH_RATE_LIMIT = {
  bucket: "profile-publish",
  errorMessage: "Too many profile publish requests. Retry later.",
  ...resolveRequestRateLimitConfig(process.env, "PROFILE_PUBLISH", {
    maxRequests: 10,
    windowMs: 5 * 60_000
  })
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function pinJsonWithFailover(
  contents: string,
  fileName: string,
  apiUrls: string[],
  authHeaders: HeadersInit
): Promise<string> {
  let lastError: Error | null = null;

  for (const apiUrl of apiUrls) {
    for (let attempt = 1; attempt <= MAX_IPFS_UPLOAD_ATTEMPTS; attempt += 1) {
      const form = new FormData();
      form.append(
        "file",
        new File([contents], fileName, { type: "application/json" }),
        fileName
      );

      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers: authHeaders,
          body: form
        });
      } catch (error) {
        const message =
          error instanceof Error && isPrivateOrLocalUrl(apiUrl)
            ? buildIpfsReachabilityError(apiUrl)
            : error instanceof Error
              ? `IPFS upload request failed: ${error.message}`
              : "IPFS upload request failed.";
        lastError = new Error(message);
        if (attempt < MAX_IPFS_UPLOAD_ATTEMPTS && isRetryableIpfsUploadErrorMessage(message)) {
          await new Promise((resolve) => setTimeout(resolve, IPFS_UPLOAD_RETRY_DELAYS_MS[attempt - 1] || 1000));
          continue;
        }
        break;
      }

      if (!response.ok) {
        const text = await response.text();
        const fallbackMessage = `IPFS upload failed (HTTP ${response.status}).`;
        const sanitizedMessage = sanitizeBackendErrorMessage(text, fallbackMessage, {
          serviceLabel: "IPFS upload backend"
        });
        lastError = new Error(sanitizedMessage);
        if (attempt < MAX_IPFS_UPLOAD_ATTEMPTS && isRetryableIpfsUploadStatus(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, IPFS_UPLOAD_RETRY_DELAYS_MS[attempt - 1] || 1000));
          continue;
        }
        break;
      }

      let responseText: string;
      try {
        responseText = await response.text();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        lastError = new Error(
          isRetryableIpfsUploadErrorMessage(message)
            ? buildIpfsTerminatedError(apiUrl)
            : "IPFS upload response could not be read."
        );
        if (attempt < MAX_IPFS_UPLOAD_ATTEMPTS && isRetryableIpfsUploadErrorMessage(message)) {
          await new Promise((resolve) => setTimeout(resolve, IPFS_UPLOAD_RETRY_DELAYS_MS[attempt - 1] || 1000));
          continue;
        }
        break;
      }

      return parseIpfsAddResponse(responseText);
    }
  }

  throw lastError || new Error("IPFS upload failed.");
}

export async function POST(request: Request) {
  try {
    const rateLimitError = rateLimitRequest(request, PROFILE_PUBLISH_RATE_LIMIT);
    if (rateLimitError) {
      return NextResponse.json({ error: rateLimitError.error }, { status: rateLimitError.status, headers: rateLimitError.headers });
    }

    const contentTypeError = validateRequestContentType(request, "application/json", "Profile payload");
    if (contentTypeError) {
      return NextResponse.json({ error: contentTypeError.error }, { status: contentTypeError.status });
    }

    const contentLengthError = validateRequestContentLength(request, MAX_PROFILE_PUBLISH_REQUEST_BYTES, "Profile payload");
    if (contentLengthError) {
      return NextResponse.json({ error: contentLengthError.error }, { status: contentLengthError.status });
    }

    const payloadResult = await parseJsonRequestBody<{ profile?: unknown }>(request, "Profile payload");
    if (!payloadResult.ok) {
      return NextResponse.json({ error: payloadResult.error }, { status: payloadResult.status });
    }

    const payload = payloadResult.value;
    if (!payload || typeof payload !== "object" || !payload.profile || typeof payload.profile !== "object") {
      return NextResponse.json({ error: "Missing profile manifest payload." }, { status: 400 });
    }

    const configuredApiUrls = resolveIpfsApiUrls(process.env);
    const apiUrls = configuredApiUrls.length > 0
      ? configuredApiUrls.map((url) => buildIpfsAddUrl(url))
      : [buildIpfsAddUrl(resolveIpfsApiUrl(process.env) || requireEnv("IPFS_API_URL"))];
    const primaryApiUrl = apiUrls[0];

    if (isPublicIpfsApiMissingRequiredAuth(primaryApiUrl, process.env)) {
      throw new Error(buildIpfsAuthRequirementError(primaryApiUrl));
    }

    const authHeaders = buildIpfsAuthHeaders(process.env);
    const gatewayBaseUrl = resolveIpfsGatewayBaseUrl(process.env);
    const normalizedProfile = {
      version: 1,
      publishedAt: new Date().toISOString(),
      profile: payload.profile
    };
    const manifestJson = JSON.stringify(normalizedProfile, null, 2);
    const hash = await pinJsonWithFailover(manifestJson, "profile.json", apiUrls, authHeaders);

    return NextResponse.json({
      ok: true,
      manifest: normalizedProfile,
      profileUri: `ipfs://${hash}`,
      profileGatewayUrl: buildGatewayUrl({ gatewayBaseUrl, cid: hash })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish profile manifest." },
      { status: 500 }
    );
  }
}
