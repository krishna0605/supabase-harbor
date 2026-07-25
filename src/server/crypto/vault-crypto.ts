import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt as scryptCallback,
} from "node:crypto";
import { HarborError } from "@/shared/errors/harbor-error";

const KDF = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const AAD_DEK = Buffer.from("supabase-harbor:dek:v1");
const AAD_TOKEN = Buffer.from("supabase-harbor:token:v1");

export type CipherEnvelope = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
};

export type VaultRecord = {
  kdfSalt: Buffer;
  kdfParameters: string;
  wrappedDek: Buffer;
  wrappedDekNonce: Buffer;
  wrappedDekTag: Buffer;
};

async function deriveKek(password: string, salt: Buffer) {
  if (password.length < 12) {
    throw new HarborError(
      "WEAK_MASTER_PASSWORD",
      "Use a master password with at least 12 characters.",
      400,
    );
  }
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 32, KDF, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function encryptGcm(
  plaintext: Buffer,
  key: Buffer,
  aad: Buffer,
): CipherEnvelope {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function decryptGcm(envelope: CipherEnvelope, key: Buffer, aad: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(envelope.tag);
  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]);
}

export async function createVault(password: string) {
  const kdfSalt = randomBytes(16);
  const dek = randomBytes(32);
  const kek = await deriveKek(password, kdfSalt);
  const wrapped = encryptGcm(dek, kek, AAD_DEK);
  kek.fill(0);
  return {
    dek,
    record: {
      kdfSalt,
      kdfParameters: JSON.stringify(KDF),
      wrappedDek: wrapped.ciphertext,
      wrappedDekNonce: wrapped.nonce,
      wrappedDekTag: wrapped.tag,
    } satisfies VaultRecord,
  };
}

export async function unlockVault(password: string, record: VaultRecord) {
  const kek = await deriveKek(password, record.kdfSalt);
  try {
    return decryptGcm(
      {
        ciphertext: record.wrappedDek,
        nonce: record.wrappedDekNonce,
        tag: record.wrappedDekTag,
      },
      kek,
      AAD_DEK,
    );
  } catch {
    throw new HarborError(
      "INVALID_MASTER_PASSWORD",
      "The master password is incorrect.",
      401,
    );
  } finally {
    kek.fill(0);
  }
}

export async function rewrapDek(
  dek: Buffer,
  newPassword: string,
): Promise<VaultRecord> {
  const kdfSalt = randomBytes(16);
  const kek = await deriveKek(newPassword, kdfSalt);
  const wrapped = encryptGcm(dek, kek, AAD_DEK);
  kek.fill(0);
  return {
    kdfSalt,
    kdfParameters: JSON.stringify(KDF),
    wrappedDek: wrapped.ciphertext,
    wrappedDekNonce: wrapped.nonce,
    wrappedDekTag: wrapped.tag,
  };
}

function deriveSubkey(dek: Buffer, info: string) {
  return Buffer.from(
    hkdfSync("sha256", dek, Buffer.alloc(0), Buffer.from(info), 32),
  );
}

export function encryptToken(token: string, dek: Buffer) {
  const key = deriveSubkey(dek, "supabase-harbor:token-key:v1");
  const result = encryptGcm(Buffer.from(token, "utf8"), key, AAD_TOKEN);
  key.fill(0);
  return result;
}

export function decryptToken(envelope: CipherEnvelope, dek: Buffer) {
  const key = deriveSubkey(dek, "supabase-harbor:token-key:v1");
  try {
    return decryptGcm(envelope, key, AAD_TOKEN).toString("utf8");
  } finally {
    key.fill(0);
  }
}

export function fingerprintToken(token: string, dek: Buffer) {
  const key = deriveSubkey(dek, "supabase-harbor:fingerprint-key:v1");
  try {
    return createHmac("sha256", key).update(token).digest("hex");
  } finally {
    key.fill(0);
  }
}
