// Policen per WhatsApp (Ole, 18.11.2026, nach der Rechtsprüfung docs/recht/policen-whatsapp-gesundheitsdaten.md):
// Bitte und Einwilligung (Text, Grenzen von WhatsApp), Antworten, Widerruf ohne KI, Löschfrist 90 Tage, Freigabe
// Kranken/BU/Leben je Vermittler, Ablage (EU-Endpunkt, Schlüssel je Mandant, signierte Links) und „keine KI“.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  abschlussSchritt,
  dateiname,
  einladungFaellig,
  gesundheitFreigegeben,
  gesundheitInVertraegen,
  hatVertraege,
  istWiderruf,
  loeschDatum,
  mimeErlaubt,
  minderjaehrig,
  ohneBisherigePolicen,
  sparteAusText,
  typAusInhalt,
  AVV_POLICEN_VERSION,
  ERINNERUNG_OPTIN_TEXT,
  EINLADUNG_RE,
} from "@/lib/policen/regeln";
import {
  einwilligungsAntwort,
  einwilligungTextVersion,
  EINWILLIGUNG_RE,
  istPolicenEinwilligungsKnopf,
  lieberNichtText,
  NACHFRAGE_RE,
  nachEinwilligungText,
  policenBitte,
  policenNachfrage,
  policenNachrichten,
} from "@/lib/policen/bitte";
import { ablageKonfig, entschluessele, euEndpunkt, pruefeLink, signiereLink, verschluessele } from "@/lib/policen/ablage";
import { avvPolicenAbsaetze, speicherAngabe } from "@/lib/policen/avv-text";
import { datenschutzPolicenAbschnitte } from "@/lib/policen/datenschutz-text";
import { angabenOhneGesundheit, ohneGesundheitsangaben } from "@/lib/gesundheitsdaten";
import { bereitlegenListe } from "@/lib/whatsapp/gespraech";
import { downloadUrl } from "@/lib/policen/media";
import { decryptBytes, encryptBytes } from "@/lib/encryption";

const herr = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn", anrede: "Herr" as const, name: "Ole Kannapinn" };
const frau = { nom: "Frau Becker", dat: "Frau Becker", anrede: "Frau" as const, name: "Anna Becker" };
const ole = { nom: "Ole", dat: "Ole", name: "Ole Kannapinn" };
const LINK = "https://app.performancegrowth.de/datenschutz/policen?k=abcDEFghij0123456789xyzXYZ";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const GEDANKENSTRICH = /[–—]/;

describe("Bitte um Policen (Oles Text)", () => {
  it("Sie, Schalter Kranken/BU/Leben an: Wortlaut wie vorgegeben, ohne Fußzeile und ohne Knöpfe", () => {
    const b = policenBitte({ an: "sie", vermittler: herr, gesundheitAn: true });
    expect(b.text).toBe(
      "Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen hier in den Chat, egal ob Haftpflicht, Hausrat, Kfz, Kranken-, BU- oder Lebensversicherung. Dann sieht er vorher, wo Sie doppelt zahlen oder Lücken haben, und der Termin geht deutlich schneller.",
    );
    expect(b.knoepfe).toEqual([]);
    expect(b.fusszeile).toBeNull();
    expect(EINLADUNG_RE.test(b.text)).toBe(true);
  });

  it("Schalter aus: nur Haftpflicht, Hausrat oder Kfz, grammatisch sauber; Frau: „sieht sie“", () => {
    const b = policenBitte({ an: "sie", vermittler: frau, gesundheitAn: false });
    expect(b.text).toContain("egal ob Haftpflicht, Hausrat oder Kfz. Dann sieht sie vorher");
    expect(b.text).not.toMatch(/Kranken|BU|Leben/);
    expect(b.einwilligung.text).not.toMatch(/Gesundheitsangaben/);
  });

  it("Du: Vorname, Pronomen unbekannt ohne er/sie; Rückfall „Ihrem Berater“ wird Nominativ", () => {
    const du = policenBitte({ an: "du", vermittler: ole, gesundheitAn: false });
    expect(du.text).toBe(
      "Damit Ole deinen Termin gut vorbereiten kann: Schick bitte vorab Fotos oder PDFs deiner aktuellen Policen hier in den Chat, egal ob Haftpflicht, Hausrat oder Kfz. Dann ist vorher klar, wo du doppelt zahlst oder Lücken hast, und der Termin geht deutlich schneller.",
    );
    expect(du.text).not.toMatch(/\b(Sie|Ihr|Ihren)\b/);
    expect(policenBitte({ an: "sie", vermittler: { nom: "Ihrem Berater", dat: "Ihrem Berater" } }).text).toMatch(/^Damit Ihr Berater Ihren Termin/);
  });
});

describe("Einwilligung (Rechtsprüfung A1, Oles Freigabe)", () => {
  it("eigene interaktive Nachricht: Wortlaut mit Vor- und Nachname, Firma, Link, Gesundheitsteil nur bei Freigabe", () => {
    const b = policenBitte({ an: "sie", vermittler: herr, gesundheitAn: true, firma: "Kannapinn Versicherungen", datenschutzUrl: LINK });
    expect(b.einwilligung.text).toBe(
      `Kurz zum Datenschutz: Ich bin einverstanden, dass Ole Kannapinn (Kannapinn Versicherungen) meine hier gesendeten Policen zur Vorbereitung des Termins speichert und die Vertragsdaten automatisch auslesen lässt (KI-Dienst in der EU), auch wenn sie Gesundheitsangaben enthalten, z. B. bei Kranken-, BU- oder Lebensversicherung. Beteiligt sind WhatsApp (Meta, Zugriff auch aus den USA möglich) und der Dienstleister performancegrowth. Widerruf jederzeit mit „Widerruf“. Infos: ${LINK}`,
    );
    expect(b.einwilligung.fusszeile).toBe("Ihr Termin findet auch ohne Unterlagen statt.");
    expect(b.einwilligung.knoepfe.map((k) => k.title)).toEqual(["Einverstanden", "Lieber nicht"]);
    expect(policenNachrichten(b)).toHaveLength(2);
    expect(EINWILLIGUNG_RE.test(b.einwilligung.text)).toBe(true);
    const sach = policenBitte({ an: "sie", vermittler: herr, gesundheitAn: false, firma: "Ole Kannapinn", datenschutzUrl: LINK });
    expect(sach.einwilligung.text).toContain("dass Ole Kannapinn meine hier gesendeten Policen");
    expect(sach.einwilligung.text).toContain("(KI-Dienst in der EU). Beteiligt");
    expect(einwilligungTextVersion(true)).not.toBe(einwilligungTextVersion(false));
  });

  it("hält die WhatsApp-Grenzen ein (Text 1.024, Fußzeile 60, Knöpfe 20), auch als Nachfrage und mit langen Namen", () => {
    const lang = { nom: "Herr Mustermann-Schulze", dat: "Herrn Mustermann-Schulze", anrede: "Herr" as const, name: "Maximilian Alexander Mustermann-Schulze" };
    for (const an of ["sie", "du"] as const) {
      const o = { an, vermittler: lang, gesundheitAn: true, firma: "Mustermann-Schulze Versicherungsmakler GmbH & Co. KG", datenschutzUrl: LINK };
      const b = policenBitte(o);
      for (const n of [b.einwilligung, policenNachfrage(o)]) {
        expect(n.text.length).toBeLessThanOrEqual(1024);
        expect((n.fusszeile ?? "").length).toBeLessThanOrEqual(60);
        expect(n.knoepfe.length).toBeLessThanOrEqual(3);
        for (const k of n.knoepfe) expect(k.title.length).toBeLessThanOrEqual(20);
      }
      expect(b.text.length).toBeLessThanOrEqual(1024);
    }
    expect(NACHFRAGE_RE.test(policenNachfrage({ an: "sie", vermittler: herr }).text)).toBe(true);
    expect(EINWILLIGUNG_RE.test(policenNachfrage({ an: "du", vermittler: ole }).text)).toBe(true);
  });

  it("Texte ohne Gedankenstriche, Du ohne Sie", () => {
    for (const an of ["sie", "du"] as const) {
      const b = policenBitte({ an, vermittler: herr, gesundheitAn: true, firma: "X", datenschutzUrl: LINK });
      for (const t of [b.text, b.einwilligung.text, b.einwilligung.fusszeile ?? "", policenNachfrage({ an, vermittler: herr }).text, nachEinwilligungText(an), lieberNichtText(an)]) {
        expect(t).not.toMatch(GEDANKENSTRICH);
      }
    }
    expect(lieberNichtText("sie")).toBe("Kein Problem, Ihr Termin findet trotzdem statt. Bringen Sie Ihre Unterlagen dann einfach zum Termin mit.");
    expect(lieberNichtText("du")).not.toMatch(/\b(Sie|Ihr|Ihre)\b/);
    expect(policenBitte({ an: "du", vermittler: ole }).einwilligung.fusszeile).toBe("Dein Termin findet auch ohne Unterlagen statt.");
  });

  it("erkennt die Knöpfe (Payload und Titel), aber keinen freien Text", () => {
    expect(einwilligungsAntwort("policen:ja")).toBe("ja");
    expect(einwilligungsAntwort("Einverstanden")).toBe("ja");
    expect(einwilligungsAntwort("policen:nein")).toBe("nein");
    expect(einwilligungsAntwort("Lieber nicht")).toBe("nein");
    expect(einwilligungsAntwort("ja klar")).toBeNull();
    expect(istPolicenEinwilligungsKnopf("einverstanden")).toBe(true);
    expect(istPolicenEinwilligungsKnopf("Lieber nicht")).toBe(false);
  });
});

describe("Widerruf nur nach Regeln (keine KI)", () => {
  it("erkennt „Widerruf“, „löschen“ und Varianten", () => {
    for (const t of ["Widerruf", "widerrufen", "Löschen", "bitte löschen", "Bitte alles löschen", "löscht das bitte", "Unterlagen löschen", "Ich ziehe meine Einwilligung zurück", "bitte nicht mehr speichern, meine Unterlagen", "nicht mehr einverstanden"]) {
      expect(istWiderruf(t), t).toBe(true);
    }
  });
  it("nicht: Termin löschen, Vertrag widerrufen, Alltägliches", () => {
    for (const t of ["Termin löschen", "kann ich meinen alten Vertrag widerrufen?", "Ich habe nicht mehr Zeit", "ja", "Passt 10 Uhr?"]) {
      expect(istWiderruf(t), t).toBe(false);
    }
  });
});

describe("Löschfrist 90 Tage nach dem Termin", () => {
  const DAY = 24 * 60 * 60 * 1000;
  it("letzter Termin bzw. Eingang plus 90 Tage; behalten nie", () => {
    const eingang = new Date("2026-11-18T10:00:00Z");
    const termin = new Date("2026-11-25T10:00:00Z");
    expect(loeschDatum({ termine: [termin], eingang })?.toISOString()).toBe(new Date(termin.getTime() + 90 * DAY).toISOString());
    expect(loeschDatum({ termine: [], eingang })?.toISOString()).toBe(new Date(eingang.getTime() + 90 * DAY).toISOString());
    expect(loeschDatum({ termine: [termin], eingang, behalten: true })).toBeNull();
  });
  it("Abschluss: 14 Tage vorher erinnern, Löschung verschiebt sich nicht", () => {
    const datum = new Date("2027-03-01T00:00:00Z");
    expect(abschlussSchritt({ datum, erinnertAt: null, now: new Date("2027-01-01T00:00:00Z") }).aktion).toBe("warten");
    expect(abschlussSchritt({ datum, erinnertAt: null, now: new Date("2027-02-20T00:00:00Z") })).toEqual({ aktion: "erinnern", deleteAfter: datum });
    expect(abschlussSchritt({ datum, erinnertAt: new Date("2027-02-20T00:00:00Z"), now: new Date("2027-03-01T00:00:01Z") }).aktion).toBe("loeschen");
  });
});

describe("Freigabe Kranken/BU/Leben je Vermittler (A5)", () => {
  const url = "https://beispiel.de/datenschutz";
  it("nur mit AVV-Zustimmung in der aktuellen Version und Datenschutz-URL; intern/Test sofort; Notschalter", () => {
    expect(gesundheitFreigegeben(null, {})).toBe(false);
    expect(gesundheitFreigegeben({}, {})).toBe(false);
    expect(gesundheitFreigegeben({ policenAvvZugestimmtAt: new Date(), policenAvvVersion: AVV_POLICEN_VERSION }, {})).toBe(false);
    expect(gesundheitFreigegeben({ policenAvvZugestimmtAt: new Date(), policenAvvVersion: "alt", policenDatenschutzUrl: url }, {})).toBe(false);
    expect(gesundheitFreigegeben({ policenAvvZugestimmtAt: new Date(), policenAvvVersion: AVV_POLICEN_VERSION, policenDatenschutzUrl: "http://x.de" }, {})).toBe(false);
    expect(gesundheitFreigegeben({ policenAvvZugestimmtAt: new Date(), policenAvvVersion: AVV_POLICEN_VERSION, policenDatenschutzUrl: url }, {})).toBe(true);
    expect(gesundheitFreigegeben({ policenIntern: true }, {})).toBe(true);
    expect(gesundheitFreigegeben({ isTest: true }, {})).toBe(true);
    expect(gesundheitFreigegeben({ isTest: true }, { POLICEN_GESUNDHEIT_AUS: "1" })).toBe(false);
  });
  it("AVV-Ergänzung (b) mit gefüllten Platzhaltern, ohne Gedankenstriche", () => {
    const t = avvPolicenAbsaetze({ vermittler: "Ole Kannapinn, Kannapinn Versicherungen", speicher: speicherAngabe("https://abc123.eu.r2.cloudflarestorage.com") });
    const alles = t.map((x) => `${x.titel} ${x.text}`).join("\n");
    expect(alles).toContain("zwischen Ole Kannapinn, Kannapinn Versicherungen (Verantwortlicher)");
    expect(alles).toContain("EU-Jurisdiktion");
    expect(alles).not.toMatch(/\{|\}/);
    expect(alles).not.toMatch(GEDANKENSTRICH);
  });
});

describe("Ablage (A6)", () => {
  const key = Buffer.alloc(32, 9).toString("base64");
  const env = { POLICEN_S3_BUCKET: "pg-policen-eu", POLICEN_S3_ACCESS_KEY_ID: "a", POLICEN_S3_SECRET_ACCESS_KEY: "b", POLICEN_SCHLUESSEL: key };
  it("nur EU-Endpunkte (R2 mit EU-Jurisdiktion, S3 eu-*), sonst aus", () => {
    expect(euEndpunkt("https://abc123.eu.r2.cloudflarestorage.com")).toEqual({ ok: true, region: "auto" });
    expect(euEndpunkt("https://s3.eu-central-1.amazonaws.com")).toEqual({ ok: true, region: "eu-central-1" });
    expect(euEndpunkt("https://abc123.r2.cloudflarestorage.com").ok).toBe(false);
    expect(euEndpunkt("https://s3.us-east-1.amazonaws.com").ok).toBe(false);
    expect(euEndpunkt("http://abc.eu.r2.cloudflarestorage.com").ok).toBe(false);
    expect(ablageKonfig({ ...env, POLICEN_S3_ENDPOINT: "https://abc123.r2.cloudflarestorage.com" })).toBeNull();
    expect(ablageKonfig({ ...env, POLICEN_S3_ENDPOINT: "https://abc123.eu.r2.cloudflarestorage.com" })?.bucket).toBe("pg-policen-eu");
    expect(ablageKonfig({ ...env, POLICEN_S3_ENDPOINT: "https://abc123.eu.r2.cloudflarestorage.com", POLICEN_SCHLUESSEL: "kurz" })).toBeNull();
    expect(ablageKonfig({})).toBeNull();
  });
  it("verschlüsselt je Mandant: anderer Kunde oder anderer Objektname scheitert", () => {
    const master = Buffer.alloc(32, 5);
    const enc = verschluessele(master, "kunde-a", "policen/a/l/1", PDF);
    expect(enc.includes(Buffer.from(PDF))).toBe(false);
    expect(new Uint8Array(entschluessele(master, "kunde-a", "policen/a/l/1", enc))).toEqual(PDF);
    expect(() => entschluessele(master, "kunde-b", "policen/a/l/1", enc)).toThrow();
    expect(() => entschluessele(master, "kunde-a", "policen/a/l/2", enc)).toThrow();
  });
  it("signierte Links: 2 Minuten, nicht veränderbar", () => {
    process.env.AUTH_SECRET ||= "localtestsecret_localtestsecret_0123456789";
    const now = Date.now();
    const t = signiereLink({ leadId: "l", docId: "d", userId: "u", download: true }, now);
    expect(pruefeLink(t, now)).toMatchObject({ leadId: "l", docId: "d", userId: "u", download: true });
    expect(pruefeLink(t, now + 121_000)).toBeNull();
    const [body, sig] = t.split(".");
    const anders = Buffer.from(JSON.stringify({ leadId: "l", docId: "x", userId: "u", download: true, exp: Math.floor(now / 1000) + 120 })).toString("base64url");
    expect(pruefeLink(`${anders}.${sig}`, now)).toBeNull();
    expect(pruefeLink(`${body}.x`, now)).toBeNull();
  });
});

describe("Keine KI für Policen (Codeprüfung)", () => {
  it("lib/policen importiert keinen KI-Client und ruft keine KI auf", () => {
    const dir = join(process.cwd(), "src/lib/policen");
    const verboten = /@anthropic-ai|openai|ki-eu|bedrock|replicate|runAgent|lib\/ai\b|messages\.create|generativeai/i;
    // Ausnahme nur der Unterordner auslesen/ (Policen auslesen, Ole 18.11.2026): eigener Dokument-Zugang, nur mit
    // Einwilligung ki = true; KI-Clients dort nur in auslesen/anbieter (tests/unit/policen-auslesen-grenze.test.ts)
    for (const f of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)) {
      const code = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
      expect(code, f).not.toMatch(verboten);
    }
  });
});

describe("Datenschutzhinweise und Opt-in", () => {
  it("Langfassung: 90 Tage, Widerruf, Meta, KI nur mit Einwilligung, keine Gedankenstriche", () => {
    for (const an of ["sie", "du"] as const) {
      const t = datenschutzPolicenAbschnitte(an, { name: "Ole Kannapinn", firma: "Kannapinn Versicherungen", anschrift: "Berlin", telefon: "", email: "" }).map((x) => x.text).join("\n");
      expect(t).toContain("90 Tage");
      expect(t).toMatch(/Widerruf/);
      expect(t).toMatch(/Meta/);
      expect(t).not.toMatch(GEDANKENSTRICH);
    }
    expect(ERINNERUNG_OPTIN_TEXT).toContain("STOP");
    expect(ERINNERUNG_OPTIN_TEXT).not.toMatch(GEDANKENSTRICH);
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


describe("Ablauf im Assistenten", () => {
  it("lädt nach der Vertragsfrage einmal ein", () => {
    expect(hatVertraege({ vorhanden: "Haftpflicht bei HUK, Hausrat Allianz" })).toBe(true);
    expect(hatVertraege({ vorhanden: "keine" })).toBe(false);
    expect(hatVertraege({ vorhanden: "Keine Verträge" })).toBe(false);
    // Ole, 17.11.2026: „beides neu“ ist keine Liste vorhandener Verträge
    expect(hatVertraege({ vorhanden: "beides neu" })).toBe(false);
    expect(hatVertraege({ vorhanden: "Haftpflicht und Hausrat: beides neu" })).toBe(false);
    expect(hatVertraege({ vorhanden: "wäre alles neu" })).toBe(false);
    expect(hatVertraege({ vorhanden: "neu" })).toBe(false);
    expect(hatVertraege({ vorhanden: "noch nirgends versichert" })).toBe(false);
    expect(hatVertraege({ vorhanden: "Haftpflicht bei HUK, Hausrat wäre neu" })).toBe(true);
    expect(hatVertraege({ komplettcheck: "ja" })).toBe(true);
    expect(hatVertraege(null)).toBe(false);
    const q = { vorhanden: "Haftpflicht HUK" };
    expect(einladungFaellig({ qualificationData: q, outbound: ["Danke!"] })).toBe(true);
    expect(einladungFaellig({ qualificationData: q, outbound: [policenBitte({ an: "sie", vermittler: herr }).text] })).toBe(false);
  });

  it("Bereitlegen-Liste ohne bisherige Policen, wenn welche geschickt wurden", () => {
    const liste = bereitlegenListe("Privatschutz", ["hausrat", "wohngebaeude"], "sie", { komplettcheck: true });
    expect(liste.some((x) => /bestehenden Verträge und Policen/.test(x))).toBe(true);
    const ohne = ohneBisherigePolicen(liste, true);
    expect(ohne.some((x) => /Polic/.test(x))).toBe(false);
    expect(ohneBisherigePolicen(liste, false)).toEqual(liste);
    const du = ohneBisherigePolicen(bereitlegenListe("Privatschutz", ["haftpflicht"], "du", { komplettcheck: true }), true);
    expect(du.some((x) => /Polic/.test(x))).toBe(false);
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

