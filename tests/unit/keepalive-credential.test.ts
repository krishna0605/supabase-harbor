import { describe, expect, it } from "vitest";
import {
  selectKeepaliveCredential,
  validateKeepaliveCredential,
} from "@/features/keepalive/credential-validation";

function legacy(role: string) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
    Buffer.from(JSON.stringify({ role })).toString("base64url"),
    "fixture-signature",
  ].join(".");
}

describe("keepalive credential validation", () => {
  it("accepts publishable and legacy anon keys", () => {
    expect(validateKeepaliveCredential("sb_publishable_fixture")).toMatchObject({
      type: "publishable",
    });
    expect(validateKeepaliveCredential(legacy("anon"))).toMatchObject({
      type: "legacy_anon",
    });
  });

  it("rejects privileged and malformed keys", () => {
    expect(() => validateKeepaliveCredential("sb_secret_fixture")).toThrow(
      "never accepts Supabase secret keys",
    );
    expect(() => validateKeepaliveCredential(legacy("service_role"))).toThrow(
      "never accepts Supabase service-role keys",
    );
    expect(() => validateKeepaliveCredential("not-a-key")).toThrow(
      "publishable key or legacy anon key",
    );
  });

  it("prefers modern publishable keys during discovery", () => {
    expect(
      selectKeepaliveCredential([
        {
          id: "legacy",
          type: "legacy",
          api_key: legacy("anon"),
          secret_jwt_template: { role: "anon" },
        },
        {
          id: "modern",
          type: "publishable",
          api_key: "sb_publishable_modern",
        },
      ]),
    ).toMatchObject({
      type: "publishable",
      keyId: "modern",
      value: "sb_publishable_modern",
    });
  });
});
