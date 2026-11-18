// Medien aus WhatsApp Flows entschlüsseln (Meta-Doku „Media upload“, Abschnitt Encryption, abgerufen 19.11.2026). Rein.
//
// Liefert Meta eine Datei mit encryption_metadata (cdn_url, Endpoint-Fall), liegt sie bei WhatsApp verschlüsselt mit
// „AES256-CBC+HMAC-SHA256+pkcs7“: cdn_file = ciphertext ‖ hmac10 (die ersten 10 Bytes von HMAC-SHA256). Schritte:
//   1. SHA256(cdn_file) == encrypted_hash
//   2. HMAC-SHA256(hmac_key, iv ‖ ciphertext), die ersten 10 Bytes == hmac10 (zeitkonstant verglichen)
//   3. AES-256-CBC mit encryption_key und iv entschlüsseln, PKCS#7-Padding entfernen
//   4. SHA256(Klartext) == plaintext_hash
// Alle Werte in encryption_metadata sind Base64 (laut Beispiel der Doku; die Doku sagt es nicht ausdrücklich). Die
// Antwortnachricht (Webhook nfm_reply) liefert stattdessen eine Media-ID und sha256 (Base64 des Klartext-Hashs); dann
// lädt server.ts die Datei wie normale Bilder und prüft nur den Hash (pruefeSha256).

import { createDecipheriv, createHash, createHmac, timingSafeEqual } from "node:crypto";

export type EncryptionMetadata = {
  encrypted_hash: string;
  iv: string;
  encryption_key: string;
  hmac_key: string;
  plaintext_hash: string;
};

export type EntschluesselFehler = "format" | "enc_hash" | "hmac" | "entschluesseln" | "plaintext_hash";
export class FlowMediaFehler extends Error {
  constructor(readonly grund: EntschluesselFehler) {
    super(`Flow-Medium ungültig: ${grund}`);
    this.name = "FlowMediaFehler";
  }
}

const b64 = (s: string) => Buffer.from(s, "base64");
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();
const gleich = (x: Buffer, y: Buffer) => x.length === y.length && timingSafeEqual(x, y);

/** cdn_file prüfen und entschlüsseln (Schritte 1 bis 4). Wirft FlowMediaFehler mit Grund. */
export function entschluesseleFlowMedium(cdnFile: Buffer, m: EncryptionMetadata): Buffer {
  const key = b64(m.encryption_key);
  const hmacKey = b64(m.hmac_key);
  const iv = b64(m.iv);
  if (key.length !== 32 || iv.length !== 16 || !hmacKey.length || cdnFile.length < 10 + 16 || (cdnFile.length - 10) % 16 !== 0) throw new FlowMediaFehler("format");
  if (!gleich(sha256(cdnFile), b64(m.encrypted_hash))) throw new FlowMediaFehler("enc_hash");
  const ciphertext = cdnFile.subarray(0, cdnFile.length - 10);
  const hmac10 = cdnFile.subarray(cdnFile.length - 10);
  const mac = createHmac("sha256", hmacKey).update(iv).update(ciphertext).digest().subarray(0, 10);
  if (!gleich(mac, hmac10)) throw new FlowMediaFehler("hmac");
  let klar: Buffer;
  try {
    const d = createDecipheriv("aes-256-cbc", key, iv);
    klar = Buffer.concat([d.update(ciphertext), d.final()]);
  } catch {
    throw new FlowMediaFehler("entschluesseln");
  }
  if (!gleich(sha256(klar), b64(m.plaintext_hash))) throw new FlowMediaFehler("plaintext_hash");
  return klar;
}

/** sha256 aus der Antwortnachricht (Base64 bzw. Hex) gegen die geladene Datei. */
export function pruefeSha256(data: Buffer, erwartet: string | null | undefined): boolean {
  const e = (erwartet ?? "").trim();
  if (!e) return false;
  const ist = sha256(data);
  const soll = /^[0-9a-f]{64}$/i.test(e) ? Buffer.from(e, "hex") : b64(e);
  return gleich(ist, soll);
}
