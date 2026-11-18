import { describe, expect, it } from "vitest";
import { geburtsdatum, gesundheitNoetig, pruefeEingabe, signaturAusDataUrl, versichererListe, fuelle } from "@/lib/maklervollmacht/regeln";
import { einwilligungGesundheit, hinweisUnterschrift, kopieMail, linkMail, maklerauftrag, protokoll, uebertragungsschreiben, vollmacht, GESUNDHEIT_HAEKCHEN, ZUSTIMMUNG_TEXT } from "@/lib/maklervollmacht/texte";
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
    einwilligungGesundheit(c, "sie"),
    einwilligungGesundheit(c, "du"),
    uebertragungsschreiben(c, "Allianz", r.eingabe.vertraege.slice(0, 1), false),
    protokoll(c, { an: "sie", gesundheit: true, ipKurz: "203.0.113.0", geraet: "Test", weg: "Link", hashes: [{ name: "x", sha256: "ab" }] }),
  ];
  const texte = [
    ...alle.flatMap((ab) => [ab.titel, ...ab.absaetze]),
    hinweisUnterschrift("sie", "Max Berger"),
    hinweisUnterschrift("du", "Max Berger"),
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
    const e = einwilligungGesundheit(c, "du").absaetze.join("\n");
    expect(e).toContain("HUK-Coburg");
    expect(e).not.toContain("Privathaftpflicht");
    expect(e).toContain("kann dich dazu nur eingeschränkt beraten");
    expect(uebertragungsschreiben(c, "Allianz", r.eingabe.vertraege.slice(0, 1), false).absaetze.join("\n")).toMatch(/Bitte bestätigen Sie uns die Übertragung/);
  });
  it("PDF mit Unterschrift, gleiche Eingabe ergibt gleiche Prüfsumme", async () => {
    const sig = signaturAusDataUrl(testPng())!;
    const p1 = await vollmachtPdf({ titel: "Maklervollmacht", abschnitte: alle.slice(0, 3), signaturPng: sig, dokumentId: "vv_test" });
    const p2 = await vollmachtPdf({ titel: "Maklervollmacht", abschnitte: alle.slice(0, 3), signaturPng: sig, dokumentId: "vv_test" });
    expect(Buffer.from(p1.slice(0, 5)).toString()).toBe("%PDF-");
    expect(sha256(p1)).toBe(sha256(p2));
  });
});
