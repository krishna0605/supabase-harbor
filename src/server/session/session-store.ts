import { createHash, randomBytes } from "node:crypto";
import { HarborError } from "@/shared/errors/harbor-error";
import { getSettings } from "@/server/database/repository";

const SESSION_COOKIE = "harbor_session";
const CSRF_COOKIE = "harbor_csrf";

type Session = {
  hash: string;
  csrf: string;
  lastInteractionAt: number;
};

type SessionState = {
  dek: Buffer | null;
  sessions: Map<string, Session>;
  failedUnlocks: number;
  unlockBlockedUntil: number;
};

const globalForSession = globalThis as unknown as {
  harborSessionState?: SessionState;
};

function state(): SessionState {
  globalForSession.harborSessionState ??= {
    dek: null,
    sessions: new Map(),
    failedUnlocks: 0,
    unlockBlockedUntil: 0,
  };
  return globalForSession.harborSessionState;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function idleTimeoutMs() {
  const minutes = Number((await getSettings()).idle_timeout_minutes || "30");
  return Math.max(5, Math.min(minutes, 240)) * 60_000;
}

export function vaultIsUnlocked() {
  return Boolean(state().dek);
}

export function createSession(dek: Buffer) {
  clearAllSessions();
  state().dek = Buffer.from(dek);
  const raw = randomBytes(32).toString("base64url");
  const csrf = randomBytes(24).toString("base64url");
  const hash = hashToken(raw);
  state().sessions.set(hash, { hash, csrf, lastInteractionAt: Date.now() });
  return { raw, csrf };
}

export function sessionCookies(session: { raw: string; csrf: string }) {
  return [
    `${SESSION_COOKIE}=${session.raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
    `${CSRF_COOKIE}=${session.csrf}; SameSite=Strict; Path=/; Max-Age=86400`,
  ];
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export async function requireSession(
  request: Request,
  options: { csrf?: boolean; touch?: boolean } = {},
) {
  const currentState = state();
  const raw = cookieValue(request, SESSION_COOKIE);
  if (!raw || !currentState.dek) {
    throw new HarborError("VAULT_LOCKED", "Unlock Harbor to continue.", 401);
  }
  const session = currentState.sessions.get(hashToken(raw));
  if (!session) {
    throw new HarborError(
      "SESSION_EXPIRED",
      "Your Harbor session expired.",
      401,
    );
  }
  if (Date.now() - session.lastInteractionAt > (await idleTimeoutMs())) {
    clearAllSessions();
    throw new HarborError(
      "SESSION_EXPIRED",
      "Harbor locked after inactivity.",
      401,
    );
  }
  if (options.csrf) {
    const header = request.headers.get("x-harbor-csrf");
    const cookie = cookieValue(request, CSRF_COOKIE);
    if (!header || header !== session.csrf || cookie !== session.csrf) {
      throw new HarborError(
        "INVALID_CSRF",
        "Request verification failed.",
        403,
      );
    }
  }
  if (options.touch || request.headers.get("x-harbor-interaction") === "1") {
    session.lastInteractionAt = Date.now();
  }
  return { dek: currentState.dek, session };
}

export function clearAllSessions() {
  const currentState = state();
  currentState.dek?.fill(0);
  currentState.dek = null;
  currentState.sessions.clear();
}

export function clearedSessionCookies() {
  return [
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    `${CSRF_COOKIE}=; SameSite=Strict; Path=/; Max-Age=0`,
  ];
}

export function checkUnlockDelay() {
  if (Date.now() < state().unlockBlockedUntil) {
    throw new HarborError(
      "UNLOCK_THROTTLED",
      "Wait a moment before trying again.",
      429,
      true,
    );
  }
}

export function recordUnlockFailure() {
  state().failedUnlocks += 1;
  if (state().failedUnlocks >= 3) {
    state().unlockBlockedUntil =
      Date.now() + Math.min(30_000, state().failedUnlocks * 2_000);
  }
}

export function clearUnlockFailures() {
  state().failedUnlocks = 0;
  state().unlockBlockedUntil = 0;
}
