import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateBackupCodes, hashBackupCode, totpCode, verifyTotp } from "@/lib/totp";

// Testvektor aus RFC 6238 (SHA-1, Schlüssel "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("Base32 hin und zurück", () => {
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
  });

  it.each([
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
  ])("RFC-6238-Vektor bei %i ms → %s", (t, code) => {
    expect(totpCode(RFC_SECRET, t)).toBe(code);
  });

  it("akzeptiert den aktuellen und benachbarten Code, nicht ältere", () => {
    const t = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 30_000), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 90_000), t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12ab56", t)).toBe(false);
  });

  it("Notfall-Codes: eindeutig, Hash unabhängig von Schreibweise", () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(8);
    expect(hashBackupCode(codes[0])).toBe(hashBackupCode(codes[0].toLowerCase().replace("-", " ")));
  });
});
