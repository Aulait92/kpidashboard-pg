// Zwei-Faktor-Codes nach RFC 6238 (TOTP, 6 Ziffern, 30 Sekunden, SHA-1),
// kompatibel mit Google Authenticator, 1Password, Microsoft Authenticator.
import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Ungültiger Schlüssel.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret: string, timeMs = Date.now(), step = 30): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return bin.toString().padStart(6, "0");
}

/** Prüft einen Code; erlaubt ±1 Zeitfenster (Uhren laufen nie exakt gleich). */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  for (const drift of [-1, 0, 1]) {
    const expected = totpCode(secret, timeMs + drift * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, account: string, issuer = "performancegrowth"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** 8 Notfall-Codes (Klartext nur einmal anzeigen, gespeichert wird der Hash). */
export function generateBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export const hashBackupCode = (code: string) =>
  crypto.createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
