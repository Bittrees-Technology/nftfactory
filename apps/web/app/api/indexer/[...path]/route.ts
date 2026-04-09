import { NextResponse } from "next/server";
import { getIndexerBaseUrl } from "../../../../lib/indexerApi";

export const dynamic = "force-dynamic";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

function parseChainId(value: string | null): number | undefined {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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
    const baseUrl = getIndexerBaseUrl(chainId ? { chainId } : undefined).replace(/\/$/, "");
    const upstreamUrl = `${baseUrl}${upstreamPath}${inboundUrl.search}`;

    const method = request.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);
    const body = hasBody ? await request.text() : undefined;
    const contentType = request.headers.get("Content-Type");

    const response = await fetch(upstreamUrl, {
      method,
      headers: {
        ...(contentType ? { "Content-Type": contentType } : {})
      },
      body,
      cache: "no-store"
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error, "Indexer proxy request failed.") },
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
