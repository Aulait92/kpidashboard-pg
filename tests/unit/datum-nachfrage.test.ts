// Datumsfragen im WhatsApp-Assistenten prüfen (Ole, 21.11.2026: Antwort „220.8.92“ auf „Wie lautet Ihr Geburtsdatum?“
// wurde übernommen). lib/datum-antwort.ts datumBefund/datumVorschlaege, lib/whatsapp/datum-nachfrage.ts datumSchritt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { datumBefund, datumLesen, datumVorschlaege } from "@/lib/datum-antwort";
import { DATUM_NACHFRAGE_RE, datumMerkerAus, datumSchritt, nachfrageText, nochmalText, vorschlagKnoepfe, vorschlagText, type DatumMerker } from "@/lib/whatsapp/datum-nachfrage";
import { geburtImChat } from "@/lib/whatsapp/geburt-chat";
import { tierAntwortAuswerten } from "@/lib/whatsapp/tier-fragen";

const heute = new Date("2026-11-21T10:00:00Z");
const schritt = (text: string, merker: DatumMerker | null = null, art: "geburt" | "geburtTier" | "ablauf" = "geburt", an: "sie" | "du" = "sie") =>
  datumSchritt({ art, feld: art, text, an, merker, jetzt: heute });

describe("datumLesen: Formate", () => {
  it("Freitext und Ziffern", () => {
    for (const t of ["22. August 1992", "22.8.92", "22/08/1992", "1992-08-22", "22.08.1992", "22 08 1992", "22081992", "220892", "22-8-1992", "22. Aug. 92"])
      expect(datumLesen(t, heute), t).toEqual({ tag: 22, monat: 8, jahr: 1992 });
  });
  it("kein Datum", () => {
    for (const t of ["220.8.92", "36272", "31.02.1992", "32.08.1992", "22.13.1992", "asdf"]) expect(datumLesen(t, heute), t).toBeNull();
  });
});

describe("datumBefund Geburtsdatum", () => {
  it("gültig: normalisiert TT.MM.JJJJ", () => {
    for (const t of ["22. August 1992", "22.8.92", "22/08/1992", "1992-08-22", "22081992", "am 22.8.1992"]) expect(datumBefund(t, "geburt", heute), t).toEqual({ art: "ok", wert: "22.08.1992" });
    expect(datumBefund("29.02.1992", "geburt", heute)).toEqual({ art: "ok", wert: "29.02.1992" });
    expect(datumBefund("1.1.1920", "geburt", heute)).toEqual({ art: "ok", wert: "01.01.1920" }); // 106 Jahre
  });
  it("Tippfehler mit Vorschlag", () => {
    expect(datumBefund("220.8.92", "geburt", heute)).toEqual({ art: "vorschlag", vorschlaege: ["22.08.1992", "20.08.1992"] });
    expect(datumBefund("22.088.1992", "geburt", heute)).toEqual({ art: "vorschlag", vorschlaege: ["22.08.1992"] });
    expect(datumBefund("08.22.1992", "geburt", heute)).toEqual({ art: "vorschlag", vorschlaege: ["22.08.1992"] });
    expect(datumBefund("22.08.19992", "geburt", heute)).toEqual({ art: "vorschlag", vorschlaege: ["22.08.1999", "22.08.1992"] });
    expect(datumBefund("311.12.1980", "geburt", heute)).toEqual({ art: "vorschlag", vorschlaege: ["31.12.1980", "11.12.1980"] });
  });
  it("unlesbar ohne eindeutige Korrektur", () => {
    for (const t of ["36272", "32.08.1992", "31.02.1992", "22.13.1992", "2.8.192", "12345678"]) expect(datumBefund(t, "geburt", heute).art, t).toBe("unlesbar");
  });
  it("Zukunft bzw. zu alt", () => {
    expect(datumBefund("22.08.2092", "geburt", heute)).toEqual({ art: "unplausibel", wert: "22.08.2092" });
    expect(datumBefund("01.01.1900", "geburt", heute)).toEqual({ art: "unplausibel", wert: "01.01.1900" });
    expect(datumBefund("22.11.2026", "geburt", heute).art).toBe("unplausibel"); // morgen
  });
  it("unter 18 bzw. ohne Zahl: bisheriger Ablauf", () => {
    expect(datumBefund("03.04.2012", "geburt", heute)).toEqual({ art: "jung", wert: "03.04.2012" });
    for (const t of ["weiß nicht", "keine Angabe", "Moment", ""]) expect(datumBefund(t, "geburt", heute).art, t).toBe("frei");
  });
  it("Vorschläge nur plausibel und höchstens zwei", () => {
    expect(datumVorschlaege("220.8.2092", "geburt", heute)).toEqual([]);
    expect(datumVorschlaege("2.8.192", "geburt", heute)).toEqual([]); // 1992, 2012, 2019: zu viele
  });
});

describe("datumBefund Tier und Ablauf", () => {
  it("Geburt des Tieres: Jahr, Monat und Jahr, Datum, Alter", () => {
    expect(datumBefund("2019", "geburtTier", heute)).toEqual({ art: "ok", wert: "2019" });
    expect(datumBefund("03/2020", "geburtTier", heute)).toEqual({ art: "ok", wert: "03/2020" });
    expect(datumBefund("3.20", "geburtTier", heute)).toEqual({ art: "ok", wert: "03/2020" });
    expect(datumBefund("12.3.2020", "geburtTier", heute)).toEqual({ art: "ok", wert: "12.03.2020" });
    expect(datumBefund("ca. März 2019", "geburtTier", heute)).toEqual({ art: "ok", wert: "ca. März 2019" });
    for (const t of ["5 Jahre", "8 Monate alt", "3", "Welpe", "weiß nicht"]) expect(datumBefund(t, "geburtTier", heute).art, t).toBe("frei");
  });
  it("Geburt des Tieres: Tippfehler, Zukunft, über 40", () => {
    expect(datumBefund("20199", "geburtTier", heute)).toEqual({ art: "vorschlag", vorschlaege: ["2019"] });
    expect(datumBefund("2029", "geburtTier", heute)).toEqual({ art: "unplausibel", wert: "2029" });
    expect(datumBefund("1970", "geburtTier", heute)).toEqual({ art: "unplausibel", wert: "1970" });
    expect(datumBefund("12/2027", "geburtTier", heute)).toEqual({ art: "unplausibel", wert: "12/2027" });
    expect(datumBefund("201", "geburtTier", heute).art).toBe("unlesbar");
  });
  it("Ablauf", () => {
    expect(datumBefund("03/27", "ablauf", heute)).toEqual({ art: "ok", wert: "03/2027" });
    expect(datumBefund("15.03.2027", "ablauf", heute)).toEqual({ art: "ok", wert: "03/2027" });
    expect(datumBefund("13/2027", "ablauf", heute).art).toBe("unlesbar");
    expect(datumBefund("weiß nicht", "ablauf", heute).art).toBe("frei");
  });
});

describe("datumSchritt: genau einmal nachfragen", () => {
  it("220.8.92: Vorschlag mit beiden Daten als Knöpfe", () => {
    const s = schritt("220.8.92");
    expect(s).toEqual({
      art: "fragen",
      text: "Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinen Sie den 22.08.1992 oder den 20.08.1992?",
      buttons: [
        { id: "datum:geburt:1", title: "22.08.1992" },
        { id: "datum:geburt:2", title: "20.08.1992" },
        { id: "datum:geburt:andere", title: "Anderes Datum" },
      ],
      merker: { vorschlaege: ["22.08.1992", "20.08.1992"], roh: "220.8.92" },
    });
    // Knopf mit Datum
    expect(schritt("22.08.1992", s && s.art === "fragen" ? s.merker : null)).toEqual({ art: "ok", wert: "22.08.1992" });
  });
  it("ein Vorschlag: [Ja, genau] [Anderes Datum]; „Ja, genau“ übernimmt den Vorschlag", () => {
    const s = schritt("22.088.1992");
    expect(s?.art === "fragen" && s.text).toBe("Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinen Sie den 22.08.1992?");
    expect(s?.art === "fragen" && s.buttons).toEqual([
      { id: "datum:geburt:ja", title: "Ja, genau" },
      { id: "datum:geburt:andere", title: "Anderes Datum" },
    ]);
    const m = s?.art === "fragen" ? s.merker : null;
    expect(schritt("Ja, genau", m)).toEqual({ art: "ok", wert: "22.08.1992" });
    expect(schritt("ja", m)).toEqual({ art: "ok", wert: "22.08.1992" });
  });
  it("Du-Fassung", () => {
    const s = schritt("22.088.1992", null, "geburt", "du");
    expect(s?.art === "fragen" && s.text).toBe("Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinst du den 22.08.1992?");
  });
  it("„Anderes Datum“: noch einmal fragen, danach gilt die Antwort", () => {
    const m: DatumMerker = { vorschlaege: ["22.08.1992"], roh: "22.088.1992" };
    const s = schritt("Anderes Datum", m);
    expect(s).toEqual({ art: "fragen", text: "Gern. Wie lautet Ihr Geburtsdatum? Bitte so: TT.MM.JJJJ.", buttons: null, merker: { ...m, andere: true } });
    expect(schritt("12.08.1992", { ...m, andere: true })).toEqual({ art: "ok", wert: "12.08.1992" });
    expect(schritt("nein", { ...m, andere: true })).toEqual({ art: "vermerk", wert: "22.088.1992 (bitte im Termin prüfen)" });
  });
  it("unlesbar: Nachfrage mit Form und Beispiel, zweite unklare Antwort mit Vermerk", () => {
    const s = schritt("36272");
    expect(s).toEqual({ art: "fragen", text: "Das Datum habe ich nicht erkannt. Bitte so: TT.MM.JJJJ, zum Beispiel 22.08.1992.", buttons: null, merker: { vorschlaege: [], roh: "36272" } });
    expect(schritt("3627", s?.art === "fragen" ? s.merker : null)).toEqual({ art: "vermerk", wert: "3627 (bitte im Termin prüfen)" });
    // zweite Antwort gültig: übernehmen
    expect(schritt("14.5.85", s?.art === "fragen" ? s.merker : null)).toEqual({ art: "ok", wert: "14.05.1985" });
  });
  it("Zukunft und zu alt: einmal nachfragen", () => {
    expect(schritt("22.08.2092")).toMatchObject({ art: "fragen", text: "Das Datum scheint nicht zu passen. Bitte so: TT.MM.JJJJ, zum Beispiel 22.08.1992." });
    expect(schritt("01.01.1900")).toMatchObject({ art: "fragen" });
    expect(schritt("01.01.1901", { vorschlaege: [], roh: "01.01.1900" })).toEqual({ art: "vermerk", wert: "01.01.1901 (bitte im Termin prüfen)" });
  });
  it("zwei Vorschläge und nur „ja“: nicht eindeutig, mit Vermerk weiter", () => {
    expect(schritt("ja", { vorschlaege: ["22.08.1992", "20.08.1992"], roh: "220.8.92" })).toEqual({ art: "vermerk", wert: "220.8.92 (bitte im Termin prüfen)" });
  });
  it("nicht zuständig: Rückfrage, keine Zahl, unter 18", () => {
    for (const t of ["Wozu brauchen Sie das?", "weiß nicht", "", "03.04.2012"]) expect(schritt(t), t).toBeNull();
  });
  it("Tier und Ablauf", () => {
    expect(schritt("2091", null, "geburtTier")).toMatchObject({ art: "fragen", text: "Das Datum scheint nicht zu passen. Das Jahr reicht, zum Beispiel 2019." });
    expect(schritt("20199", null, "geburtTier")).toMatchObject({ art: "fragen", text: "Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinen Sie 2019?" });
    expect(schritt("13/2027", null, "ablauf")).toMatchObject({ art: "fragen", text: "Das Datum habe ich nicht erkannt. Monat und Jahr reichen, zum Beispiel 03/2027." });
    expect(schritt("03/27", null, "ablauf")).toEqual({ art: "ok", wert: "03/2027" });
  });
  it("Merker lesen", () => {
    expect(datumMerkerAus(JSON.stringify({ appointmentId: "x", feld: "geburt", vorschlaege: ["22.08.1992"], roh: "22.088.1992" }))).toEqual({ vorschlaege: ["22.08.1992"], roh: "22.088.1992" });
    expect(datumMerkerAus(JSON.stringify({ appointmentId: "x", key: "gesundheitDetail" }))).toBeNull();
    expect(datumMerkerAus("kaputt")).toBeNull();
  });
});

describe("Texte", () => {
  it("ohne Gedankenstriche, beide Ansprachen, Nachfragen werden erkannt", () => {
    const texte = [
      ...(["sie", "du"] as const).flatMap((an) => [vorschlagText(an, ["22.08.1992"]), vorschlagText(an, ["22.08.1992", "20.08.1992"]), ...(["geburt", "geburtTier", "ablauf"] as const).map((art) => nochmalText(art, an, heute))]),
      ...(["geburt", "geburtTier", "ablauf"] as const).flatMap((art) => [nachfrageText(art, "unlesbar", heute), nachfrageText(art, "unplausibel", heute)]),
    ];
    for (const t of texte) {
      expect(t, t).not.toMatch(/[–—]/);
      expect(DATUM_NACHFRAGE_RE.test(t), t).toBe(true);
    }
    for (const k of vorschlagKnoepfe("geburt", ["22.08.1992", "20.08.1992"])) expect(k.title.length).toBeLessThanOrEqual(20);
  });
});

describe("Geburtsdatum über den Assistenten (geburt-chat.ts)", () => {
  const basis = { an: "sie" as const, person: "Herr Kannapinn", tierLead: false, jetzt: heute };
  it("Tippfehler: Vorschlag mit Knöpfen, „Ja, genau“ übernimmt", () => {
    const r = geburtImChat({ ...basis, wert: "22.088.1992", schon: [] });
    expect(r.geburt).toBeNull();
    expect(r.frage).toBe("Da hat sich vielleicht ein Tippfehler eingeschlichen. Meinen Sie den 22.08.1992?");
    expect(r.buttons?.map((b) => b.title)).toEqual(["Ja, genau", "Anderes Datum"]);
    expect(geburtImChat({ ...basis, wert: "Ja, genau", schon: [r.merker!] }).geburt).toBe("22.08.1992");
  });
  it("220.8.92: beide Möglichkeiten", () => {
    const r = geburtImChat({ ...basis, wert: "220.8.92", schon: [] });
    expect(r.buttons?.map((b) => b.title)).toEqual(["22.08.1992", "20.08.1992", "Anderes Datum"]);
  });
});

describe("Tierfragen mit Datum", () => {
  const q = { source: "Katzenkrankenversicherung", formular: [{ label: "Name des Tieres", value: "Minka" }], angaben: null };
  it("zweite unklare Antwort wörtlich mit Vermerk", () => {
    expect(tierAntwortAuswerten("geburt", "220.8.92 (bitte im Termin prüfen)", null, q, heute, { ungeprueft: true })?.angaben.geburt).toBe("220.8.92 (bitte im Termin prüfen)");
    expect(tierAntwortAuswerten("geburtTier", "201 (bitte im Termin prüfen)", null, q, heute, { ungeprueft: true })?.angaben.tier).toBe("Geboren: 201 (bitte im Termin prüfen)");
    expect(tierAntwortAuswerten("vorhandenAblauf", "13/2027 (bitte im Termin prüfen)", null, q, heute, { ungeprueft: true })?.angaben.vorhanden).toBe(
      "Tierversicherung vorhanden, läuft bis 13/2027 (bitte im Termin prüfen)",
    );
  });
  it("Strecke prüft das Datum vor der Auswertung und merkt die Nachfrage", () => {
    const src = readFileSync("src/lib/whatsapp/termin-strecke.ts", "utf8");
    expect(src.indexOf("datumSchritt({ art: datumArt")).toBeGreaterThan(0);
    expect(src.indexOf("datumSchritt({ art: datumArt")).toBeLessThan(src.indexOf("const r = tierAntwortAuswerten(key, antwort"));
    expect(src).toContain('datumSchritt({ art: "geburt", feld: "geburt"');
    expect(src).toContain("kind: STRECKE.datumNachfrage");
  });
});
