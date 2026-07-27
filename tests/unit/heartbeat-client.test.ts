import { afterEach, describe, expect, it, vi } from "vitest";
import {
  heartbeatUrl,
  pingProject,
} from "@/server/keepalive/heartbeat-client";

afterEach(() => vi.unstubAllGlobals());

describe("keepalive heartbeat client", () => {
  it("constructs only a fixed Supabase project host", () => {
    expect(heartbeatUrl("abcdefghijklmnopqrst")).toBe(
      "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/harbor_ping",
    );
    expect(() => heartbeatUrl("localhost")).toThrow(
      "project reference is invalid",
    );
    expect(() => heartbeatUrl("abc.supabase.co")).toThrow();
    expect(() => heartbeatUrl("https://example.com")).toThrow();
  });

  it("posts an empty object without redirects or authorization headers", async () => {
    const timestamp = new Date().toISOString();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(timestamp), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pingProject("abcdefghijklmnopqrst", "sb_publishable_fixture"),
    ).resolves.toMatchObject({ pingedAt: timestamp, upstreamStatus: 200 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("error");
    expect(init.body).toBe("{}");
    expect(init.headers).toMatchObject({
      apikey: "sb_publishable_fixture",
      "content-type": "application/json",
    });
    expect(
      (init.headers as Record<string, string>).authorization,
    ).toBeUndefined();
  });

  it("normalizes missing RPC and rejected keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(
      pingProject("abcdefghijklmnopqrst", "sb_publishable_fixture"),
    ).rejects.toMatchObject({ code: "KEEPALIVE_RPC_NOT_INSTALLED" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(
      pingProject("abcdefghijklmnopqrst", "sb_publishable_fixture"),
    ).rejects.toMatchObject({ code: "KEEPALIVE_KEY_REJECTED" });
  });
});
