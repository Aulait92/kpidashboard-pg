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
  abschlussSchritt,
  einladungMitEinwilligung,
  policenKiEu,
  typAusMime,
  vorabEinordnung,
  widerrufVerdacht,
  EINWILLIGUNG_VERSION,
  minderjaehrig,
} from "@/lib/policen/regeln";
import { datenschutzPolicenAbschnitte } from "@/lib/policen/datenschutz-text";
import { angabenOhneGesundheit, ohneGesundheitsangaben } from "@/lib/gesundheitsdaten";
import { bereitlegenListe } from "@/lib/whatsapp/gespraech";
import { downloadUrl } from "@/lib/policen/media";
import { decryptBytes, encryptBytes } from "@/lib/encryption";

const herr = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
const ole = { nom: "Ole", dat: "Ole" };
const vHerr = { person: herr, firma: "Kannapinn Versicherungen", link: "https://termine.example.de/datenschutz/policen?k=abcDEF123" };
const vOle = { ...vHerr, person: ole };
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
    einwilligungText(an, an === "du" ? vOle : vHerr),
    einwilligungText(an, an === "du" ? vOle : vHerr, { nachDatei: true }),
    ...datenschutzPolicenAbschnitte(an, { name: "Ole Kannapinn", firma: "Kannapinn Versicherungen", anschrift: "Lorenzstraße 58, 12209 Berlin", telefon: "030 123", email: "ole@example.de" }).flatMap((b) => [b.ueberschrift, b.text]),
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

  it("Einwilligung im Wortlaut (Rechtsprüfung Abschnitt b), mit Vermittler, Firma und Link, höchstens 1.024 Zeichen", () => {
    expect(einwilligungText("sie", vHerr)).toBe(
      [
        "Vor dem Termin können Sie uns Fotos oder PDFs Ihrer bisherigen Versicherungen hier schicken. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer Gesundheit enthalten.",
        "Sind Sie einverstanden, dass Herr Kannapinn (Kannapinn Versicherungen) Ihre Unterlagen einschließlich dieser Gesundheitsangaben speichert und zur Vorbereitung Ihres Termins nutzt? Eine KI ordnet jede Unterlage einer Versicherungsart zu, Gesundheitsangaben werden nicht ausgewertet. Dafür setzen wir Dienstleister ein, auch in den USA. Sehen kann die Unterlagen nur Ihr Berater.",
        "Zustimmen können Sie ab 18 Jahren. Unterlagen von mitversicherten Personen schicken Sie bitte nur mit deren Einverständnis (bei Kindern als Elternteil). Ohne Vertragsabschluss löschen wir alles 30 Tage nach dem Termin. Sie können jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“.",
        "Mehr dazu: https://termine.example.de/datenschutz/policen?k=abcDEF123",
      ].join("\n\n"),
    );
    const du = einwilligungText("du", vOle);
    expect(du).toContain("Bist du einverstanden, dass Ole (Kannapinn Versicherungen) deine Unterlagen einschließlich dieser Gesundheitsangaben speichert");
    expect(du).toContain("Du kannst jederzeit widerrufen");
    expect(du).toContain("Zustimmen kannst du ab 18 Jahren.");
    expect(EINWILLIGUNG_RE.test(du)).toBe(true);
    expect(einwilligungText("sie", vHerr, { nachDatei: true })).toMatch(/^Danke für Ihre Unterlage\. Unterlagen zur Kranken-/);
    // Firma gleich Name: keine Klammer; ohne Link keine Zeile „Mehr dazu“
    const ohne = einwilligungText("sie", { person: { nom: "Ole Kannapinn", dat: "Ole Kannapinn" }, firma: "Ole Kannapinn", link: null });
    expect(ohne).toContain("dass Ole Kannapinn Ihre Unterlagen");
    expect(ohne).not.toContain("Mehr dazu");
    for (const an of ["sie", "du"] as const) for (const nachDatei of [false, true]) {
      expect(einwilligungText(an, an === "du" ? vOle : vHerr, { nachDatei }).length).toBeLessThanOrEqual(1024);
      expect(EINLADUNG_RE.test(einwilligungText(an, an === "du" ? vOle : vHerr))).toBe(true);
    }
    const inv = einladungMitEinwilligung("sie", vHerr);
    expect(inv.buttons.map((b) => b.title)).toEqual([KNOPF_JA, KNOPF_NEIN]);
    expect(EINWILLIGUNG_VERSION).toBe("2026-11-17.3");
    // WhatsApp-Knöpfe: höchstens 20 Zeichen
    expect(KNOPF_JA.length).toBeLessThanOrEqual(20);
    expect(KNOPF_NEIN.length).toBeLessThanOrEqual(20);
  });

  it("Langfassung: EU-Verarbeitung der KI nur, wenn der EU-Endpunkt eingerichtet ist; Altersgrenze; Datei vor der Einwilligung nicht gespeichert", () => {
    const v = { name: "Ole Kannapinn", firma: "Kannapinn Versicherungen", anschrift: "Lorenzstraße 58, 12209 Berlin", telefon: "030 123", email: "ole@example.de" };
    const text = (kiEu: boolean) => datenschutzPolicenAbschnitte("sie", v, { kiEu }).map((b) => `${b.ueberschrift}: ${b.text}`).join("\n");
    expect(text(true)).toContain("Anthropic für die KI-Zuordnung (Claude, verarbeitet in einem Rechenzentrum in der EU)");
    expect(text(true)).toContain("Die KI-Zuordnung der Unterlagen findet in der EU statt.");
    expect(text(false)).not.toContain("in der EU statt");
    expect(text(false)).toContain("Anthropic für die KI-Zuordnung. Versicherer");
    expect(text(false)).toContain("Alter: Die Einwilligung können Sie ab 18 Jahren geben.");
    expect(text(false)).toContain("Eine Datei, die Gesundheitsangaben enthalten kann und vor Ihrer Einwilligung kommt, wird nicht gespeichert");
    for (const an of ["sie", "du"] as const) for (const kiEu of [false, true])
      for (const b of datenschutzPolicenAbschnitte(an, v, { kiEu })) expect(`${b.ueberschrift} ${b.text}`).not.toMatch(/[–—]|Garantie/);
  });

  it("keine Gedankenstriche, Du-Fassung ohne Sie, Sie-Fassung ohne du", () => {
    for (const t of [...alle("sie"), ...alle("du")]) expect(t).not.toMatch(/[–—]/);
    for (const t of alle("du")) expect(t).not.toMatch(/\b(Sie|Ihnen|Ihre?n?)\b/);
    for (const t of alle("sie")) expect(t).not.toMatch(/\b(du|dir|dein\w*)\b/i);
  });
});

describe("Minderjährige (Abschnitt e, Punkt 11)", () => {
  const jetzt = new Date("2026-11-17T12:00:00Z");
  it("erkennt ein Geburtsdatum unter 18 Jahren, sonst nicht", () => {
    expect(minderjaehrig([{ label: "Geburtsdatum", value: "18.11.2008" }], jetzt)).toBe(true);
    expect(minderjaehrig([{ label: "Geburtsdatum", value: "17.11.2008" }], jetzt)).toBe(false);
    expect(minderjaehrig([{ label: "Geburtsdatum", value: "2010-03-01" }], jetzt)).toBe(true);
    expect(minderjaehrig([{ label: "Geburtsdatum", value: "14.05.1978" }], jetzt)).toBe(false);
    expect(minderjaehrig([{ label: "Alter", value: "17" }], jetzt)).toBe(true);
    expect(minderjaehrig([{ label: "Alter", value: "42" }], jetzt)).toBe(false);
  });
  it("Tier, Kind und Unbekanntes zählen nicht", () => {
    expect(minderjaehrig([{ label: "Geburtsjahr (Tier)", value: "2021" }], jetzt)).toBe(false);
    expect(minderjaehrig([{ label: "Geburtsdatum Kind", value: "01.01.2020" }], jetzt)).toBe(false);
    expect(minderjaehrig([{ label: "Geburtsdatum", value: "unbekannt" }], jetzt)).toBe(false);
    expect(minderjaehrig(null, jetzt)).toBe(false);
    expect(minderjaehrig({ Geburtsdatum: "01.01.2015" }, jetzt)).toBe(false);
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
  it("Widerruf sinngemäß nach Regeln, sonst Verdacht für die KI", () => {
    for (const t of [
      "Ich nehme meine Einwilligung zurück",
      "Ich ziehe mein Einverständnis zurück",
      "Ich bin doch nicht einverstanden",
      "Bitte die Unterlagen nicht mehr speichern",
      "Bitte entfernen Sie meine Daten",
      "Können Sie die Fotos wieder löschen?",
    ])
      expect(istWiderruf(t), t).toBe(true);
    for (const t of ["Ich will das doch nicht", "Bitte nehmt meine Sachen wieder raus, Datenschutz und so", "Lieber nicht, hab es mir anders überlegt"]) {
      expect(istWiderruf(t), t).toBe(false);
      expect(widerrufVerdacht(t), t).toBe(true);
    }
    expect(istWiderruf("Ich bin nicht einverstanden mit dem Termin")).toBe(false);
    expect(widerrufVerdacht("Passt morgen um 10?")).toBe(false);
    expect(widerrufVerdacht("Danke, bis Donnerstag")).toBe(false);
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
  it("30 Tage nach dem letzten Termin, ohne Termin nach dem Eingang; Abschluss 90 Tage; behalten nie", () => {
    expect(loeschDatum({ termine: [T("2026-11-20T10:00:00Z"), T("2026-11-25T10:00:00Z")], eingang: T("2026-11-17T10:00:00Z"), abschluss: false })).toEqual(T("2026-12-25T10:00:00Z"));
    expect(loeschDatum({ termine: [], eingang: T("2026-11-17T10:00:00Z"), abschluss: false })).toEqual(T("2026-12-17T10:00:00Z"));
    expect(loeschDatum({ termine: [T("2026-11-20T10:00:00Z")], eingang: T("2026-11-17T10:00:00Z"), abschluss: true, abschlussAm: T("2026-11-21T10:00:00Z") })).toEqual(T("2027-02-19T10:00:00Z"));
    // Abschluss vor dem Eingang bzw. unbekannt: ab Eingang
    expect(loeschDatum({ termine: [], eingang: T("2026-11-17T10:00:00Z"), abschluss: true, abschlussAm: T("2026-01-01T10:00:00Z") })).toEqual(T("2027-02-15T10:00:00Z"));
    expect(loeschDatum({ termine: [], eingang: T("2026-11-17T10:00:00Z"), abschluss: true })).toEqual(T("2027-02-15T10:00:00Z"));
    expect(loeschDatum({ termine: [], eingang: T("2026-11-17T10:00:00Z"), abschluss: true, behalten: true })).toBeNull();
    expect(loeschDatum({ termine: [], eingang: T("2026-11-17T10:00:00Z"), abschluss: false, behalten: true })).toBeNull();
  });
  it("nach Abschluss erst erinnern (14 Tage vorher), dann löschen; späte Erinnerung verschiebt die Löschung", () => {
    const datum = T("2027-02-19T10:00:00Z");
    expect(abschlussSchritt({ datum, erinnertAt: null, now: T("2027-01-01T10:00:00Z") })).toEqual({ aktion: "warten", deleteAfter: datum });
    expect(abschlussSchritt({ datum, erinnertAt: null, now: T("2027-02-05T10:00:00Z") })).toEqual({ aktion: "erinnern", deleteAfter: datum });
    expect(abschlussSchritt({ datum, erinnertAt: T("2027-02-05T10:00:00Z"), now: T("2027-02-10T10:00:00Z") }).aktion).toBe("warten");
    expect(abschlussSchritt({ datum, erinnertAt: T("2027-02-05T10:00:00Z"), now: T("2027-02-19T10:00:00Z") }).aktion).toBe("loeschen");
    // Frist schon vorbei, noch nicht erinnert: erst erinnern, Löschung 14 Tage später
    const spaet = abschlussSchritt({ datum, erinnertAt: null, now: T("2027-03-01T10:00:00Z") });
    expect(spaet).toEqual({ aktion: "erinnern", deleteAfter: T("2027-03-15T10:00:00Z") });
  });
});

describe("Schalter an: Einordnung ohne Inhalt und KI-Region", () => {
  it("vorab nur nach Dateiname, Begleittext und Angaben des Leads; unbekannt gilt als möglich", () => {
    expect(vorabEinordnung({ text: "HUK Haftpflicht.pdf" })).toEqual({ sparte: "haftpflicht", gesundheitMoeglich: false });
    expect(vorabEinordnung({ text: "BU Police.pdf" })).toEqual({ sparte: "bu", gesundheitMoeglich: true });
    expect(vorabEinordnung({ text: "IMG_1234.jpg " })).toEqual({ sparte: null, gesundheitMoeglich: true });
    expect(vorabEinordnung({ text: "IMG_1234.jpg", leadAngaben: ["Haftpflicht HUK, Hausrat Allianz"] })).toEqual({ sparte: null, gesundheitMoeglich: false });
    expect(vorabEinordnung({ text: "IMG_1234.jpg", leadAngaben: ["Hausrat Allianz"] })).toEqual({ sparte: "hausrat", gesundheitMoeglich: false });
    expect(vorabEinordnung({ text: "IMG_1234.jpg", leadAngaben: ["Haftpflicht HUK, BU Allianz"] }).gesundheitMoeglich).toBe(true);
    expect(vorabEinordnung({ text: "scan.pdf", leadAngaben: ["Privatschutz", "PKV"] }).gesundheitMoeglich).toBe(true);
    expect(typAusMime("image/jpeg")).toBe("image/jpeg");
    expect(typAusMime("application/pdf")).toBe("application/pdf");
  });
  it("KI für mögliche Gesundheitsunterlagen nur mit EU-Endpunkt", () => {
    expect(policenKiEu({})).toBeNull();
    expect(policenKiEu({ POLICEN_KI_REGION: "eu" })).toBeNull();
    expect(policenKiEu({ POLICEN_KI_REGION: "eu", POLICEN_KI_EU_URL: "http://unsicher.example", POLICEN_KI_EU_KEY: "k" })).toBeNull();
    expect(policenKiEu({ POLICEN_KI_REGION: "us", POLICEN_KI_EU_URL: "https://eu.example", POLICEN_KI_EU_KEY: "k" })).toBeNull();
    expect(policenKiEu({ POLICEN_KI_REGION: "EU", POLICEN_KI_EU_URL: "https://eu.example/", POLICEN_KI_EU_KEY: "k", POLICEN_KI_EU_MODEL: "claude-opus-5-5" })).toEqual({
      baseURL: "https://eu.example",
      apiKey: "k",
      model: "claude-opus-5-5",
    });
  });
});

describe("Gesundheitsangaben nicht in Felder und Notizen", () => {
  it("entfernt Sätze und Stichworte mit Gesundheitsangaben, Tierangaben bleiben", () => {
    expect(ohneGesundheitsangaben("Interesse an Haftpflicht. Hatte letztes Jahr einen Bandscheibenvorfall.")).toBe("Interesse an Haftpflicht.");
    expect(ohneGesundheitsangaben("Haftpflicht, Diabetes Typ 2")).toBe("Haftpflicht");
    expect(ohneGesundheitsangaben("Katze hat Diabetes", { tier: true })).toBe("Katze hat Diabetes");
    expect(angabenOhneGesundheit({ interesse: "BU, nimmt Medikamente gegen Bluthochdruck", wunsch: "Videocall", tier: "Katze, Diabetes" })).toEqual({
      interesse: "BU",
      wunsch: "Videocall",
      tier: "Katze, Diabetes",
    });
  });
});
