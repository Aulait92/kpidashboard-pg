import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// App-seitige Verschlüsselung für sensible Felder (360dialog-API-Keys,
// Google-OAuth-Tokens, …) der WhatsApp-CRM-Tabellen. AES-256-GCM mit
// zufälligem IV je Wert; der 256-bit-Schlüssel kommt aus der Umgebung
// (ENCRYPTION_KEY = base64-kodierte 32 Bytes) und soll aus einem
// KMS/Secret-Manager stammen — nie im Repo, nie im Klartext in der DB.
//
// Gespeichertes Format (ein String):
//   "v1:<ivB64>:<authTagB64>:<ciphertextB64>"

const PREFIX = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM-Standard (96 bit)

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY fehlt. 32 zufällige Bytes als base64 setzen " +
        "(z. B. `openssl rand -base64 32`).",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY muss 32 Bytes (base64) sein, dekodiert sind es ${key.length}.`,
    );
  }
  return key;
}

/** Verschlüsselt Klartext zu einem selbstbeschreibenden String. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/** Entschlüsselt einen mit encryptSecret erzeugten String. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Ungültiges Ciphertext-Format.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

/** Wie encryptSecret, aber null/leer bleibt null (für optionale DB-Felder). */
export function encryptNullable(v: string | null | undefined): string | null {
  return v == null || v === "" ? null : encryptSecret(v);
}

/** Wie decryptSecret, aber null/leer bleibt null. */
export function decryptNullable(v: string | null | undefined): string | null {
  return v == null || v === "" ? null : decryptSecret(v);
}

/** True, wenn der Wert im erwarteten Ciphertext-Format vorliegt. */
export function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith(`${PREFIX}:`);
}
