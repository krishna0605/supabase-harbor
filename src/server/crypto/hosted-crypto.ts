import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { HarborError } from "@/shared/errors/harbor-error";

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const ROOT_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export type CipherEnvelope = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
};

export type UserVaultRecord = {
  wrappedDek: Buffer;
  wrappedDekNonce: Buffer;
  wrappedDekTag: Buffer;
  rootKeyVersion: number;
};

export type RootKey = {
  key: Buffer;
  version: number;
};

export type RootKeyring = {
  current: RootKey;
  previous?: RootKey;
};

function parseVersion(name: string, value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return Number(value);
}

function parseKey(name: string, value: string | undefined) {
  if (!value || !ROOT_KEY_PATTERN.test(value)) {
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    key.fill(0);
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  }
  return key;
}

export function parseRootKeyring(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RootKeyring {
  const current = {
    key: parseKey("HARBOR_MASTER_KEY", environment.HARBOR_MASTER_KEY),
    version: parseVersion(
      "HARBOR_MASTER_KEY_VERSION",
      environment.HARBOR_MASTER_KEY_VERSION,
    ),
  };
  const hasPreviousKey = Boolean(environment.HARBOR_PREVIOUS_MASTER_KEY);
  const hasPreviousVersion = Boolean(
    environment.HARBOR_PREVIOUS_MASTER_KEY_VERSION,
  );

  if (hasPreviousKey !== hasPreviousVersion) {
    current.key.fill(0);
    throw new Error(
      "HARBOR_PREVIOUS_MASTER_KEY and HARBOR_PREVIOUS_MASTER_KEY_VERSION must be configured together.",
    );
  }
  if (!hasPreviousKey) return { current };

  const previous = {
    key: parseKey(
      "HARBOR_PREVIOUS_MASTER_KEY",
      environment.HARBOR_PREVIOUS_MASTER_KEY,
    ),
    version: parseVersion(
      "HARBOR_PREVIOUS_MASTER_KEY_VERSION",
      environment.HARBOR_PREVIOUS_MASTER_KEY_VERSION,
    ),
  };
  if (previous.version === current.version) {
    current.key.fill(0);
    previous.key.fill(0);
    throw new Error("Current and previous master-key versions must differ.");
  }
  return { current, previous };
}

function aad(parts: string[]) {
  return Buffer.from(JSON.stringify(parts), "utf8");
}

function encryptGcm(
  plaintext: Buffer,
  key: Buffer,
  additionalData: Buffer,
): CipherEnvelope {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function decryptGcm(
  envelope: CipherEnvelope,
  key: Buffer,
  additionalData: Buffer,
) {
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce);
  decipher.setAAD(additionalData);
  decipher.setAuthTag(envelope.tag);
  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]);
}

function deriveSubkey(dek: Buffer, purpose: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      dek,
      Buffer.from("supabase-harbor:hosted:v1"),
      Buffer.from(purpose),
      KEY_BYTES,
    ),
  );
}

function keyForVersion(keyring: RootKeyring, version: number) {
  if (keyring.current.version === version) return keyring.current.key;
  if (keyring.previous?.version === version) return keyring.previous.key;
  throw new HarborError(
    "ROOT_KEY_VERSION_UNAVAILABLE",
    "The encrypted vault requires an unavailable master-key version.",
    503,
  );
}

function vaultAad(userId: string) {
  return aad(["supabase-harbor", "user-dek", "v1", userId]);
}

function tokenAad(userId: string, accountId: string) {
  return aad(["supabase-harbor", "pat", "v2", userId, accountId]);
}

function wrapDek(dek: Buffer, userId: string, rootKey: RootKey) {
  const wrapped = encryptGcm(dek, rootKey.key, vaultAad(userId));
  return {
    wrappedDek: wrapped.ciphertext,
    wrappedDekNonce: wrapped.nonce,
    wrappedDekTag: wrapped.tag,
    rootKeyVersion: rootKey.version,
  } satisfies UserVaultRecord;
}

export function createUserVault(userId: string, keyring = parseRootKeyring()) {
  const dek = randomBytes(KEY_BYTES);
  return {
    dek,
    record: wrapDek(dek, userId, keyring.current),
  };
}

export function unwrapUserDek(
  userId: string,
  record: UserVaultRecord,
  keyring = parseRootKeyring(),
) {
  const rootKey = keyForVersion(keyring, record.rootKeyVersion);
  try {
    return decryptGcm(
      {
        ciphertext: record.wrappedDek,
        nonce: record.wrappedDekNonce,
        tag: record.wrappedDekTag,
      },
      rootKey,
      vaultAad(userId),
    );
  } catch (error) {
    if (error instanceof HarborError) throw error;
    throw new HarborError(
      "USER_VAULT_DECRYPTION_FAILED",
      "The encrypted user vault could not be opened.",
      500,
    );
  }
}

export function rewrapUserDek(
  userId: string,
  record: UserVaultRecord,
  keyring = parseRootKeyring(),
) {
  const dek = unwrapUserDek(userId, record, keyring);
  try {
    return wrapDek(dek, userId, keyring.current);
  } finally {
    dek.fill(0);
  }
}

export function encryptHostedToken(
  token: string,
  userId: string,
  accountId: string,
  dek: Buffer,
) {
  const key = deriveSubkey(dek, "pat-encryption-key:v2");
  try {
    return encryptGcm(
      Buffer.from(token, "utf8"),
      key,
      tokenAad(userId, accountId),
    );
  } finally {
    key.fill(0);
  }
}

export function decryptHostedToken(
  envelope: CipherEnvelope,
  userId: string,
  accountId: string,
  dek: Buffer,
) {
  const key = deriveSubkey(dek, "pat-encryption-key:v2");
  try {
    return decryptGcm(envelope, key, tokenAad(userId, accountId)).toString(
      "utf8",
    );
  } finally {
    key.fill(0);
  }
}

export function fingerprintHostedToken(token: string, dek: Buffer) {
  const key = deriveSubkey(dek, "pat-fingerprint-key:v2");
  try {
    return createHmac("sha256", key)
      .update("supabase-harbor:pat-fingerprint:v2\0")
      .update(token)
      .digest("hex");
  } finally {
    key.fill(0);
  }
}

export function destroyRootKeyring(keyring: RootKeyring) {
  keyring.current.key.fill(0);
  keyring.previous?.key.fill(0);
}
