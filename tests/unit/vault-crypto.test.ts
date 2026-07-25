import { describe, expect, it } from "vitest";
import {
  createVault,
  decryptToken,
  encryptToken,
  fingerprintToken,
  rewrapDek,
  unlockVault,
} from "@/server/crypto/vault-crypto";

const PASSWORD = "harbor-test-password-one";
const NEW_PASSWORD = "harbor-test-password-two";

describe("vault cryptography", () => {
  it("round-trips tokens with independent nonces", async () => {
    const { dek } = await createVault(PASSWORD);
    const token = "sbp_unit_test_secret_never_persist";
    const first = encryptToken(token, dek);
    const second = encryptToken(token, dek);
    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(decryptToken(first, dek)).toBe(token);
    expect(fingerprintToken(token, dek)).toBe(fingerprintToken(token, dek));
    dek.fill(0);
  });

  it("rejects a wrong password and modified ciphertext", async () => {
    const { dek, record } = await createVault(PASSWORD);
    await expect(
      unlockVault("definitely-the-wrong-password", record),
    ).rejects.toMatchObject({
      code: "INVALID_MASTER_PASSWORD",
    });
    const envelope = encryptToken("sbp_tamper_test_secret", dek);
    envelope.ciphertext[0] ^= 1;
    expect(() => decryptToken(envelope, dek)).toThrow();
    dek.fill(0);
  });

  it("rewraps the same DEK with a new password", async () => {
    const { dek } = await createVault(PASSWORD);
    const newRecord = await rewrapDek(dek, NEW_PASSWORD);
    const unlocked = await unlockVault(NEW_PASSWORD, newRecord);
    expect(unlocked.equals(dek)).toBe(true);
    unlocked.fill(0);
    dek.fill(0);
  });
});
