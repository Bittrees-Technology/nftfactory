import { NextResponse } from "next/server";
import { getIndexerBaseUrl } from "../../../../lib/indexerApi";
import { evaluateIndexerProxyRequest } from "../../../../lib/indexerProxyPolicy";
import { isIndexerProxyWriteMethod, resolveIndexerProxyWriteRateLimitConfig } from "../../../../lib/indexerProxyRateLimit";
import { sanitizeBackendErrorMessage } from "../../../../lib/networkErrors";
import { validateRequestContentType } from "../../../../lib/requestContentType";
import { rateLimitRequest } from "../../../../lib/requestRateLimit";
import { validateRequestContentLength } from "../../../../lib/requestSize";
import { resolveIndexerServerUrl } from "../../../../lib/indexerServerEnv";

export const dynamic = "force-dynamic";
const INDEXER_PROXY_TIMEOUT_MS = Math.max(
  1_000,
  Number.parseInt(process.env.INDEXER_PROXY_TIMEOUT_MS || "8000", 10) || 8_000
);
const INDEXER_PROXY_MAX_BODY_BYTES = Math.max(
  16 * 1024,
  Number.parseInt(process.env.INDEXER_PROXY_MAX_BODY_BYTES || `${1024 * 1024}`, 10) || 1024 * 1024
);
const INDEXER_PROXY_WRITE_RATE_LIMIT = resolveIndexerProxyWriteRateLimitConfig(process.env);

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

function isHtmlContentType(value: string | null): boolean {
  return String(value || "").toLowerCase().includes("text/html");
}

function parseChainId(value: string | null): number | undefined {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function withTimeout(timeoutMs = INDEXER_PROXY_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout)
  };
}

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path = [] } = await context.params;
    const inboundUrl = new URL(request.url);
    const chainId = parseChainId(inboundUrl.searchParams.get("_chainId"));
    inboundUrl.searchParams.delete("_chainId");

    const upstreamPath = `/${path.join("/")}`.replace(/\/+/g, "/");
    const method = request.method.toUpperCase();
    const policy = evaluateIndexerProxyRequest(method, upstreamPath);
    if (!policy.ok) {
      return NextResponse.json({ error: policy.error }, { status: policy.status });
    }

    if (isIndexerProxyWriteMethod(method)) {
      const rateLimitError = rateLimitRequest(request, INDEXER_PROXY_WRITE_RATE_LIMIT);
      if (rateLimitError) {
        return NextResponse.json({ error: rateLimitError.error }, { status: rateLimitError.status, headers: rateLimitError.headers });
      }

      const contentTypeError = validateRequestContentType(request, "application/json", "Indexer proxy payload");
      if (contentTypeError) {
        return NextResponse.json({ error: contentTypeError.error }, { status: contentTypeError.status });
      }
    }

    const baseUrl = (resolveIndexerServerUrl(chainId) || getIndexerBaseUrl(chainId ? { chainId } : undefined)).replace(/\/$/, "");
    const upstreamUrl = `${baseUrl}${upstreamPath}${inboundUrl.search}`;

    const hasBody = !["GET", "HEAD"].includes(method);
    if (hasBody) {
      const contentLengthError = validateRequestContentLength(request, INDEXER_PROXY_MAX_BODY_BYTES, "Indexer proxy payload");
      if (contentLengthError) {
        return NextResponse.json({ error: contentLengthError.error }, { status: contentLengthError.status });
      }
    }
    const body = hasBody ? await request.text() : undefined;
    const contentType = request.headers.get("Content-Type");
    const { signal, cleanup } = withTimeout();

    try {
      const response = await fetch(upstreamUrl, {
        method,
        headers: {
          ...(contentType ? { "Content-Type": contentType } : {})
        },
        body,
        cache: "no-store",
        signal
      });

      const text = await response.text();
      const upstreamContentType = response.headers.get("Content-Type");
      if (isHtmlContentType(upstreamContentType)) {
        const fallbackMessage = response.ok
          ? "Indexer API returned an unexpected HTML response."
          : `Indexer API request failed (${response.status}).`;
        const status = response.ok ? 502 : response.status;
        return NextResponse.json(
          {
            error: sanitizeBackendErrorMessage(text, fallbackMessage, {
              serviceLabel: "Indexer API"
            })
          },
          { status }
        );
      }
      return new NextResponse(text, {
        status: response.status,
        headers: {
          "Content-Type": upstreamContentType || "application/json"
        }
      });
    } finally {
      cleanup();
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: `Indexer proxy request timed out after ${INDEXER_PROXY_TIMEOUT_MS}ms.` },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: toErrorMessage(error, "Indexer proxy request failed. Configure INDEXER_API_URL[_CHAIN_ID] or NEXT_PUBLIC_INDEXER_API_URL[_CHAIN_ID].") },
      { status: 503 }
    );
  }
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PUT(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxyRequest(request, context);
}

export async function DELETE(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxyRequest(request, context);
}
