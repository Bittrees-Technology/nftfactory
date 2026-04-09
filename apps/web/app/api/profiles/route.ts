import { NextResponse } from "next/server";
import { getIndexerBaseUrl } from "../../../lib/indexerApi";

export const dynamic = "force-dynamic";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

export async function GET(request: Request) {
  try {
    const baseUrl = getIndexerBaseUrl();
    const url = new URL(request.url);
    const upstream = `${baseUrl.replace(/\/$/, "")}/api/profiles${url.search}`;
    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      },
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
      { error: toErrorMessage(error, "Failed to load the public profile directory.") },
      { status: 503 }
    );
  }
}
