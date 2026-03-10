import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildBasicAuthChallenge,
  isAuthorizedBasicAuth,
  resolveBasicAuthConfig
} from "./lib/basicAuth";

export function middleware(request: NextRequest): NextResponse {
  const config = resolveBasicAuthConfig();
  if (!config.enabled) {
    return NextResponse.next();
  }

  if (config.misconfigured) {
    return new NextResponse("Password protection is enabled but SITE_BASIC_AUTH_PASSWORD is missing.", {
      status: 500
    });
  }

  if (isAuthorizedBasicAuth(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": buildBasicAuthChallenge()
    }
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2|ttf)$).*)"
  ]
};
