import { describe, expect, it } from "vitest";
import { paketAblauf, paketLinkGueltig, paketPfad } from "@/lib/belege/paket-link";

// Download-Link fürs Belegpaket (Ole, 24.11.2026): signiert, läuft ab, passt nur zur eigenen Paket-ID.
const secret = "x".repeat(32);
const now = new Date("2026-11-24T20:00:00Z");

describe("Belegpaket-Link", () => {
  const ablauf = paketAblauf(now);
  const url = new URL(`https://app.test${paketPfad("paket1", ablauf, secret)}`);
  const e = url.searchParams.get("e");
  const t = url.searchParams.get("t");
  it("gültig mit richtiger Signatur vor Ablauf", () => {
    expect(paketLinkGueltig("paket1", e, t, now, secret)).toBe(true);
  });
  it("ungültig für andere ID, falsche Signatur, anderen Schlüssel", () => {
    expect(paketLinkGueltig("paket2", e, t, now, secret)).toBe(false);
    expect(paketLinkGueltig("paket1", e, `${t}x`, now, secret)).toBe(false);
    expect(paketLinkGueltig("paket1", e, t, now, "y".repeat(32))).toBe(false);
    expect(paketLinkGueltig("paket1", null, t, now, secret)).toBe(false);
  });
  it("abgelaufen nach 30 Tagen", () => {
    expect(paketLinkGueltig("paket1", e, t, new Date(now.getTime() + 31 * 86_400_000), secret)).toBe(false);
  });
  it("ohne Schlüssel kein Link", () => {
    expect(() => paketPfad("paket1", ablauf, "")).toThrow();
  });
});
