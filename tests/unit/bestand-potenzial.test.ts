import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EIGENE_MIN,
  eigeneZahlen,
  erwarteteProvision,
  nachEuro,
  provisionForLine,
  quotenFor,
  rundeSpanne,
  spanneText,
  STANDARD_QUOTEN,
  type Spanne,
} from "@/lib/bestand/potenzial";
import { campaignText, nextBestLine, naheliegendesThema, type Occasion } from "@/lib/bestand/campaigns";
import { campaignMailFooter, defaultCampaignMail, hasImprint } from "@/lib/bestand/kampagnen-mail";
import { consentQuestion } from "@/lib/bestand/einwilligung";
import { offeredLines } from "@/lib/bestand/befugnis";
import { effectiveRates } from "@/lib/provision";

const OCC: Occasion[] = ["cross_sell", "review", "birthday", "renewal", "empfehlung"];

describe("Euro-Potenzial je Chance (Cockpit „Heute zuerst“)", () => {
  it("Provision je Sparte aus den Standardsätzen, eigene Sätze gehen vor", () => {
    // Hausrat: 55 % von 120 € Jahresbeitrag (Standard), Bestand erst ab dem 2. Jahr
    expect(provisionForLine("Hausrat")).toBe(66);
    // Kfz: keine Abschlussprovision, 5 % laufend ab dem 1. Jahr auf 600 €
    expect(provisionForLine("KFZ")).toBe(30);
    // Unbekannte Sparte: vorsichtiger Standard (Sonstiges)
    expect(provisionForLine("Gibtsnicht")).toBe(provisionForLine(null));
    const eigene = effectiveRates("vertreter", { hausrat: { kind: "percent", rate: 1, defaultPremium: 200 } });
    expect(provisionForLine("Hausrat", eigene)).toBe(200);
  });

  it("Spanne = Empfänger × Antwortquote × Abschlussquote × Provision, gerundet", () => {
    const q = quotenFor("cross_sell");
    const s = erwarteteProvision(100, q, 300);
    expect(s.low).toBeCloseTo(100 * 0.08 * 0.2 * 300);
    expect(s.high).toBeCloseTo(100 * 0.15 * 0.35 * 300);
    expect(erwarteteProvision(0, q, 300)).toEqual({ low: 0, high: 0 });
    expect(rundeSpanne({ low: 480, high: 1575 })).toEqual({ low: 450, high: 1600 });
    expect(rundeSpanne({ low: 7, high: 42 })).toEqual({ low: 0, high: 50 });
    expect(spanneText({ low: 480, high: 1575 })).toBe("ca. 450 bis 1.600 €");
    expect(spanneText({ low: 3, high: 8 })).toBe("bis 10 €");
    expect(spanneText({ low: 0, high: 0 })).toBeNull();
  });

  it("Eigene Quoten erst ab 30 angeschriebenen Kunden, sonst Standard", () => {
    expect(quotenFor("review", { angeschrieben: EIGENE_MIN - 1, geantwortet: 20, abschluss: 5 }).own).toBe(false);
    const own = quotenFor("review", { angeschrieben: 100, geantwortet: 20, abschluss: 5 });
    expect(own.own).toBe(true);
    expect(own.reply.low).toBeCloseTo(0.15);
    expect(own.reply.high).toBeCloseTo(0.25);
    expect(own.close.low).toBeCloseTo(0.1875);
    // Zu wenige Antworten: Abschlussquote bleibt Standard
    expect(quotenFor("review", { angeschrieben: 100, geantwortet: 3, abschluss: 3 }).close).toEqual(STANDARD_QUOTEN.review.close);
    const sum = eigeneZahlen([
      { occasion: "review", funnel: { gesamt: { angeschrieben: 20, geantwortet: 2, abschluss: 1 } } },
      { occasion: "review", funnel: { gesamt: { angeschrieben: 15, geantwortet: 3, abschluss: 0 } } },
    ]);
    expect(sum.review).toEqual({ angeschrieben: 35, geantwortet: 5, abschluss: 1 });
  });

  it("Sortierung nach Euro (Mitte der Spanne), nicht nach Kundenzahl", () => {
    const e = (low: number, high: number): Spanne => ({ low, high });
    const list = [
      { title: "viele Kunden, wenig Euro", count: 300, euro: e(50, 100) },
      { title: "wenige Kunden, viel Euro", count: 20, euro: e(400, 900) },
      { title: "gleicher Wert, mehr Kunden", count: 40, euro: e(400, 900) },
    ];
    expect(nachEuro(list).map((x) => x.title)).toEqual(["gleicher Wert, mehr Kunden", "wenige Kunden, viel Euro", "viele Kunden, wenig Euro"]);
  });

  it("Ausschließlichkeitsvertreter: Vorschläge nur für angebotene Sparten (mayOffer)", () => {
    const ao = offeredLines("vertreter", ["KFZ", "Rechtsschutz"], []);
    expect(nextBestLine(["KFZ"], ao)).toBe("Rechtsschutz");
    expect(nextBestLine(["KFZ"], null)).toBe("Haftpflicht");
    expect(nextBestLine(["Kranken"], ao)).toBeNull();
    expect(naheliegendesThema(["Kranken"], ao)).toBe("Absicherung");
  });

  it("Keine Euro-Werte in Texten an Bestandskunden", () => {
    for (const o of OCC) {
      for (const an of ["sie", "du"] as const) {
        const m = defaultCampaignMail(o, an);
        const wa = campaignText(o, { firstName: "Erika", lastName: "Muster", salutation: "Frau" }, "Hausrat", an);
        for (const t of [m.subject, m.body, wa]) expect(t).not.toMatch(/€|\bEUR\b|Provision|Schätzung/);
      }
    }
    expect(consentQuestion("Agentur Meier", ["email", "whatsapp"])).not.toMatch(/€|Provision/);
  });
});

describe("Recht P0 (Paket 1)", () => {
  it("Mail-Fuß: Widerspruchshinweis nach § 7 Abs. 3 UWG, Abmeldelink und Impressum in beiden Ansprachen, ohne Gedankenstriche", () => {
    const base = { firm: "Agentur Meier", unsubscribeUrl: "https://app.test/abmelden/x", imprint: "Agentur Meier\nHauptstr. 1" };
    const sie = campaignMailFooter({ ...base, ansprache: "sie" });
    const du = campaignMailFooter({ ...base, ansprache: "du" });
    expect(sie).toContain("Sie können der Nutzung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen");
    expect(sie).toContain("Übermittlungskosten");
    expect(du).toContain("Du kannst der Nutzung deiner E-Mail-Adresse für Werbung jederzeit widersprechen");
    for (const f of [sie, du]) {
      expect(f).toContain("Mit einem Klick abmelden: https://app.test/abmelden/x");
      expect(f).toContain("Hauptstr. 1");
      expect(f).toContain("Kundin bzw. Kunde von Agentur Meier");
      expect(f).not.toMatch(/[–—]/);
      // Zwei Absätze plus Impressum
      expect(f.split(/\n{2,}/)).toHaveLength(3);
    }
    expect(hasImprint(null)).toBe(false);
    expect(hasImprint("  ")).toBe(false);
    expect(hasImprint("Agentur Meier")).toBe(true);
  });

  it("Einwilligungsseite wählt nichts vor (beide Kanäle starten leer)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/einwilligung/[token]/page.tsx"), "utf8");
    expect(src).not.toMatch(/defaultChecked/);
    expect(src).not.toMatch(/\bchecked\s*[=}]/);
    expect(src).toContain('name="email"');
    expect(src).toContain('name="whatsapp"');
    // Pflichttext und Datenschutzlink bleiben direkt über dem Knopf
    const text = src.indexOf("consentQuestion(page.advisor");
    const privacy = src.indexOf("page.privacyUrl");
    const knopf = src.indexOf("Ja, so informieren");
    expect(text).toBeGreaterThan(0);
    expect(privacy).toBeGreaterThan(text);
    expect(knopf).toBeGreaterThan(privacy);
  });

  it("Versand prüft das Impressum (keine Kampagnen-Mail ohne Pflichtangaben)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/bestand/campaigns.ts"), "utf8");
    expect(src).toMatch(/if \(!hasImprint\(imprint\)\) return out;/);
  });
});
