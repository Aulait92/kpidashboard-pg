// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026): reine Regeln, Texte und Verschlüsselung (lib/policen).
import { describe, expect, it } from "vitest";
import {
  auszugZeile,
  cleanAuszug,
  dateiname,
  einladungFaellig,
  einladungText,
  einwilligungText,
  entscheide,
  formatText,
  gesundheitAusText,
  gesundheitInVertraegen,
  hatVertraege,
  istAblehnung,
  istWiderruf,
  istZustimmung,
  loeschDatum,
  mimeErlaubt,
  ohneBisherigePolicen,
  policenGesundheitAn,
  sparteAusText,
  typAusInhalt,
  vertraegeAusUnterlagen,
  widerrufText,
  zuGrossText,
  nichtGeladenText,
  EINLADUNG_RE,
  EINWILLIGUNG_RE,
  KNOPF_JA,
  KNOPF_NEIN,
} from "@/lib/policen/regeln";
import { bereitlegenListe } from "@/lib/whatsapp/gespraech";
import { downloadUrl } from "@/lib/policen/media";
import { decryptBytes, encryptBytes } from "@/lib/encryption";

const herr = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
const ole = { nom: "Ole", dat: "Ole" };
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

describe("Schalter POLICEN_GESUNDHEIT_AN", () => {
  it("ist standardmäßig aus", () => {
    expect(policenGesundheitAn({})).toBe(false);
    expect(policenGesundheitAn({ POLICEN_GESUNDHEIT_AN: "" })).toBe(false);
    expect(policenGesundheitAn({ POLICEN_GESUNDHEIT_AN: "0" })).toBe(false);
    expect(policenGesundheitAn({ POLICEN_GESUNDHEIT_AN: "true" })).toBe(true);
    expect(policenGesundheitAn({ POLICEN_GESUNDHEIT_AN: "1" })).toBe(true);
  });
});

describe("Sparte und Gesundheitsbezug", () => {
  it("erkennt Sparten aus Dateiname und Vertragsliste", () => {
    expect(sparteAusText("HUK_Privathaftpflicht_2025.pdf")).toBe("haftpflicht");
    expect(sparteAusText("Hausratversicherung Allianz")).toBe("hausrat");
    expect(sparteAusText("Wohngebäudeversicherung")).toBe("wohngebaeude");
    expect(sparteAusText("Tierhalterhaftpflicht Hund")).toBe("tier");
    expect(sparteAusText("BU-Versicherung")).toBe("bu");
    expect(sparteAusText("Krankenversicherung DKV")).toBe("kranken");
    expect(sparteAusText("Unfallversicherung")).toBe("unfall");
    expect(sparteAusText("IMG_2034.jpg")).toBeNull();
  });

  it("KI vorn, Text kann Gesundheit nur ergänzen; ohne KI und ohne Sparte vorsichtig", () => {
    expect(entscheide({ ki: { sparte: "haftpflicht", gesundheit: false, police: true }, text: "scan.pdf" })).toEqual({ sparte: "haftpflicht", gesundheit: false });
    expect(entscheide({ ki: { sparte: "kranken", gesundheit: true, police: true }, text: "scan.pdf" }).gesundheit).toBe(true);
    // KI meint Sach, der Begleittext sagt BU: Gesundheitsbezug
    expect(entscheide({ ki: { sparte: "sonstig", gesundheit: false, police: true }, text: "scan.pdf Meine BU" }).gesundheit).toBe(true);
    expect(entscheide({ ki: null, text: "Hausrat.pdf" })).toEqual({ sparte: "hausrat", gesundheit: false });
    expect(entscheide({ ki: null, text: "IMG_1.jpg" })).toEqual({ sparte: null, gesundheit: true });
    // Tierkranken ist kein Gesundheitsbezug einer Person
    expect(entscheide({ ki: null, text: "Tier-OP Katze.pdf" }).gesundheit).toBe(false);
  });

  it("Vertragsliste mit Gesundheitssparte", () => {
    expect(gesundheitInVertraegen({ vorhanden: "Haftpflicht HUK, BU Allianz" })).toBe(true);
    expect(gesundheitInVertraegen({ vorhanden: "Haftpflicht HUK, Hausrat Allianz" })).toBe(false);
    expect(gesundheitInVertraegen({ vorhanden: "Hunde-OP bei Uelzener" })).toBe(false);
  });
});

describe("Dateien", () => {
  it("prüft den Typ am Inhalt", () => {
    expect(typAusInhalt(PDF)).toBe("application/pdf");
    expect(typAusInhalt(JPG)).toBe("image/jpeg");
    expect(typAusInhalt(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBeNull(); // HEIC
    expect(mimeErlaubt("image/jpeg")).toBe(true);
    expect(mimeErlaubt("application/pdf")).toBe(true);
    expect(mimeErlaubt("image/heic")).toBe(false);
    expect(mimeErlaubt("video/mp4")).toBe(false);
  });

  it("Dateiname ohne Pfadzeichen, Fotos mit Datum", () => {
    expect(dateiname("../Police HUK.pdf", "application/pdf")).toBe(".._Police HUK.pdf");
    expect(dateiname(null, "image/jpeg", new Date("2026-11-17T10:00:00Z"))).toBe("Foto 17.11.2026.jpg");
    expect(dateiname("Police", "application/pdf")).toBe("Police.pdf");
  });

  it("verschlüsselt und entschlüsselt Dateien (AES-256-GCM)", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    const enc = encryptBytes(PDF);
    expect(Buffer.from(enc).includes(Buffer.from(PDF))).toBe(false);
    expect(new Uint8Array(decryptBytes(enc))).toEqual(PDF);
    const kaputt = Buffer.from(enc);
    kaputt[kaputt.length - 1] ^= 1;
    expect(() => decryptBytes(kaputt)).toThrow();
  });

  it("lädt Medien über 360dialog statt lookaside", () => {
    expect(downloadUrl("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123&ext=1", "https://waba-v2.360dialog.io")).toBe(
      "https://waba-v2.360dialog.io/whatsapp_business/attachments/?mid=123&ext=1",
    );
  });
});

describe("Texte an den Lead", () => {
  const alle = (an: "sie" | "du") => [
    einladungText(an, an === "du" ? ole : herr, { gesundheitAn: true }),
    einladungText(an, an === "du" ? ole : herr, { gesundheitAn: false, gesundheitInListe: true }),
    einladungText(an, an === "du" ? ole : herr, { gesundheitAn: false }),
    einwilligungText(an, an === "du" ? ole : herr),
    gesundheitAusText(an, an === "du" ? ole : herr),
    formatText(an),
    zuGrossText(an),
    nichtGeladenText(an),
    widerrufText(an),
  ];

  it("Einladung wie gewünscht (Sie), Schalter aus nur Sachversicherungen", () => {
    expect(einladungText("sie", herr, { gesundheitAn: true })).toBe(
      "Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen hier in den Chat, dann kann sich Herr Kannapinn vorher einlesen. Sonst schauen wir sie im Termin gemeinsam an.",
    );
    const aus = einladungText("sie", herr, { gesundheitAn: false, gesundheitInListe: true });
    expect(aus).toContain("Sachversicherungen wie Haftpflicht, Hausrat oder Kfz");
    expect(aus).toContain("Kranken-, BU- oder Lebensversicherung schauen wir uns im Termin gemeinsam an");
    expect(EINLADUNG_RE.test(aus)).toBe(true);
    expect(EINLADUNG_RE.test(einladungText("du", ole, { gesundheitAn: true }))).toBe(true);
  });

  it("Einwilligung im Wortlaut", () => {
    expect(einwilligungText("sie", herr)).toBe(
      "Unterlagen zur Kranken-, BU- oder Lebensversicherung können Gesundheitsangaben enthalten. Dürfen wir sie für Herrn Kannapinn zur Vorbereitung speichern? Sie können das jederzeit widerrufen.",
    );
    expect(einwilligungText("du", ole)).toContain("Du kannst das jederzeit widerrufen.");
    expect(EINWILLIGUNG_RE.test(einwilligungText("du", ole))).toBe(true);
    // WhatsApp-Knöpfe: höchstens 20 Zeichen
    expect(KNOPF_JA.length).toBeLessThanOrEqual(20);
    expect(KNOPF_NEIN.length).toBeLessThanOrEqual(20);
  });

  it("keine Gedankenstriche, Du-Fassung ohne Sie, Sie-Fassung ohne du", () => {
    for (const t of [...alle("sie"), ...alle("du")]) expect(t).not.toMatch(/[–—]/);
    for (const t of alle("du")) expect(t).not.toMatch(/\b(Sie|Ihnen|Ihre?n?)\b/);
    for (const t of alle("sie")) expect(t).not.toMatch(/\b(du|dir|dein\w*)\b/i);
  });
});

describe("Antworten des Leads", () => {
  it("Widerruf: „Widerruf“ und „Unterlagen löschen“, nicht „Termin löschen“", () => {
    expect(istWiderruf("Widerruf")).toBe(true);
    expect(istWiderruf("Ich widerrufe meine Einwilligung")).toBe(true);
    expect(istWiderruf("Bitte meine Unterlagen löschen")).toBe(true);
    expect(istWiderruf("Bitte löschen Sie die Police wieder")).toBe(true);
    expect(istWiderruf("Bitte den Termin löschen")).toBe(false);
    expect(istWiderruf("Ich möchte meinen alten Vertrag widerrufen")).toBe(false);
    expect(istWiderruf("Widerruf der Einwilligung")).toBe(true);
    expect(istWiderruf("Ja gern")).toBe(false);
  });
  it("getippte Zustimmung und Ablehnung", () => {
    expect(istZustimmung("Ja")).toBe(true);
    expect(istZustimmung("ja, einverstanden!")).toBe(true);
    expect(istZustimmung("Ja, aber erst morgen")).toBe(false);
    expect(istAblehnung("Lieber im Termin")).toBe(true);
    expect(istAblehnung("Nein")).toBe(true);
    expect(istAblehnung("nein danke")).toBe(true);
  });
});

describe("Ablauf im Assistenten", () => {
  it("lädt nach der Vertragsfrage einmal ein", () => {
    expect(hatVertraege({ vorhanden: "Haftpflicht bei HUK, Hausrat Allianz" })).toBe(true);
    expect(hatVertraege({ vorhanden: "keine" })).toBe(false);
    expect(hatVertraege({ vorhanden: "Keine Verträge" })).toBe(false);
    expect(hatVertraege({ komplettcheck: "ja" })).toBe(true);
    expect(hatVertraege(null)).toBe(false);
    const q = { vorhanden: "Haftpflicht HUK" };
    expect(einladungFaellig({ qualificationData: q, outbound: ["Danke!"] })).toBe(true);
    expect(einladungFaellig({ qualificationData: q, outbound: [einladungText("sie", herr, { gesundheitAn: false })] })).toBe(false);
  });

  it("Bereitlegen-Liste ohne bisherige Policen, wenn welche geschickt wurden", () => {
    const liste = bereitlegenListe("Privatschutz", ["hausrat", "wohngebaeude"], "sie");
    expect(liste.some((x) => /bisherigen Policen/.test(x))).toBe(true);
    const ohne = ohneBisherigePolicen(liste, true);
    expect(ohne.some((x) => /Polic/.test(x))).toBe(false);
    expect(ohne).toContain("bei Wohngebäude: Baujahr und Wohnfläche");
    expect(ohneBisherigePolicen(liste, false)).toEqual(liste);
    const du = ohneBisherigePolicen(bereitlegenListe("Privatschutz", ["haftpflicht"], "du"), true);
    expect(du.some((x) => /Polic/.test(x))).toBe(false);
  });
});

describe("Auslesen (nur Sachversicherungen)", () => {
  it("bereinigt die KI-Ausgabe", () => {
    const x = cleanAuszug({ gesellschaft: " HUK-Coburg ", sparte: "haftpflicht", beitrag: "89,50", zahlweise: "jaehrlich", versicherungssumme: "10 Mio. €", selbstbeteiligung: "150 €", ablauf: "01.03.2027", hauptfaelligkeit: null });
    expect(x).toEqual({ gesellschaft: "HUK-Coburg", sparte: "haftpflicht", beitrag: 89.5, zahlweise: "jährlich", versicherungssumme: "10 Mio. €", selbstbeteiligung: "150 €", ablauf: "01.03.2027", hauptfaelligkeit: null });
    expect(auszugZeile(x)?.replace(/\u00a0/g, " ")).toBe("HUK-Coburg · 89,50 € jährlich · Summe 10 Mio. € · SB 150 € · Ablauf 01.03.2027");
    // Gesundheitssparten werden nie übernommen
    expect(cleanAuszug({ gesellschaft: "DKV", sparte: "kranken", beitrag: 400 })).toBeNull();
    expect(cleanAuszug({})).toBeNull();
  });
  it("eigene Vertragsliste, ohne Gesundheitsbezug", () => {
    const v = vertraegeAusUnterlagen([
      { id: "a", extracted: { gesellschaft: "HUK", sparte: "hausrat", beitrag: 60 }, gesundheitsbezug: false },
      { id: "b", extracted: { gesellschaft: "DKV" }, gesundheitsbezug: true },
      { id: "c", extracted: null, gesundheitsbezug: false },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ quelle: "unterlage", unterlageId: "a", sparte: "hausrat", gesellschaft: "HUK", beitrag: 60 });
  });
});

describe("Löschfrist", () => {
  const T = (s: string) => new Date(s);
  it("30 Tage nach dem letzten Termin, ohne Termin nach dem Eingang, bei Abschluss nie", () => {
    expect(loeschDatum({ termine: [T("2026-11-20T10:00:00Z"), T("2026-11-25T10:00:00Z")], eingang: T("2026-11-17T10:00:00Z"), abschluss: false })).toEqual(T("2026-12-25T10:00:00Z"));
    expect(loeschDatum({ termine: [], eingang: T("2026-11-17T10:00:00Z"), abschluss: false })).toEqual(T("2026-12-17T10:00:00Z"));
    expect(loeschDatum({ termine: [T("2026-11-20T10:00:00Z")], eingang: T("2026-11-17T10:00:00Z"), abschluss: true })).toBeNull();
  });
});
