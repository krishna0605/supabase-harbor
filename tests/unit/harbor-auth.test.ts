import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  resolveGithubId: vi.fn(),
  getUserVault: vi.fn(),
  insertUserVault: vi.fn(),
  ensureDefaultSettings: vi.fn(),
}));

vi.mock("@/server/auth/neon-auth", () => ({
  auth: { getSession: mocks.getSession },
}));

vi.mock("@/server/database/repository", () => ({
  resolveGithubId: mocks.resolveGithubId,
  getUserVault: mocks.getUserVault,
  insertUserVault: mocks.insertUserVault,
  ensureDefaultSettings: mocks.ensureDefaultSettings,
}));

import {
  createCsrfCookie,
  requireHarborUser,
} from "@/server/auth/harbor-auth";

const vault = {
  wrappedDek: Buffer.alloc(32, 1),
  wrappedDekNonce: Buffer.alloc(12, 2),
  wrappedDekTag: Buffer.alloc(16, 3),
  rootKeyVersion: 1,
};

function request(
  method = "GET",
  headers: Record<string, string> = {},
) {
  return new Request("http://127.0.0.1:47832/api/accounts", {
    method,
    headers: { host: "127.0.0.1:47832", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HARBOR_ORIGIN = "http://127.0.0.1:47832";
  process.env.HARBOR_ALLOWED_GITHUB_IDS = "123456789";
  process.env.NEON_AUTH_BASE_URL = "https://auth.example.test/neondb/auth";
  process.env.NEON_AUTH_COOKIE_SECRET =
    "unit-test-cookie-secret-at-least-32-characters";
  process.env.HARBOR_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.HARBOR_MASTER_KEY_VERSION = "1";
  mocks.getSession.mockResolvedValue({
    data: {
      user: {
        id: "auth-user-one",
        name: "Harbor User",
        email: "harbor@example.test",
        image: null,
      },
      session: { id: "session-one" },
    },
  });
  mocks.resolveGithubId.mockResolvedValue("123456789");
  mocks.getUserVault.mockResolvedValue(vault);
});

describe("hosted Harbor authorization", () => {
  it("returns a server-derived tenant only for an allowlisted GitHub ID", async () => {
    const result = await requireHarborUser(request());

    expect(result.context.userId).toBe("auth-user-one");
    expect(result.identity).toMatchObject({
      githubId: "123456789",
      email: "harbor@example.test",
    });
    expect(mocks.ensureDefaultSettings).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "auth-user-one" }),
    );
  });

  it("denies unapproved identities before creating Harbor-owned rows", async () => {
    mocks.resolveGithubId.mockResolvedValue("987654321");

    await expect(requireHarborUser(request())).rejects.toMatchObject({
      code: "ACCESS_NOT_ALLOWED",
      status: 403,
    });
    expect(mocks.getUserVault).not.toHaveBeenCalled();
    expect(mocks.insertUserVault).not.toHaveBeenCalled();
    expect(mocks.ensureDefaultSettings).not.toHaveBeenCalled();
  });

  it("returns 401 when the managed session is missing", async () => {
    mocks.getSession.mockResolvedValue({ data: null });

    await expect(requireHarborUser(request())).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
    });
    expect(mocks.resolveGithubId).not.toHaveBeenCalled();
  });

  it("binds CSRF verification to the managed session", async () => {
    const cookie = createCsrfCookie("session-one");
    const cookieValue = cookie.split(";")[0].slice("harbor_csrf=".length);
    const decoded = decodeURIComponent(cookieValue);
    const accepted = request("POST", {
      origin: "http://127.0.0.1:47832",
      "content-type": "application/json",
      cookie: `harbor_csrf=${cookieValue}`,
      "x-harbor-csrf": decoded,
    });

    await expect(
      requireHarborUser(accepted, { csrf: true }),
    ).resolves.toMatchObject({
      context: { userId: "auth-user-one" },
    });

    const rejected = request("POST", {
      origin: "http://127.0.0.1:47832",
      "content-type": "application/json",
      cookie: `harbor_csrf=${cookieValue}`,
      "x-harbor-csrf": `${decoded}tampered`,
    });
    await expect(
      requireHarborUser(rejected, { csrf: true }),
    ).rejects.toMatchObject({ code: "INVALID_CSRF", status: 403 });
  });

  it("rejects hostile origins before session or tenant work", async () => {
    await expect(
      requireHarborUser(
        request("POST", {
          origin: "https://attacker.example",
          "content-type": "application/json",
        }),
        { csrf: true },
      ),
    ).rejects.toMatchObject({ code: "INVALID_ORIGIN", status: 403 });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
