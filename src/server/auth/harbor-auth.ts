import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createUserVault,
  destroyRootKeyring,
  parseRootKeyring,
  unwrapUserDek,
} from "@/server/crypto/hosted-crypto";
import {
  ensureDefaultSettings,
  getUserVault,
  insertUserVault,
  resolveGithubId,
} from "@/server/database/repository";
import { getHostedAuthConfig } from "@/server/config";
import { auth } from "@/server/auth/neon-auth";
import { HarborError } from "@/shared/errors/harbor-error";
import type { HarborIdentity, TenantContext } from "@/shared/types/auth";

const CSRF_COOKIE = "harbor_csrf";

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function stableEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function csrfSignature(sessionId: string, token: string) {
  return createHmac("sha256", getHostedAuthConfig().cookieSecret)
    .update(sessionId)
    .update("\0")
    .update(token)
    .digest("base64url");
}

function validateRequestBoundary(request: Request) {
  const expected = new URL(getHostedAuthConfig().origin);
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (host !== expected.host || requestUrl.host !== expected.host) {
    throw new HarborError(
      "INVALID_HOST",
      "The request host is not allowed.",
      403,
    );
  }

  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    if (request.headers.get("origin") !== expected.origin) {
      throw new HarborError(
        "INVALID_ORIGIN",
        "The request origin is not allowed.",
        403,
      );
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") {
      throw new HarborError(
        "INVALID_REQUEST_SITE",
        "Cross-site requests are not allowed.",
        403,
      );
    }
    const contentType = request.headers.get("content-type");
    if (contentType && !contentType.startsWith("application/json")) {
      throw new HarborError(
        "INVALID_CONTENT_TYPE",
        "Harbor accepts JSON requests only.",
        415,
      );
    }
  }
}

async function ensureTenant(context: TenantContext) {
  let vault = await getUserVault(context);
  if (!vault) {
    const keyring = parseRootKeyring();
    const created = createUserVault(context.userId, keyring);
    try {
      await insertUserVault(context, created.record);
    } finally {
      created.dek.fill(0);
      destroyRootKeyring(keyring);
    }
    vault = await getUserVault(context);
    if (!vault) {
      throw new HarborError(
        "USER_VAULT_CREATION_FAILED",
        "Harbor could not initialize encrypted storage for this user.",
        500,
      );
    }
  }
  await ensureDefaultSettings(context);
  return vault;
}

export async function requireHarborUser(
  request: Request,
  options: { csrf?: boolean } = {},
) {
  validateRequestBoundary(request);
  const result = await auth.getSession();
  const session = result.data;
  if (!session?.user || !session.session) {
    throw new HarborError(
      "AUTHENTICATION_REQUIRED",
      "Sign in with GitHub to continue.",
      401,
    );
  }

  const githubId = await resolveGithubId(session.user.id);
  const config = getHostedAuthConfig();
  if (!githubId || !config.allowedGithubIds.has(githubId)) {
    throw new HarborError(
      "ACCESS_NOT_ALLOWED",
      "This GitHub account is not approved for Harbor.",
      403,
    );
  }

  if (options.csrf) {
    const cookie = cookieValue(request, CSRF_COOKIE);
    const header = request.headers.get("x-harbor-csrf");
    const [token, signature] = cookie?.split(".") ?? [];
    if (
      !token ||
      !signature ||
      !header ||
      !stableEqual(header, cookie ?? "") ||
      !stableEqual(signature, csrfSignature(session.session.id, token))
    ) {
      throw new HarborError(
        "INVALID_CSRF",
        "Request verification failed.",
        403,
      );
    }
  }

  const context = {
    userId: session.user.id,
    requestId: randomUUID(),
  } satisfies TenantContext;
  const vault = await ensureTenant(context);
  const identity = {
    userId: session.user.id,
    githubId,
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
  } satisfies HarborIdentity;

  return { context, identity, sessionId: session.session.id, vault };
}

export async function withUserDek<T>(
  context: TenantContext,
  operation: (dek: Buffer) => Promise<T>,
) {
  const vault = await getUserVault(context);
  if (!vault) {
    throw new HarborError(
      "USER_VAULT_NOT_FOUND",
      "Encrypted storage is not initialized for this user.",
      500,
    );
  }
  const keyring = parseRootKeyring();
  const dek = unwrapUserDek(context.userId, vault, keyring);
  try {
    return await operation(dek);
  } finally {
    dek.fill(0);
    destroyRootKeyring(keyring);
  }
}

export function createCsrfCookie(sessionId: string) {
  const token = randomBytes(24).toString("base64url");
  const value = `${token}.${csrfSignature(sessionId, token)}`;
  const secure =
    process.env.NODE_ENV === "production" &&
    getHostedAuthConfig().origin.startsWith("https://");
  return `${CSRF_COOKIE}=${encodeURIComponent(value)}; SameSite=Lax; Path=/; Max-Age=3600${secure ? "; Secure" : ""}`;
}

export function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; SameSite=Lax; Path=/; Max-Age=0`;
}
