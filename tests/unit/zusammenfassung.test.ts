import { describe, expect, it, vi } from "vitest";
import { GRUENDE_ERGAENZEN, hatLuecke, zusammenfassungEntwurf, zusammenfassungFehlt } from "@/lib/mail/beratung";
import { kiAntwortLesen, kiEingabe, kiErgebnisPruefen, kiZusammenfassung, kiZusammenfassungStatus } from "@/lib/mail/beratung-ki";
import { angebotMail, angebotVorteile, mailWerte, zusammenfassungSatz } from "@/lib/angebot-senden";
import { aufbewahrenBis, BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE, isUploadKind } from "@/lib/lead-files";
import { STANDARD_VORLAGEN_JE } from "@/lib/mail/vorlagen";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import type { BedrockEu } from "@/lib/ki-eu-konfig";

// Paket M5: Angebot + Gesprächszusammenfassung (Entwurf ohne KI, KI-Knopf, Gesundheitsfilter, Aufbewahrung)

const haftpflicht = { sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitrag: 6.12, leistungen: ["Versicherungssumme: 50 Mio. €", "Schlüsselverlust", "Mietsachschäden"] };
const hausrat = { sparte: "Hausrat", gesellschaft: "Allianz", tarif: "Smart", beitrag: 9.5, leistungen: ["Fahrraddiebstahl"] };
const EU: BedrockEu = { art: "bedrock", region: "eu-central-1", accessKey: "a", secretKey: "b", model: "m" };

describe("Entwurf der Gesprächszusammenfassung ohne KI", () => {
  const quellen = {
    an: "sie" as const,
    produkt: "Haftpflicht und Hausrat",
    formData: [
      { label: "Lebenssituation", value: "Familie mit Kindern" },
      { label: "Vorerkrankungen", value: "Rücken" },
      { label: "Telefon", value: "0151 123" },
    ],
    vorvertraege: { at: "2026-11-17", liste: [{ sparte: "Haftpflicht", gesellschaft: "HUK" }] },
    schutz: [
      { label: "Privathaftpflicht", status: "woanders" as const, info: "HUK", versicherer: "HUK" },
      { label: "Rechtsschutz", status: "luecke" as const, info: null },
    ],
    klaeren: { punkte: ["Wohnfläche, Haus oder Wohnung", "Geburtsdaten"], erledigt: ["Geburtsdaten"] },
    notizen: ["Kunde will Fahrrad mitversichern", "Hatte eine Bandscheiben-OP, Diagnose 2024"],
    auswahl: [haftpflicht, hausrat],
    kombi: "Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %.",
  };

  it("Wünsche aus Formular, Verträgen, Schutz heute, Notizen und offenen Klärpunkten, ohne Gesundheitsangaben", () => {
    const e = zusammenfassungEntwurf(quellen);
    expect(e.wuensche).toContain("• Interesse an: Haftpflicht und Hausrat");
    expect(e.wuensche).toContain("• Lebenssituation: Familie mit Kindern");
    expect(e.wuensche).toContain("• Bestehende Verträge: Haftpflicht (HUK)");
    expect(e.wuensche).toContain("Ihre Absicherung heute:\n• Rechtsschutz: noch kein Vertrag");
    // Sparte im Angebot steht im Rat, nicht doppelt unter „heute“
    expect(e.wuensche).not.toContain("Privathaftpflicht: woanders");
    expect(e.wuensche).toContain("Aus dem Gespräch:\n• Kunde will Fahrrad mitversichern");
    expect(e.wuensche).toContain("Noch zu klären:\n• Wohnfläche, Haus oder Wohnung");
    expect(e.wuensche).not.toMatch(/Geburtsdaten|Rücken|Bandscheib|Diagnose|0151/);
  });

  it("Rat aus der Tarifauswahl mit Leistungen aus dem Katalog, Gründe als Stelle zum Ergänzen", () => {
    const e = zusammenfassungEntwurf(quellen);
    expect(e.rat).toContain("• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat\nWichtige Leistungen: Versicherungssumme: 50 Mio. €, Schlüsselverlust, Mietsachschäden");
    expect(e.rat).toContain("• Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %.");
    expect(e.rat.endsWith(`Gründe: ${GRUENDE_ERGAENZEN}`)).toBe(true);
    expect(zusammenfassungFehlt(e)).toMatch(/ausfüllen/);
    expect(zusammenfassungFehlt({ ...e, rat: e.rat.replace(GRUENDE_ERGAENZEN, "passt zur Familie") })).toBeNull();
    expect(hatGedankenstrich(e.wuensche + e.rat)).toBe(false);
  });

  it("Du-Fassung und ohne Termin-Daten: nur Stelle für die Gründe", () => {
    const e = zusammenfassungEntwurf({ an: "du", produkt: "Hausrat", schutz: [{ label: "Unfall", status: "pruefen", info: null }] });
    expect(e.wuensche).toContain("Deine Absicherung heute:\n• Unfall: noch zu prüfen");
    expect(e.rat).toBe(`Gründe: ${GRUENDE_ERGAENZEN}`);
    expect(hatLuecke(e.rat)).toBe(true);
  });
});

describe("Angebots-Mail aus der Vorlage mit Vorteilen aus den Katalog-Merkmalen", () => {
  const vorlage = (an: "sie" | "du") => STANDARD_VORLAGEN_JE[an].find((v) => v.key === "angebot")!;
  const SIG = { text: "Viele Grüße\nOle", html: "<p>Viele Grüße</p>" };
  const kontakt = { firstName: "Anna", lastName: "Becker", salutation: "Frau" as const, fullName: "Anna Becker" };

  it("eine Versicherung: Tarif, dann die wichtigsten Leistungen", () => {
    expect(angebotVorteile([haftpflicht], null)).toEqual({
      vorteil_1: "Privathaftpflicht: Allianz Komfort, 6,12 € im Monat",
      vorteil_2: "Versicherungssumme: 50 Mio. €",
      vorteil_3: "Schlüsselverlust inklusive",
    });
  });

  it("mehrere: je Versicherung ein Punkt mit der ersten Leistung, Kombi-Rabatt zuerst", () => {
    const v = angebotVorteile([haftpflicht, hausrat], "Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %.");
    expect(v.vorteil_1).toBe("Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %");
    expect(v.vorteil_2).toBe("Privathaftpflicht: Allianz Komfort, 6,12 € im Monat, Versicherungssumme 50 Mio. €");
    expect(v.vorteil_3).toBe("Hausrat: Allianz Smart, 9,50 € im Monat, mit Fahrraddiebstahl");
  });

  it("mit Zusammenfassung: Hinweis vor dem nächsten Schritt, beide Fassungen ohne Gedankenstriche", () => {
    for (const an of ["sie", "du"] as const) {
      const werte = mailWerte({ an, kontakt, thema: "Privathaftpflicht", meinname: "Ole", now: new Date("2026-11-17T12:00:00Z"), extra: { ...angebotVorteile([haftpflicht], null), anruf_tag: "Freitag" } });
      const m = angebotMail({ vorlage: vorlage(an), werte, link: "https://x.de/a", signatur: SIG, zusatz: zusammenfassungSatz(an) });
      const satz = zusammenfassungSatz(an);
      expect(m.text.indexOf(satz)).toBeGreaterThan(m.text.indexOf("Schlüsselverlust inklusive"));
      expect(m.text.indexOf(satz)).toBeLessThan(m.text.indexOf("Freitag"));
      expect(hatGedankenstrich(satz)).toBe(false);
    }
  });
});

describe("Mit KI formulieren: Freigabe, Gesundheitsfilter, Grenzen", () => {
  it("Knopf nur mit EU-KI und ohne Gesundheitssparte (im Zweifel aus)", () => {
    expect(kiZusammenfassungStatus({ konfig: null, produkt: "Privathaftpflicht", sparten: ["Privathaftpflicht"] })).toEqual({ moeglich: false, grund: "nicht_eingerichtet" });
    expect(kiZusammenfassungStatus({ konfig: EU, produkt: "Privatschutz", sparten: ["Privathaftpflicht", "Hausrat"] }).moeglich).toBe(true);
    expect(kiZusammenfassungStatus({ konfig: EU, produkt: "Katze OP", sparten: ["Katzen-OP"] }).moeglich).toBe(true);
    expect(kiZusammenfassungStatus({ konfig: EU, produkt: "Zahnzusatz", sparten: [] }).grund).toBe("gesundheit");
    expect(kiZusammenfassungStatus({ konfig: EU, produkt: "Privatschutz", sparten: ["Hausrat", "Berufsunfähigkeit"] }).grund).toBe("gesundheit");
    // unbekanntes Produkt ohne Auswahl: im Zweifel aus
    expect(kiZusammenfassungStatus({ konfig: EU, produkt: "Beratung", sparten: [] }).moeglich).toBe(false);
    // nur mit einer Einwilligung, die die KI abdeckt (gibt es derzeit nicht)
    expect(kiZusammenfassungStatus({ konfig: EU, produkt: "Zahnzusatz", sparten: [], gesundheitsEinwilligungKi: true }).moeglich).toBe(true);
  });

  it("Eingabe ohne Gesundheitsangaben, Aufzählung bleibt", () => {
    const e = kiEingabe({ wuensche: "• Familie mit Kindern\n• Hat Diabetes seit 2020\n• Fahrrad mitversichern", rat: "• Hausrat: Allianz Smart" });
    expect(e.wuensche).toBe("• Familie mit Kindern\n• Fahrrad mitversichern");
    expect(e.rat).toBe("• Hausrat: Allianz Smart");
  });

  it("Prüfung: keine neuen Beträge, Versicherer, Empfehlungen; Stellen zum Ergänzen bleiben", () => {
    const ein = { wuensche: "• Familie", rat: `• Hausrat: Allianz Smart, 9,50 € im Monat\nGründe: ${GRUENDE_ERGAENZEN}` };
    expect(kiErgebnisPruefen(ein, { wuensche: "Sie haben Familie.", rat: `Hausrat bei Allianz Smart für 9,50 € im Monat.\nGründe: ${GRUENDE_ERGAENZEN}` })).toBeNull();
    expect(kiErgebnisPruefen(ein, { wuensche: "Familie", rat: `Allianz Smart, 8,90 € im Monat. ${GRUENDE_ERGAENZEN}` })).toMatch(/Beträge/);
    expect(kiErgebnisPruefen(ein, { wuensche: "Familie", rat: `Allianz Smart statt HUK, 9,50 €. ${GRUENDE_ERGAENZEN}` })).toMatch(/Versicherer/);
    expect(kiErgebnisPruefen(ein, { wuensche: "Familie", rat: `Ich empfehle Ihnen Allianz Smart, 9,50 €. ${GRUENDE_ERGAENZEN}` })).toMatch(/Empfehlung/);
    expect(kiErgebnisPruefen(ein, { wuensche: "Familie", rat: "Allianz Smart, 9,50 €. Gründe: passt gut." })).toMatch(/Ergänzen/);
  });

  it("Antwort lesen und Ergebnis zurückgeben; ohne Zugang kein Aufruf", async () => {
    expect(kiAntwortLesen("WÜNSCHE:\nA\nRAT:\nB")).toEqual({ wuensche: "A", rat: "B" });
    expect(kiAntwortLesen("irgendwas")).toBeNull();
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: `WÜNSCHE:\n• Sie haben Familie – und ein Fahrrad.\nRAT:\n• Hausrat: Allianz Smart\nGründe: ${GRUENDE_ERGAENZEN}` }] });
    const r = await kiZusammenfassung({ wuensche: "• Familie\n• Fahrrad", rat: `• Hausrat: Allianz Smart\nGründe: ${GRUENDE_ERGAENZEN}` }, { an: "sie", konfig: EU, client: { messages: { create } } });
    expect(r).toEqual({ ok: true, wuensche: "• Sie haben Familie, und ein Fahrrad.", rat: `• Hausrat: Allianz Smart\nGründe: ${GRUENDE_ERGAENZEN}` });
    const body = create.mock.calls[0][0] as { system: string; messages: { content: string }[] };
    expect(body.system).toContain("Sie-Form");
    const nie = vi.fn();
    expect((await kiZusammenfassung({ wuensche: "x", rat: "y" }, { an: "sie", konfig: null, client: { messages: { create: nie } } })).ok).toBe(false);
    expect(nie).not.toHaveBeenCalled();
    const frech = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "WÜNSCHE:\nFamilie\nRAT:\nDie beste Absicherung für Sie, 5 € günstiger." }] });
    const f = await kiZusammenfassung({ wuensche: "Familie", rat: "Hausrat" }, { an: "sie", konfig: EU, client: { messages: { create: frech } } });
    expect(f.ok).toBe(false);
  });
});

describe("Ablage als Beratungsdokumentation", () => {
  it("Frist nur für die Beratungsdokumentation, kein Upload dieser Art", () => {
    const t = new Date("2026-11-18T10:00:00Z");
    expect(BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE).toBe(10);
    expect(aufbewahrenBis("beratungsdoku", t)?.toISOString()).toBe("2036-11-18T10:00:00.000Z");
    expect(aufbewahrenBis("angebot", t)).toBeNull();
    expect(isUploadKind("beratungsdoku")).toBe(false);
    expect(isUploadKind("angebot")).toBe(true);
  });
});
