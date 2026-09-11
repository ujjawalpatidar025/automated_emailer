import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const SALT = "automator-email-static-salt-v1";

function getKey() {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is not set in server/.env");
  }
  // A 64-char hex string is used directly as the 32-byte key; anything else
  // (e.g. a plain passphrase) is stretched into one with scrypt.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.scryptSync(raw, SALT, 32);
}

/** Encrypts a secret (e.g. a Gmail App Password) for storage at rest. */
export function encryptSecret(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload) {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
