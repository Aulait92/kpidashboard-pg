// Nutzungsanalyse (Ole, 17.11.2026): Aufnahme nur unter /buyer, Kennungen geschwärzt, Frage erst nach 2 Tagen und
// ohne offene Einrichtung, Texte ohne Gedankenstriche, Pseudonym ohne Klartext.
import { describe, expect, it } from "vitest";
import { isReplayAllowedPath, redactTokenPaths } from "@/lib/sentry-redact";
import { ANALYSE_TEXT, darfAnalyseFragen } from "@/lib/nutzungsanalyse";
import { analysePseudonym } from "@/lib/nutzungsanalyse-server";

describe("Nutzungsanalyse", () => {
  it("Positivliste: nur Vermittlerbereich", () => {
    expect(isReplayAllowedPath("/buyer")).toBe(true);
    expect(isReplayAllowedPath("/buyer/kontakte")).toBe(true);
    expect(isReplayAllowedPath("https://app.performancegrowth.de/buyer/termine/x/vorbereitung")).toBe(true);
    for (const p of ["/admin", "/admin/heute", "/login", "/book/ole", "/angebot/abc", "/empfehlung/x", "/rechtliches/agb", "/"]) expect(isReplayAllowedPath(p)).toBe(false);
  });
  it("Kennungen in Pfaden werden geschwärzt", () => {
    expect(redactTokenPaths("/buyer/kontakte/cmwkr6a990006kx7dg43ye903")).toBe("/buyer/kontakte/[id]");
    expect(redactTokenPaths("https://x.de/buyer/termine/cmwkr6a990006kx7dg43ye903/vorbereitung?a=1")).toBe("https://x.de/buyer/termine/[id]/vorbereitung?a=1");
    expect(redactTokenPaths("/buyer/x/123e4567-e89b-12d3-a456-426614174000")).toBe("/buyer/x/[id]");
    expect(redactTokenPaths("/buyer/kontakte")).toBe("/buyer/kontakte");
  });
  it("Frage erst nach 2 Tagen und ohne offene Einrichtung", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(darfAnalyseFragen({ createdAt: new Date("2026-11-19T10:00:00Z"), einrichtungOffen: 0, now })).toBe(false);
    expect(darfAnalyseFragen({ createdAt: new Date("2026-11-17T10:00:00Z"), einrichtungOffen: 2, now })).toBe(false);
    expect(darfAnalyseFragen({ createdAt: new Date("2026-11-17T10:00:00Z"), einrichtungOffen: 0, now })).toBe(true);
  });
  it("Texte ohne Gedankenstriche, Pseudonym ohne Klartext", () => {
    for (const t of Object.values(ANALYSE_TEXT)) expect(t).not.toMatch(/[–—]/);
    const p = analysePseudonym("user_123");
    expect(p).toMatch(/^[0-9a-f]{16}$/);
    expect(p).not.toContain("user");
  });
});
