import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createUserVault,
  decryptHostedToken,
  destroyRootKeyring,
  encryptHostedToken,
  fingerprintHostedToken,
  parseRootKeyring,
  rewrapUserDek,
  type RootKeyring,
  unwrapUserDek,
} from "@/server/crypto/hosted-crypto";

const keyring = (version: number, previous?: RootKeyring["current"]) => ({
  current: { version, key: randomBytes(32) },
  previous,
});

const allocated: RootKeyring[] = [];

afterEach(() => {
  for (const keys of allocated.splice(0)) destroyRootKeyring(keys);
});

describe("hosted envelope encryption", () => {
  it("round-trips a tenant-bound PAT with independent nonces", () => {
    const keys = keyring(1);
    allocated.push(keys);
    const { dek, record } = createUserVault("user-one", keys);
    const opened = unwrapUserDek("user-one", record, keys);
    const first = encryptHostedToken(
      "sbp_hosted_fixture_secret",
      "user-one",
      "account-one",
      opened,
    );
    const second = encryptHostedToken(
      "sbp_hosted_fixture_secret",
      "user-one",
      "account-one",
      opened,
    );

    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(
      decryptHostedToken(first, "user-one", "account-one", opened),
    ).toBe("sbp_hosted_fixture_secret");
    expect(
      fingerprintHostedToken("sbp_hosted_fixture_secret", opened),
    ).toBe(fingerprintHostedToken("sbp_hosted_fixture_secret", opened));
    opened.fill(0);
    dek.fill(0);
  });

  it("rejects ciphertext moved between tenants or accounts", () => {
    const keys = keyring(1);
    allocated.push(keys);
    const { dek } = createUserVault("user-one", keys);
    const envelope = encryptHostedToken(
      "sbp_tenant_binding_fixture",
      "user-one",
      "account-one",
      dek,
    );

    expect(() =>
      decryptHostedToken(envelope, "user-two", "account-one", dek),
    ).toThrow();
    expect(() =>
      decryptHostedToken(envelope, "user-one", "account-two", dek),
    ).toThrow();
    dek.fill(0);
  });

  it("scopes duplicate detection to each user's independent DEK", () => {
    const keys = keyring(1);
    allocated.push(keys);
    const first = createUserVault("user-one", keys);
    const second = createUserVault("user-two", keys);

    expect(fingerprintHostedToken("same-token", first.dek)).not.toBe(
      fingerprintHostedToken("same-token", second.dek),
    );
    first.dek.fill(0);
    second.dek.fill(0);
  });

  it("rewraps only the user DEK during root-key rotation", () => {
    const oldKeys = keyring(1);
    const rotated = keyring(2, oldKeys.current);
    allocated.push(oldKeys, rotated);
    const { dek, record } = createUserVault("user-rotate", oldKeys);
    const token = encryptHostedToken(
      "sbp_rotation_fixture",
      "user-rotate",
      "account-rotate",
      dek,
    );
    const rewrapped = rewrapUserDek("user-rotate", record, rotated);
    const reopened = unwrapUserDek("user-rotate", rewrapped, rotated);

    expect(rewrapped.rootKeyVersion).toBe(2);
    expect(
      decryptHostedToken(
        token,
        "user-rotate",
        "account-rotate",
        reopened,
      ),
    ).toBe("sbp_rotation_fixture");
    reopened.fill(0);
    dek.fill(0);
  });

  it("fails closed for malformed or incomplete root-key configuration", () => {
    expect(() =>
      parseRootKeyring({
        HARBOR_MASTER_KEY: "not-base64",
        HARBOR_MASTER_KEY_VERSION: "1",
      }),
    ).toThrow("base64-encoded 32-byte key");

    expect(() =>
      parseRootKeyring({
        HARBOR_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"),
        HARBOR_MASTER_KEY_VERSION: "1",
        HARBOR_PREVIOUS_MASTER_KEY: Buffer.alloc(32, 2).toString("base64"),
      }),
    ).toThrow("configured together");
  });
});
