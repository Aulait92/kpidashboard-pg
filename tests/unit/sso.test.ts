import { describe, expect, it } from "vitest";
import { providerErrorCode, verifiedEmail } from "@/lib/sso";

const now = Date.UTC(2026, 10, 10, 12);
const exp = now / 1000 + 600;
const base = { clientId: "app", nonce: "n1", now };

describe("Anmeldung mit Google/Microsoft: ID-Token prüfen", () => {
  it("Google: nur bestätigte E-Mail", () => {
    const c = { iss: "https://accounts.google.com", aud: "app", exp, nonce: "n1", email: "a@b.de", email_verified: true };
    expect(verifiedEmail("google", c, base)).toBe("a@b.de");
    expect(() => verifiedEmail("google", { ...c, email_verified: false }, base)).toThrow(/nicht bestätigt/);
  });

  it("lehnt falschen Empfänger, falsche Nonce und Ablauf ab", () => {
    const c = { iss: "https://accounts.google.com", aud: "app", exp, nonce: "n1", email: "a@b.de", email_verified: true };
    expect(() => verifiedEmail("google", { ...c, aud: "andere-app" }, base)).toThrow(/Empfänger/);
    expect(() => verifiedEmail("google", { ...c, nonce: "x" }, base)).toThrow(/Nonce/);
    expect(() => verifiedEmail("google", { ...c, exp: now / 1000 - 3600 }, base)).toThrow(/abgelaufen/);
    expect(() => verifiedEmail("google", { ...c, iss: "https://evil.example" }, base)).toThrow(/Aussteller/);
  });

  it("Microsoft-Firmenkonto: Anmeldename statt frei setzbarem email-Attribut", () => {
    const tid = "11111111-2222-3333-4444-555555555555";
    const c = { iss: `https://login.microsoftonline.com/${tid}/v2.0`, tid, aud: "app", exp, nonce: "n1", email: "chef@opfer.de", preferred_username: "angreifer@boese.de" };
    expect(verifiedEmail("microsoft", c, base)).toBe("angreifer@boese.de");
  });

  it("Microsoft-Privatkonto: E-Mail von Microsoft", () => {
    const tid = "9188040d-6c67-4c5b-b112-36a304b66dad";
    const c = { iss: `https://login.microsoftonline.com/${tid}/v2.0`, tid, aud: "app", exp, nonce: "n1", email: "privat@outlook.de" };
    expect(verifiedEmail("microsoft", c, base)).toBe("privat@outlook.de");
    expect(() => verifiedEmail("microsoft", { ...c, iss: "https://login.microsoftonline.com/andere/v2.0" }, base)).toThrow(/Aussteller/);
  });
});

describe("Anmeldung: Fehlercode des Anbieters", () => {
  it("schneidet maskiert angehängte Parameter ab", () => {
    expect(providerErrorCode("access_denied")).toBe("access_denied");
    expect(providerErrorCode("access_denied\\u0026error_subcode=cancel\\u0026state=x")).toBe("access_denied");
    expect(providerErrorCode("access_deniedu0026error_subcode=cancel")).toBe("access_denied");
    expect(providerErrorCode("access_denied%26error_subcode=cancel")).toBe("access_denied");
    expect(providerErrorCode("access_denied&error_subcode=cancel")).toBe("access_denied");
    expect(providerErrorCode("invalid_request")).toBe("invalid_request");
  });
});
