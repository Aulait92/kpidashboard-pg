// Monatsbericht neu (Ole, 14.11.2026): Betreff, Abschnitte ohne Daten, E-Mail-HTML ohne Bilder,
// Prüfung gegen erfundene Zahlen und Gedankenstriche, Kollegen-Tipp aus, gleiche Funktionen wie /buyer/zahlen.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { barWidths, hasDash, reportNumbers, reportSectionsHtml, reportSectionsText, reportSubject, SECTION_TITLES, type ReportModel } from "@/lib/monatsbericht/bericht";
import { checkText } from "@/lib/monatsbericht/shared";
import { candidateTips, KOLLEGEN_TIPP_AKTIV, type TipSignals } from "@/lib/zahlen-tipps";
import { customerMailHtml } from "@/lib/email";

const APP = "https://app.test";

const full = (over: Partial<ReportModel> = {}): ReportModel => ({
  version: 2,
  month: "2026-10",
  makler: false,
  closings: 4,
  funnel: {
    steps: [
      { key: "leads", label: "Leads", value: 80, rate: null, rateLabel: null, previous: 72 },
      { key: "erreicht", label: "Erreicht", value: 60, rate: 0.75, rateLabel: "erreicht", previous: 50 },
      { key: "termine", label: "Termine", value: 12, rate: 0.2, rateLabel: "aus Erreicht", previous: 10 },
      { key: "abschluesse", label: "Abschlüsse", value: 3, rate: 0.0375, rateLabel: "Abschlussquote", previous: 2 },
    ],
  },
  result: {
    lines: [
      { key: "paid", label: "Abschlussprovision aus Leads (einmalig)", amount: 1650, sign: "+" },
      { key: "empfehlung", label: "aus Empfehlungen", amount: 330, sign: "+" },
      { key: "leadkosten", label: "Lead-Kosten", amount: 800, sign: "-" },
      { key: "betreuung", label: "Betreuung & Software (inkl. USt., Gutschriften abgezogen)", amount: 690.2, sign: "-" },
    ],
    gewinn: 489.8,
  },
  bestand: {
    label: "Bestandsprovision",
    perYear: 396,
    contracts: 6,
    fromYear2: true,
    inYears: 1782,
    storno: 0.1,
    perMonth: 2,
    years: [1, 2, 3, 4, 5].map((year) => ({ year, existing: 356, added: 100 * year, total: 356 + 100 * year })),
  },
  empfehlungen: { asked: 5, empfehlungen: 2, abschluesse: 1, provision: 330 },
  bestandskampagnen: { leads: 3, abschluesse: 1, provision: 120 },
  measures: ["Wir haben neue Anzeigenmotive erstellt, damit Ihre Anzeigen frisch bleiben."],
  tips: [{ key: "beitrag", title: "Abschlüsse vollständig eintragen", text: "Bei 2 Abschlüssen fehlt der Beitrag.", href: "/buyer/leads", cta: "Abschlüsse ergänzen" }],
  links: { zahlen: `${APP}/buyer/zahlen?range=custom&from=2026-10-01&to=2026-10-31`, gespraech: "https://cal.test/ole" },
  ...over,
});

const empty = (): ReportModel => full({ closings: 0, funnel: null, result: null, bestand: null, empfehlungen: null, bestandskampagnen: null, measures: [], tips: [] });

describe("Monatsbericht neu: Betreff", () => {
  it("positiver Gewinn: Abschlüsse und Gewinn", () => {
    expect(reportSubject(full())).toBe("Ihr Oktober: 4 Abschlüsse und 490 € Gewinn");
    expect(reportSubject(full({ closings: 1 }))).toBe("Ihr Oktober: 1 Abschluss und 490 € Gewinn");
  });
  it("negativer Gewinn: Abschlüsse bzw. Termine, nie der Verlust", () => {
    const neg = full({ result: { lines: [], gewinn: -350.5 } });
    const s = reportSubject(neg);
    expect(s).toBe("Ihr Oktober: 4 Abschlüsse und 12 Termine");
    expect(s).not.toMatch(/Gewinn|Verlust|350|−|-/);
    expect(reportSubject({ ...neg, closings: 0 })).toBe("Ihr Oktober: 12 Termine");
    const noTermin = { ...neg, closings: 0, funnel: { steps: full().funnel!.steps.map((x) => (x.key === "termine" ? { ...x, value: 0 } : x)) } };
    expect(reportSubject(noTermin)).toBe("Ihr Oktober: 80 neue Leads");
    expect(reportSubject(empty())).toBe("Ihr Monatsbericht für Oktober");
  });
  it("Gewinn 0 zählt nicht als Gewinn", () => {
    expect(reportSubject(full({ result: { lines: [], gewinn: 0.2 } }))).not.toMatch(/Gewinn/);
  });
});

describe("Monatsbericht neu: Abschnitte und E-Mail", () => {
  it("alle Abschnitte mit Daten erscheinen, in fester Reihenfolge", () => {
    const html = reportSectionsHtml(full(), APP);
    const order = Object.values(SECTION_TITLES).map((t) => html.indexOf(`>${t.replace("&", "&amp;")}</h2>`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Alle Zahlen ansehen");
    expect(html).toContain("Gespräch vereinbaren");
    expect(html).toContain("= Gewinn");
    expect(html).toContain("− 800,00 €");
  });
  it("Abschnitte ohne Daten entfallen (HTML und Text)", () => {
    const html = reportSectionsHtml(empty(), APP);
    const text = reportSectionsText(empty(), APP).join("\n");
    for (const t of Object.values(SECTION_TITLES)) {
      expect(html).not.toContain(t);
      expect(text.toLowerCase()).not.toContain(t.toLowerCase());
    }
    expect(html).toContain("Alle Zahlen ansehen");
    // Nur Empfehlungen fehlen → nur dieser Abschnitt fehlt
    const noEmpf = reportSectionsHtml(full({ empfehlungen: null }), APP);
    expect(noEmpf).not.toContain(`>${SECTION_TITLES.empfehlungen}<`);
    expect(noEmpf).toContain(SECTION_TITLES.bestandskampagnen);
    // ohne Terminlink kein zweiter Knopf
    expect(reportSectionsHtml(full({ links: { zahlen: `${APP}/buyer/zahlen`, gespraech: null } }), APP)).not.toContain("Gespräch vereinbaren");
  });
  it("Balkendiagramm als HTML-Tabelle, keine Bilder, keine fremden Hosts", () => {
    const html = customerMailHtml({ greeting: "Hallo Herr Test,", paragraphs: ["Einstieg."], html: reportSectionsHtml(full(), APP) });
    expect(html).not.toMatch(/<img|background-image|url\(|<svg|<canvas|<script/i);
    const hosts = [...html.matchAll(/href="https?:\/\/([^/"]+)/g)].map((m) => m[1]);
    expect(hosts).toContain("app.test");
    expect(hosts.every((h) => ["app.test", "cal.test"].includes(h) || /performancegrowth/i.test(h))).toBe(true);
    expect([...html.matchAll(/src="/g)]).toHaveLength(0);
    // 5 Jahreszeilen mit Balken (bgcolor für Outlook)
    expect(html.match(/\d\. Jahr</g)).toHaveLength(5);
    expect(html).toContain('bgcolor="#1e3a8a"');
  });
  it("keine Gedankenstriche in Texten des Berichts", () => {
    const text = reportSectionsText(full(), APP).join("\n");
    expect(hasDash(text)).toBe(false);
    const visible = reportSectionsHtml(full(), APP).replace(/<[^>]+>/g, " ");
    expect(hasDash(visible)).toBe(false);
  });
  it("Balkenbreiten: größter Wert 100 %, kleine Werte sichtbar", () => {
    const w = barWidths([
      { year: 1, existing: 100, added: 0, total: 100 },
      { year: 2, existing: 100, added: 300, total: 400 },
      { year: 3, existing: 1, added: 0, total: 1 },
    ]);
    expect(w[1].existing + w[1].added).toBe(100);
    expect(w[2].existing).toBe(2);
  });
});

describe("Monatsbericht neu: Prüfung", () => {
  const allowed = reportNumbers(full());
  it("lässt Zahlen aus dem Bericht durch (gerundet, Vormonat, Quote)", () => {
    const r = checkText("Im Oktober 2026 hatten Sie 80 Leads (Vormonat 72), 12 Termine und 4 Abschlüsse. Der Gewinn liegt bei 490 €, 75 % Ihrer Leads haben Sie erreicht.", allowed);
    expect(r).toEqual({ ok: true, issues: [] });
    expect(checkText("Ihre Bestandsprovision wächst auf 396 € pro Jahr, in 5 Jahren 1.782 €.", allowed).ok).toBe(true);
  });
  it("blockt erfundene Zahlen", () => {
    const r = checkText("Sie hatten 4711 Leads und 9.999 € Gewinn.", allowed);
    expect(r.ok).toBe(false);
    expect(r.issues.join()).toMatch(/4711/);
    expect(r.issues.join()).toMatch(/9\.999/);
  });
  it("blockt Gedankenstriche, Bis-Striche in Zahlenbereichen sind ok", () => {
    expect(checkText("Ein starker Monat – danke für die schnelle Bearbeitung.", allowed).ok).toBe(false);
    expect(checkText("Ein starker Monat — danke.", allowed).ok).toBe(false);
    expect(hasDash("Rufen Sie in 1–3 Minuten an.")).toBe(false);
    expect(hasDash("Lead-Kosten und E-Mail")).toBe(false);
  });
});

describe("Monatsbericht neu: Tipps und Rechenweg", () => {
  it("Kollegen-Tipp ist aus (Schalter KOLLEGEN_TIPP_AKTIV)", () => {
    expect(KOLLEGEN_TIPP_AKTIV).toBe(false);
    const s: TipSignals = {
      avgProvision: 300,
      paidLeadsPerMonth: 40,
      closedCustomers: 10,
      empfehlungEnabled: true,
      notAskedForReferral: 0,
      kollegenPraemie: 500,
      kollegenEnabled: true,
      bestandImported: true,
      bestandCampaigns: 1,
      withoutCrossSell: 0,
      missingPremium: 0,
      rates: { reach: { own: null, avg: null }, termin: { own: null, avg: null }, close: { own: null, avg: null } },
    };
    expect(candidateTips(s).some((t) => t.key === "kollegen")).toBe(false);
  });
  it("Bericht rechnet mit denselben Funktionen wie /buyer/zahlen", () => {
    const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");
    const page = read("src/app/buyer/zahlen/page.tsx");
    const server = read("src/lib/monatsbericht/server.ts");
    for (const fn of ["ertragForRange(", "summarizeBestand(", "loadErtragData(", "computeCustomerSpend(", "loadRetainerConfig(", "pickTips(", "loadTipSignals("]) {
      expect(page, fn).toContain(fn);
      expect(server, fn).toContain(fn);
    }
    expect(page).toMatch(/computeKpis\(\{ range, customerId, product: null, origin: "paid" \}\)/);
    expect(server).toMatch(/computeKpis\(\{ range, customerId, product: null, origin: "paid" \}\)/);
    expect(server).toContain('originWhere("bestand")');
    expect(server).not.toContain("laufende Optimierung der Anzeigen");
  });
});
