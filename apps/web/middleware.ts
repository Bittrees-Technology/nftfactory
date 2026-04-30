import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildBasicAuthChallenge,
  isAuthorizedBasicAuth,
  resolveBasicAuthConfig
} from "./lib/basicAuth";
import { applySecurityHeaders } from "./lib/securityHeaders";

function buildMiddlewareResponse(response: NextResponse, basicAuthEnabled: boolean): NextResponse {
  applySecurityHeaders(response.headers, {
    basicAuthEnabled,
    production: process.env.NODE_ENV === "production"
  });
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const config = resolveBasicAuthConfig();
  if (!config.enabled) {
    return buildMiddlewareResponse(NextResponse.next(), false);
  }

  if (config.misconfigured) {
    return buildMiddlewareResponse(new NextResponse("Password protection is enabled but SITE_BASIC_AUTH_PASSWORD is missing.", {
      status: 500
    }), true);
  }

  if (isAuthorizedBasicAuth(request.headers.get("authorization"))) {
    return buildMiddlewareResponse(NextResponse.next(), true);
  }

  return buildMiddlewareResponse(new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": buildBasicAuthChallenge()
    }
  }), true);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2|ttf)$).*)"
  ]
};
