import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/server/config";
import { auth } from "@/server/auth/neon-auth";

const allowedHost = new URL(canonicalOrigin).host;
const requireAuthentication = auth.middleware({ loginUrl: "/login" });
const protectedPages = [
  "/accounts",
  "/activity",
  "/dashboard",
  "/keepalive",
  "/settings",
];

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host !== allowedHost) {
    return new NextResponse("Invalid host", { status: 421 });
  }

  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== canonicalOrigin
  ) {
    return new NextResponse("Invalid origin", { status: 403 });
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = [
    "default-src 'self'",
    "img-src 'self' data: https://supabase.com https://avatars.githubusercontent.com",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'${
      process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
    }`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);
  const securedRequest = new NextRequest(request, { headers: requestHeaders });
  const response = protectedPages.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  )
    ? await requireAuthentication(securedRequest)
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (
    process.env.NODE_ENV === "production" &&
    canonicalOrigin.startsWith("https://")
  ) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

export const config = { matcher: "/:path*" };
