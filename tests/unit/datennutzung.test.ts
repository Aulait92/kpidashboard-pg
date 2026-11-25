// Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026, lib/datennutzung.ts): die freigegebenen Wortlaute
// (wörtlich), Sichtbarkeit des Banners (Paket, Rolle, Textversion) und die Hinweise an den abgeschalteten Stellen.
import { describe, expect, it } from "vitest";
import {
  BANNER_TEXT,
  BANNER_WORTLAUT,
  DATENNUTZUNG_EINTRAG,
  DATENNUTZUNG_PFAD,
  DATENNUTZUNG_VERSION,
  DETAIL_TEXT,
  DIALOG_TEXT,
  MELDUNG,
  WIDERSPRUCH_PUNKTE,
  bannerAufSeite,
  bannerFaellig,
  eintragText,
  istInhaberLogin,
  istPunkt,
  istSoftwareKunde,
  istVerstanden,
  kiAusSaetze,
  kiAusText,
  punktWortlaut,
} from "@/lib/datennutzung";
import { packageLabel } from "@/lib/customer-package";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Wortlaute (von Ole freigegeben, wörtlich)", () => {
  it("Banner: ein Absatz (gekürzt 25.11.2026) und zwei Knöpfe", () => {
    expect(BANNER_TEXT.text).toBe(
      "Neu: Wir nutzen zusätzlich Amazon Web Services (Frankfurt) für KI-Funktionen, und Ihre Anzeigen lernen anonym aus den Ergebnissen aller Kunden. So werden die Anzeigen für alle besser. Widerspruch innerhalb von 14 Tagen möglich.",
    );
    expect(BANNER_TEXT.verstanden).toBe("Verstanden");
    expect(BANNER_TEXT.mehr).toBe("Mehr erfahren");
    expect(BANNER_WORTLAUT).toBe(BANNER_TEXT.text);
  });

  it("Detailseite: Titel und die sechs Punkte in dieser Reihenfolge, mit dem PDF-Link am letzten", () => {
    expect(DETAIL_TEXT.titel).toBe("Was sich ändert und was Sie wählen können");
    expect(DETAIL_TEXT.punkte.map((p) => `${p.label}: ${p.text}`)).toEqual([
      "Neuer Unterauftragsverarbeiter: Amazon Web Services EMEA SARL, Rechenzentrum Frankfurt. Zweck: KI für Gesprächszusammenfassungen und das Auslesen von Unterlagen.",
      "Gemeinsames Anzeigenlernen: Anzeigen-Muster (Aufhänger, Textaufbau, Bildidee) und Ergebnisse aller Kunden fließen in die Anzeigen anderer Kunden ein. Das gilt in beide Richtungen. So werden die Anzeigen für alle besser.",
      "Was nie übernommen oder gezeigt wird: Namen, Fotos von Personen, Logos und Zahlen einzelner Kunden.",
      "Widerspruch: innerhalb von 14 Tagen über den Knopf „Widersprechen“ unten oder per Antwort an den Support. Sie können beiden Punkten oder nur einem davon widersprechen.",
      "Ihre Bestätigung: Ihr Klick auf „Verstanden“ wird mit Datum gespeichert.",
      "Zum Nachlesen: Dieser Text bleibt unter Neuigkeiten und in den Einstellungen abrufbar.",
    ]);
    expect(DETAIL_TEXT.punkte.map((p) => p.pdf ?? null)).toEqual([null, null, null, null, null, "Liste der Unterauftragnehmer (PDF)"]);
    // Die im Text genannten Knöpfe heißen auch so
    expect(DETAIL_TEXT.widersprechen).toBe("Widersprechen");
    expect(DETAIL_TEXT.punkte[3].text).toContain(`„${DETAIL_TEXT.widersprechen}“`);
    expect(DETAIL_TEXT.punkte[4].text).toContain(`„${BANNER_TEXT.verstanden}“`);
    expect(DETAIL_TEXT.zuruecknehmen).toBe("Widerspruch zurücknehmen");
  });

  it("Dialog: Frage, zwei Haken und die Knöpfe", () => {
    expect(DIALOG_TEXT.titel).toBe("Wem möchten Sie widersprechen?");
    expect(WIDERSPRUCH_PUNKTE).toEqual(["anzeigenlernen", "aws"]);
    expect(punktWortlaut("anzeigenlernen")).toBe("Gemeinsames Anzeigenlernen: Sie werden vom Lernen ausgenommen. Ihre Anzeigen werden nicht für andere Kunden genutzt.");
    expect(punktWortlaut("aws")).toBe("Amazon Web Services: Gesprächszusammenfassungen und das Auslesen von Unterlagen sind dann nicht verfügbar.");
    expect(DIALOG_TEXT.senden).toBe("Widerspruch senden");
    expect(DIALOG_TEXT.abbrechen).toBe("Abbrechen");
    expect(istPunkt("aws")).toBe(true);
    expect(istPunkt("alles")).toBe(false);
  });

  it("Textversion steht neben den Texten", () => {
    expect(DATENNUTZUNG_VERSION).toBe("2026-11-24");
    expect(DATENNUTZUNG_PFAD).toBe("/buyer/einstellungen/datennutzung");
    expect(DATENNUTZUNG_EINTRAG).toBe("KI-Hilfe und Anzeigenlernen");
  });

  it("alle Texte: Sie-Form, keine Gedankenstriche, keine „Garantie“, keine internen Namen", () => {
    const alle = [
      BANNER_TEXT.text,
      DETAIL_TEXT.titel,
      ...DETAIL_TEXT.punkte.flatMap((p) => [p.label, p.text, p.pdf ?? ""]),
      DIALOG_TEXT.titel,
      ...WIDERSPRUCH_PUNKTE.flatMap((p) => [DIALOG_TEXT.punkte[p].label, DIALOG_TEXT.punkte[p].text, DIALOG_TEXT.punkte[p].wirkung]),
      ...Object.values(MELDUNG),
      kiAusText("KI-Hilfe", { am: "2026-11-24T10:00:00Z", inhaber: true }),
      kiAusText("Automatisches Auslesen", { am: "2026-11-24T10:00:00Z", inhaber: false }),
      eintragText({ anzeigenlernen: "2026-11-24T10:00:00Z", aws: "2026-11-24T10:00:00Z" }),
    ];
    for (const t of alle) {
      expect(hatGedankenstrich(t), t).toBe(false);
      expect(t, t).not.toMatch(/garantie/i);
      expect(t, t).not.toMatch(/\b(du|dich|dir|dein\w*|euch|euer\w*)\b/i);
      expect(t, t).not.toMatch(/bedrock|vorlagenVon|creative|opt-?out/i);
    }
  });

  it("die Meldung „zurücknehmen“ nennt die Einstellungen (dort gibt es den Knopf)", () => {
    expect(MELDUNG.widerspruch).toBe("Widerspruch gespeichert. Sie können ihn in den Einstellungen jederzeit zurücknehmen.");
  });
});

const INHABER = { userId: "u1", preview: false, teamRole: "owner" };

describe("Wer sieht das Banner", () => {
  it("nur ein echter Inhaber-Login: kein Mitarbeiter, keine Admin-Vorschau, keine App-Demo (App-Store-Prüfer)", () => {
    expect(istInhaberLogin(INHABER)).toBe(true);
    expect(istInhaberLogin({ ...INHABER, teamRole: "advisor" })).toBe(false);
    expect(istInhaberLogin({ userId: null, preview: true, teamRole: "owner" })).toBe(false);
    expect(istInhaberLogin({ ...INHABER, preview: true })).toBe(false);
    expect(istInhaberLogin({ userId: null, preview: true, teamRole: "owner", demo: true })).toBe(false);
    expect(istInhaberLogin({ ...INHABER, demo: true })).toBe(false);
  });

  it("Pakete: Software ja (Betreuung + Software, Pay-per-Lead + Software), alle anderen nein", () => {
    const pakete = [
      { c: { plan: "software", retainerMonthly: 990, onboarding: null }, label: "Betreuung + Software", ja: true },
      { c: { plan: "software", retainerMonthly: null, onboarding: { id: "o1" } }, label: "Betreuung + Software", ja: true },
      { c: { plan: "ppl_software", retainerMonthly: null, onboarding: null }, label: "Pay-per-Lead + Software", ja: true },
      { c: { plan: "software", retainerMonthly: null, onboarding: null }, label: "Pay-per-Lead", ja: false },
      { c: { plan: "software", retainerMonthly: 0, onboarding: null }, label: "Pay-per-Lead", ja: false },
      { c: { plan: "service", retainerMonthly: 990, onboarding: { id: "o1" } }, label: "Nur Betreuung", ja: false },
      { c: { plan: "ppl", retainerMonthly: null, onboarding: { id: "o1" } }, label: "Nur Leads", ja: false },
      { c: { plan: "internal", retainerMonthly: 990, onboarding: { id: "o1" } }, label: "Intern", ja: false },
    ];
    for (const p of pakete) {
      expect(packageLabel(p.c), JSON.stringify(p.c)).toBe(p.label);
      expect(istSoftwareKunde(p.c), p.label).toBe(p.ja);
    }
    // Reines Bestellkonto (bestellt nur für seine Vertriebspartner): nie, auch mit Software-Paket
    expect(istSoftwareKunde({ plan: "software", retainerMonthly: 990, onboarding: null }, { bestellkonto: true })).toBe(false);
  });

  it("bis „Verstanden“ für die aktuelle Textversion gespeichert ist; eine neue Textversion zeigt es wieder", () => {
    const offen = { inhaber: true, software: true, verstandenAt: null, verstandenVersion: null };
    expect(bannerFaellig(offen)).toBe(true);
    expect(bannerFaellig({ ...offen, inhaber: false })).toBe(false);
    expect(bannerFaellig({ ...offen, software: false })).toBe(false);
    const verstanden = { ...offen, verstandenAt: new Date("2026-11-24T10:00:00Z"), verstandenVersion: DATENNUTZUNG_VERSION };
    expect(bannerFaellig(verstanden)).toBe(false);
    // Spätere Textänderung: neue Version, das Banner kommt wieder
    expect(bannerFaellig(verstanden, "2027-01-15")).toBe(true);
    expect(bannerFaellig({ ...verstanden, verstandenVersion: "2026-01-01" })).toBe(true);
    expect(istVerstanden({ datennutzungVerstandenAt: null, datennutzungVerstandenVersion: DATENNUTZUNG_VERSION })).toBe(false);
  });

  it("nur auf „Heute“: nicht auf Kontakt, Chat, Unterseiten, Detailseite oder Beratungspräsentation", () => {
    expect(bannerAufSeite("/buyer")).toBe(true);
    for (const p of [DATENNUTZUNG_PFAD, "/buyer/termine/cm123/praesentation", "/buyer/leads", "/buyer/leads/cm1", "/buyer/chats", "/buyer/kontakte", "/buyer/einstellungen", "/buyer/termine/cm123/vorbereitung", "/buyer/neuigkeiten", "/buyer/konto", "/buyer/"]) expect(bannerAufSeite(p), p).toBe(false);
  });
});

describe("Hinweis an den abgeschalteten Stellen (Widerspruch Amazon Web Services)", () => {
  const am = "2026-11-24T10:00:00Z";
  it("Inhaber: was aus ist, seit wann, und wo er es ändert", () => {
    expect(kiAusText("KI-Hilfe", { am, inhaber: true })).toBe("KI-Hilfe ist für Ihr Konto abgeschaltet (Widerspruch vom 24.11.2026). In den Einstellungen können Sie das ändern.");
    expect(kiAusText("Automatisches Auslesen", { am, inhaber: true })).toBe(
      "Automatisches Auslesen ist für Ihr Konto abgeschaltet (Widerspruch vom 24.11.2026). In den Einstellungen können Sie das ändern.",
    );
  });
  it("Mitarbeiter: nächster Schritt ist der Inhaber (er selbst kommt nicht an die Einstellung)", () => {
    expect(kiAusSaetze("KI-Hilfe", { am, inhaber: false }).schritt).toBe("Ihr Inhaber kann das in den Einstellungen ändern.");
  });
  it("Datum in deutscher Zeit", () => {
    expect(kiAusText("KI-Hilfe", { am: "2026-11-24T23:30:00Z", inhaber: true })).toContain("Widerspruch vom 25.11.2026");
  });
});

describe("Eintrag in den Einstellungen", () => {
  it("zeigt einen aktiven Widerspruch auf einen Blick, sonst den Titel der Seite", () => {
    expect(eintragText({ anzeigenlernen: null, aws: null })).toBe("Was sich ändert und was Sie wählen können");
    expect(eintragText({ anzeigenlernen: "2026-11-24T10:00:00Z", aws: null })).toBe("Widerspruch aktiv: Gemeinsames Anzeigenlernen");
    expect(eintragText({ anzeigenlernen: null, aws: "2026-11-24T10:00:00Z" })).toBe("Widerspruch aktiv: Amazon Web Services");
    expect(eintragText({ anzeigenlernen: "2026-11-24T10:00:00Z", aws: "2026-11-24T10:00:00Z" })).toBe("Widerspruch aktiv: Gemeinsames Anzeigenlernen und Amazon Web Services");
  });
});
