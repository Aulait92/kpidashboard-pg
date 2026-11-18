import { describe, expect, it } from "vitest";
import {
  erinnerungGeplantAm,
  geburtsdatum,
  gesundheitNoetig,
  leseUebertragung,
  pruefeEingabe,
  signaturAusDataUrl,
  uebertragungsStand,
  versichererListe,
  fuelle,
  VERSAND_ANTWORTEN,
  VERSAND_FRAGE,
} from "@/lib/maklervollmacht/regeln";
import { categoryFor, purposesFor, templateBodyFor } from "@/lib/whatsapp/template-plan";
import {
  beauftragtSatz,
  einwilligungGesundheit,
  hinweisUnterschrift,
  kopieMail,
  kopieZeile,
  linkMail,
  maklerauftrag,
  protokoll,
  uebertragungsschreiben,
  vollmacht,
  vollmachtWhatsAppText,
  GESUNDHEIT_HAEKCHEN,
  ZUSTIMMUNG_TEXT,
} from "@/lib/maklervollmacht/texte";
import { vollmachtPdf, sha256 } from "@/lib/maklervollmacht/pdf";
import { ipKurz } from "@/lib/maklervollmacht/server";
import { testPng } from "../helpers/test-png";

const now = new Date("2026-11-18T10:00:00Z");
const gut: Record<string, string> = {
  vorname: "Anna",
  nachname: "Muster",
  strasse: "Hauptstraße 1",
  plz: "80331",
  ort: "München",
  geburtsdatum: "12.03.1980",
  email: "Anna@Example.com",
  vertraege: JSON.stringify([
    { versicherer: "Allianz", sparte: "haftpflicht", vertragsnummer: "AS-123" },
    { versicherer: "HUK-Coburg", sparte: "bu", vertragsnummer: "" },
    { versicherer: "Allianz", sparte: "hausrat", vertragsnummer: "" },
  ]),
  zustimmung: "ja",
  unterschrift: testPng(),
};
const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;

const makler = { name: "Max Berger", firma: "Berger Versicherungsmakler GmbH", anschrift: "Marktplatz 2, 84028 Landshut", registernummer: "D-ABCD-EFGHI-12", email: "max@berger.test", telefon: "0871 123456" };

describe("Maklervollmacht: Regeln", () => {
  it("Geburtsdatum: beide Formate, nur echte und plausible Daten", () => {
    expect(geburtsdatum("12.03.1980", now)).toBe("12.03.1980");
    expect(geburtsdatum("1980-03-12", now)).toBe("12.03.1980");
    expect(geburtsdatum("31.02.1980", now)).toBeNull();
    expect(geburtsdatum("01.01.2020", now)).toBeNull();
    expect(geburtsdatum("12/03/1980", now)).toBeNull();
  });
  it("prüft Pflichtfelder, normalisiert und lässt die Gesundheits-Einwilligung freiwillig", () => {
    const r = pruefeEingabe(get(gut), now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eingabe.daten.email).toBe("anna@example.com");
    expect(r.eingabe.vertraege).toHaveLength(3);
    expect(r.eingabe.vertraege[1].vertragsnummer).toBeNull();
    expect(r.eingabe.gesundheit).toBe(false);
    expect(pruefeEingabe(get({ ...gut, gesundheit: "ja" }), now)).toMatchObject({ ok: true, eingabe: { gesundheit: true } });
  });
  it("Fehler je Feld, ohne Unterschrift oder Häkchen nichts", () => {
    expect(pruefeEingabe(get({ ...gut, plz: "8033" }), now)).toEqual({ ok: false, fehler: "plz" });
    expect(pruefeEingabe(get({ ...gut, vertraege: "[]" }), now)).toEqual({ ok: false, fehler: "vertraege" });
    expect(pruefeEingabe(get({ ...gut, vertraege: JSON.stringify([{ versicherer: "", sparte: "kfz", vertragsnummer: "1" }]) }), now)).toEqual({ ok: false, fehler: "versicherer" });
    expect(pruefeEingabe(get({ ...gut, zustimmung: "" }), now)).toEqual({ ok: false, fehler: "zustimmung" });
    expect(pruefeEingabe(get({ ...gut, unterschrift: "data:image/png;base64,AAAA" }), now)).toEqual({ ok: false, fehler: "unterschrift" });
    expect(pruefeEingabe(get({ ...gut, email: "kaputt" }), now)).toEqual({ ok: false, fehler: "email" });
  });
  it("Gesundheit nur bei Kranken/Pflege/Leben/BU/Unfall; Versicherer je einmal", () => {
    expect(gesundheitNoetig([{ sparte: "hausrat" }, { sparte: "kfz" }])).toBe(false);
    expect(gesundheitNoetig([{ sparte: "hausrat" }, { sparte: "unfall" }])).toBe(true);
    const r = pruefeEingabe(get(gut), now);
    if (!r.ok) throw new Error();
    expect(versichererListe(r.eingabe.vertraege).map((g) => [g.versicherer, g.vertraege.length])).toEqual([
      ["Allianz", 2],
      ["HUK-Coburg", 1],
    ]);
    expect(signaturAusDataUrl("data:image/jpeg;base64,/9j/")).toBeNull();
  });
  it("IP fürs Protokoll gekürzt", () => {
    expect(ipKurz("203.0.113.77")).toBe("203.0.113.0");
    expect(ipKurz("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::");
    expect(ipKurz(null)).toBeNull();
  });
});

describe("Maklervollmacht: Texte und PDF", () => {
  const r = pruefeEingabe(get({ ...gut, gesundheit: "ja" }), now);
  if (!r.ok) throw new Error("Testdaten ungültig");
  const c = { makler, kunde: r.eingabe.daten, vertraege: r.eingabe.vertraege, datum: "18.11.2026", uhrzeit: "11:00", dokumentId: "vv_test" };
  const alle = [
    vollmacht(c),
    maklerauftrag(c),
    einwilligungGesundheit(c),
    uebertragungsschreiben(c, "Allianz", r.eingabe.vertraege.slice(0, 1), false),
    uebertragungsschreiben({ ...c, kunde: { ...c.kunde, anrede: "Frau" } }, "Allianz", r.eingabe.vertraege.slice(0, 1), false),
    protokoll(c, { an: "sie", gesundheit: true, ipKurz: "203.0.113.0", geraet: "Test", weg: "Link", hashes: [{ name: "x", sha256: "ab" }], kopie: { status: "anhang", email: "anna@example.com" } }),
  ];
  const texte = [
    ...alle.flatMap((ab) => [ab.titel, ...ab.absaetze]),
    hinweisUnterschrift("sie", "Max Berger", true),
    hinweisUnterschrift("du", "Max Berger", true),
    hinweisUnterschrift("sie", "Max Berger", false),
    hinweisUnterschrift("du", "Max Berger", false),
    kopieZeile({ status: "keine_adresse" }),
    kopieZeile({ status: "gesendet", email: "a@b.de", datum: "18.11.2026", uhrzeit: "11:02" }),
    kopieZeile({ status: "fehlgeschlagen", email: "a@b.de" }),
    ZUSTIMMUNG_TEXT,
    GESUNDHEIT_HAEKCHEN,
    ...Object.values(kopieMail("sie", c.kunde, makler, "18.11.2026")),
    ...Object.values(kopieMail("du", c.kunde, makler, "18.11.2026")),
    ...Object.values(linkMail("sie", "Guten Tag Frau Muster,", makler, "https://x.test/vollmacht/abc")),
    ...Object.values(linkMail("du", "Hallo Anna,", makler, "https://x.test/vollmacht/abc")),
  ];
  it("keine Gedankenstriche, kein „Garantie“, keine offenen Platzhalter", () => {
    for (const t of texte) {
      expect(t, t).not.toMatch(/[–—]/);
      expect(t, t).not.toMatch(/garantie/i);
      expect(t, t).not.toMatch(/\{[A-Za-z_]+\}/);
    }
    expect(fuelle("Hallo {Name} {Fehlt}", { Name: "Anna" })).toBe("Hallo Anna {Fehlt}");
  });
  it("Inhalt: Vollmacht nennt Makler, Registernummer und alle Verträge; Einwilligung nur die Gesundheits-Sparten", () => {
    const v = vollmacht(c).absaetze.join("\n");
    expect(v).toContain("Berger Versicherungsmakler GmbH");
    expect(v).toContain("Registernummer D-ABCD-EFGHI-12");
    expect(v).toContain("Allianz, Privathaftpflicht, Nr. AS-123");
    expect(v).toContain("Zahlungen an mich darf der Makler nicht entgegennehmen");
    const e = einwilligungGesundheit(c).absaetze.join("\n");
    expect(e).toContain("HUK-Coburg");
    expect(e).not.toContain("Privathaftpflicht");
    // Ich-Form durchgehend (Sie- und Du-Fassung gleich)
    expect(e).toContain("kann mich dazu nur eingeschränkt beraten");
    expect(e).not.toMatch(/\b(Sie|dich|dir)\b/);
    expect(uebertragungsschreiben(c, "Allianz", r.eingabe.vertraege.slice(0, 1), false).absaetze.join("\n")).toMatch(/Bitte bestätigen Sie uns die Übertragung/);
  });
  it("Vollmacht beginnt mit einem zusammenhängenden Satz (Kunde, Makler, Umfang)", () => {
    const erster = vollmacht(c).absaetze[0];
    expect(erster).toMatch(/^Ich, Anna Muster, geboren am 12\.03\.1980, wohnhaft .+, bevollmächtige Max Berger, Berger Versicherungsmakler GmbH, .+, Registernummer D-ABCD-EFGHI-12, mich gegenüber Versicherern in allen Angelegenheiten/);
  });
  it("Übertragungsschreiben nach Anrede: Kundin, Kunde, neutral", () => {
    const k = { vorname: "Katrin", nachname: "Wolf" };
    expect(beauftragtSatz({ ...k, anrede: "Frau" })).toBe("Ihre Kundin Frau Wolf hat uns mit der Betreuung ihrer Versicherungsverträge beauftragt und uns bevollmächtigt.");
    expect(beauftragtSatz({ ...k, anrede: "Herr" })).toBe("Ihr Kunde Herr Wolf hat uns mit der Betreuung seiner Versicherungsverträge beauftragt und uns bevollmächtigt.");
    expect(beauftragtSatz({ ...k, anrede: null })).toBe("Ihr Versicherungsnehmer Katrin Wolf hat uns mit der Betreuung der Versicherungsverträge beauftragt und uns bevollmächtigt.");
    expect(beauftragtSatz(k)).toContain("Ihr Versicherungsnehmer Katrin Wolf");
    const brief = uebertragungsschreiben({ ...c, kunde: { ...c.kunde, anrede: "Frau" } }, "Allianz", r.eingabe.vertraege.slice(0, 1), false).absaetze.join("\n");
    expect(brief).toContain("Ihre Kundin Frau Muster hat uns mit der Betreuung ihrer Versicherungsverträge beauftragt");
    expect(brief).not.toContain("seiner");
  });
  it("Kopie per E-Mail nur mit Adresse; Protokoll nennt den Versandstatus", () => {
    expect(hinweisUnterschrift("sie", "Max Berger", true)).toContain("Eine Kopie aller Dokumente erhalten Sie sofort per E-Mail.");
    expect(hinweisUnterschrift("du", "Max Berger", true)).toContain("bekommst du sofort per E-Mail");
    expect(hinweisUnterschrift("sie", "Max Berger", false)).not.toMatch(/Kopie|E-Mail/);
    expect(hinweisUnterschrift("du", "Max Berger", false)).not.toMatch(/Kopie|E-Mail/);
    const p = (kopie: Parameters<typeof kopieZeile>[0]) => protokoll(c, { an: "sie", gesundheit: false, ipKurz: null, geraet: null, weg: "Link", hashes: [], kopie }).absaetze.join("\n");
    expect(p({ status: "keine_adresse" })).toContain("Kopie per E-Mail: keine, der Kunde hat keine E-Mail-Adresse angegeben.");
    expect(p({ status: "gesendet", email: "anna@example.com", datum: "18.11.2026", uhrzeit: "11:02" })).toContain("am 18.11.2026 um 11:02 Uhr an anna@example.com gesendet");
    expect(p({ status: "fehlgeschlagen", email: "anna@example.com" })).toContain("Versand an anna@example.com fehlgeschlagen");
    expect(p({ status: "keine_adresse" })).not.toContain("sofern eine Adresse angegeben war");
  });
  it("Stand der Übertragung je Versicherer: Zähler und offen/gesendet", () => {
    const v = r.eingabe.vertraege; // Allianz (2), HUK-Coburg (1)
    expect(uebertragungsStand(v, {})).toMatchObject({ offen: 2, vertraegeOffen: 3, zeile: "3 Verträge, noch nicht übertragen" });
    const teil = uebertragungsStand(v, leseUebertragung({ allianz: "2026-11-18T10:00:00.000Z", kaputt: 5 }));
    expect(teil.versicherer).toEqual([
      { name: "Allianz", vertraege: 2, gesendetAm: "2026-11-18T10:00:00.000Z" },
      { name: "HUK-Coburg", vertraege: 1, gesendetAm: null },
    ]);
    expect(teil.zeile).toBe("1 Vertrag von 3 noch nicht übertragen");
    expect(uebertragungsStand(v, { allianz: "x", "huk-coburg": "y" })).toMatchObject({ offen: 0, zeile: "3 Verträge, alle Schreiben gesendet" });
    expect(leseUebertragung(null)).toEqual({});
    expect(leseUebertragung([1])).toEqual({});
  });
  it("PDF mit Unterschrift, gleiche Eingabe ergibt gleiche Prüfsumme", async () => {
    const sig = signaturAusDataUrl(testPng())!;
    const p1 = await vollmachtPdf({ titel: "Maklervollmacht", abschnitte: alle.slice(0, 3), signaturPng: sig, dokumentId: "vv_test" });
    const p2 = await vollmachtPdf({ titel: "Maklervollmacht", abschnitte: alle.slice(0, 3), signaturPng: sig, dokumentId: "vv_test" });
    expect(Buffer.from(p1.slice(0, 5)).toString()).toBe("%PDF-");
    expect(sha256(p1)).toBe(sha256(p2));
  });
});

describe("Maklervollmacht per WhatsApp: Texte, Vorlagen, Entscheidung", () => {
  const link = "https://dein-beratungstermin.de/vollmacht/abc";
  const names = { firm: "Berger Makler", advisor: "Max Berger", vermittler: { name: "Max Berger", anrede: "Herr" as const } };
  it("Freitext Sie, Du und Erinnerung wie freigegeben, Vorlagen ohne Gedankenstriche und ohne Platzhalter am Ende", () => {
    expect(vollmachtWhatsAppText("sie", "Herr Berger", link)).toBe(
      `Damit Herr Berger Ihre bestehenden Verträge übernehmen und für Sie betreuen kann, unterschreiben Sie hier bitte kurz digital die Maklervollmacht. Das dauert etwa 2 Minuten: ${link}`,
    );
    expect(vollmachtWhatsAppText("du", "Max", link)).toBe(
      `Damit Max deine bestehenden Verträge übernehmen und für dich betreuen kann, unterschreibe hier bitte kurz digital die Maklervollmacht. Das dauert etwa 2 Minuten: ${link}`,
    );
    expect(vollmachtWhatsAppText("sie", "Herr Berger", link, true)).toMatch(/^Kurze Erinnerung: Damit Herr Berger Ihre/);
    const texte = [
      ...(["maklervollmacht", "maklervollmacht_erinnerung"] as const).flatMap((p) => (["du", "sie", "sie_ohne_name"] as const).map((f) => templateBodyFor(p, names, f))),
      vollmachtWhatsAppText("du", "Max", link, true),
      VERSAND_FRAGE,
      ...VERSAND_ANTWORTEN.flatMap((x) => [x.titel, x.text]),
    ];
    for (const t of texte) {
      expect(t, t).not.toMatch(/[–—]/);
      expect(t, t).not.toMatch(/garantie/i);
      expect(t, t).not.toMatch(/\{\{\d+\}\}\s*$/);
    }
    expect(templateBodyFor("maklervollmacht", names, "sie")).toBe(
      "Guten Tag {{1}}, damit Herr Berger Ihre bestehenden Verträge übernehmen und für Sie betreuen kann, unterschreiben Sie hier bitte kurz digital die Maklervollmacht. Das dauert etwa 2 Minuten: {{2}} Vielen Dank!",
    );
    expect(templateBodyFor("maklervollmacht", names, "du")).toContain("Hallo {{1}}, damit Max deine bestehenden Verträge");
  });
  it("Vorlagen nur für Makler eingereicht, als Service (UTILITY)", () => {
    expect(purposesFor({ bestand: false })).not.toContain("maklervollmacht");
    expect(purposesFor({ bestand: false, makler: true })).toEqual(expect.arrayContaining(["maklervollmacht", "maklervollmacht_erinnerung"]));
    expect(categoryFor("maklervollmacht")).toBe("UTILITY");
    expect(categoryFor("maklervollmacht_erinnerung")).toBe("UTILITY");
  });
  it("Erinnerung geplant 2 Tage nach dem Senden, nur solange offen und noch keine; „Die App“ empfohlen", () => {
    const waSentAt = new Date("2026-11-18T10:00:00Z");
    expect(erinnerungGeplantAm({ status: "offen", waSentAt, erinnerungAt: null })?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    expect(erinnerungGeplantAm({ status: "unterschrieben", waSentAt, erinnerungAt: null })).toBeNull();
    expect(erinnerungGeplantAm({ status: "offen", waSentAt, erinnerungAt: new Date() })).toBeNull();
    expect(erinnerungGeplantAm({ status: "offen", waSentAt: null, erinnerungAt: null })).toBeNull();
    expect(VERSAND_ANTWORTEN.filter((x) => x.empfohlen).map((x) => x.wert)).toEqual(["app"]);
  });
});
