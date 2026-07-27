import { NextResponse, type NextRequest } from "next/server";
import { canonicalOrigin, harborPort } from "@/server/config";

const allowedHosts = new Set([`127.0.0.1:${harborPort}`]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!allowedHosts.has(host)) {
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
    "img-src 'self' data: https://supabase.com",
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
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = { matcher: "/:path*" };
