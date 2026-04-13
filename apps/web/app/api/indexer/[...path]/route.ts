import { NextResponse } from "next/server";
import { getIndexerBaseUrl } from "../../../../lib/indexerApi";
import { sanitizeBackendErrorMessage } from "../../../../lib/networkErrors";
import { resolveIndexerServerUrl } from "../../../../lib/indexerServerEnv";

export const dynamic = "force-dynamic";
const INDEXER_PROXY_TIMEOUT_MS = Math.max(
  1_000,
  Number.parseInt(process.env.INDEXER_PROXY_TIMEOUT_MS || "8000", 10) || 8_000
);

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
    const baseUrl = (resolveIndexerServerUrl(chainId) || getIndexerBaseUrl(chainId ? { chainId } : undefined)).replace(/\/$/, "");
    const upstreamUrl = `${baseUrl}${upstreamPath}${inboundUrl.search}`;

    const method = request.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);
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
