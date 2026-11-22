import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_URL = "https://app.performancegrowth.de";
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { vorlagenKatalog } from "@/lib/vertrieb/nachricht-vorschau";

const GEDANKENSTRICH = /\s[–—]\s/;
const now = new Date("2026-11-22T10:00:00Z");

describe("Vorlagen-Katalog (Einstellungen → Mail- und WhatsApp-Vorlagen)", () => {
  it("jede Mail hat Betreff, HTML und keine Gedankenstriche", () => {
    for (const an of ["sie", "du"] as const) {
      const gruppen = vorlagenKatalog(an, now);
      expect(gruppen.map((g) => g.key)).toEqual(["termin", "angebot", "einrichtung", "mahnung"]);
      for (const e of gruppen.flatMap((g) => g.eintraege)) {
        expect(e.teile.length).toBeGreaterThan(0);
        for (const t of e.teile) {
          if (t.kanal !== "email") continue;
          expect(t.betreff, e.key).toBeTruthy();
          expect(t.html, e.key).toContain("<");
          expect(GEDANKENSTRICH.test(t.betreff), e.key).toBe(false);
        }
      }
    }
  });

  it("Du-Fassung nur, wo es sie gibt: Zahlung und Bonus duzen, Termine bleiben Sie", () => {
    const eintrag = (an: "sie" | "du", key: string) => vorlagenKatalog(an, now).flatMap((g) => g.eintraege).find((e) => e.key === key)!;
    const zahlungDu = eintrag("du", "zahlung-1").teile[0];
    const zahlungSie = eintrag("sie", "zahlung-1").teile[0];
    expect(zahlungDu.kanal === "email" && zahlungDu.betreff).toContain("dein Angebot");
    expect(zahlungSie.kanal === "email" && zahlungSie.betreff).toContain("Ihr Angebot");
    expect(eintrag("du", "termin-24h").du).toBe(false);
    expect(eintrag("du", "bonus-letzter").du).toBe(true);
  });

  it("1. und 2. Mahnung zeigen die Rechnung als Anhang, die Erinnerung nicht", () => {
    const m = vorlagenKatalog("sie", now).find((g) => g.key === "mahnung")!.eintraege;
    const anhang = (key: string) => {
      const t = m.find((e) => e.key === key)!.teile[0];
      return t.kanal === "email" ? t.anhaenge : [];
    };
    expect(anhang("mahnung-mahnung1")).toEqual(["Rechnung-PG-1234-0007.pdf"]);
    expect(anhang("mahnung-erinnerung")).toEqual([]);
  });
});
