// M3 (Ole, 18.11.2026): Termin-Mails mit Vorbereitung. Bestätigung bzw. Einladung und Vortags-Mail bekommen die
// Bereitlegen-Liste aus bereitlegenListe (eine Quelle mit dem WhatsApp-Schluss und {termin_unterlagen}), den
// Komplettcheck-Satz nur bei „Ja“ und den kurzen Browser-Hinweis; nie eine Termindauer in Minuten.
import { describe, expect, it } from "vitest";
import { BROWSER_HINWEIS, content, leadEmailBody, vorbereitungBlock, type LeadEmailKind, type Vorbereitung } from "@/lib/calendar/lead-email";
import type { CustomerEvent } from "@/lib/calendar/add-to-calendar";
import { leadSignatur } from "@/lib/mail/lead-absender";
import { terminUnterlagen } from "@/lib/mail/platzhalter";
import { STANDARD_VORLAGEN_JE } from "@/lib/mail/vorlagen";
import { AUSLOESER_AKTIV } from "@/lib/mail/ablauf";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import {
  abschlussText,
  bereitlegenFuerLead,
  bereitlegenListe,
  buchungsText,
  KOMPLETTCHECK_TEXT,
  komplettcheckMailSatz,
  vermittlerName,
} from "@/lib/whatsapp/gespraech";
import { spartenDesLeads } from "@/lib/preise/rechner-angaben";

const HERR = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const DU = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const DATEN = { name: "Ole Kannapinn", agentur: "Kannapinn Versicherungen", anschrift: "Hauptstraße 1\n80331 München", telefon: "089 123456", erstinfoUrl: null };
const FAMILIE = [{ label: "Lebenssituation", value: "Familie mit Kindern" }];
const START = new Date("2026-11-20T10:00:00Z");

function ev(extra: Partial<CustomerEvent> = {}): CustomerEvent {
  return {
    uid: "x@termin",
    start: START,
    end: new Date(START.getTime() + 45 * 60_000),
    summary: "Beratung",
    description: "",
    location: "",
    manageUrl: "https://www.dein-beratungstermin.de/book/manage/tok1",
    token: "tok1",
    advisorName: "Ole Kannapinn",
    mode: "video",
    videoUrl: "https://meet.example/abc",
    ...extra,
  };
}

const vb = (komplettcheck: boolean, an: "sie" | "du" = "sie", familie = false): Vorbereitung => ({
  bereitlegen: bereitlegenFuerLead({ source: "Privatschutz", formular: familie ? FAMILIE : [], an, komplettcheck }),
  komplettcheck,
  familie,
});

/** Zahl plus Minuten (Termindauer), z. B. „45 Min.“, „30 Minuten“, „60min“. */
const MINUTEN_RE = /\d+\s*(min\b|min\.|minuten)/i;

describe("Bereitlegen: eine Quelle", () => {
  it("bereitlegenFuerLead = bereitlegenListe mit den Sparten des Leads; {termin_unterlagen} formatiert dieselbe Liste", () => {
    const quelle = { formular: FAMILIE, angaben: null };
    const liste = bereitlegenListe("Privatschutz", spartenDesLeads("Privatschutz", quelle), "sie", { quelle, komplettcheck: true });
    expect(bereitlegenFuerLead({ source: "Privatschutz", formular: FAMILIE, an: "sie", komplettcheck: true })).toEqual(liste);
    expect(terminUnterlagen(liste).split("\n")).toEqual(liste.map((x) => `• ${x.charAt(0).toUpperCase()}${x.slice(1)}`));
  });

  it("Vorlage „Termin: Vorbereitung“ läuft automatisch (Auslöser aktiv)", () => {
    expect(AUSLOESER_AKTIV.has("termin_vorbereitung")).toBe(true);
  });
});

describe("Bestätigung bzw. Einladung mit Vorbereitung", () => {
  it("Sie, Komplettcheck Ja: Satz ohne Dauer, Liste mit Verträgen und IBAN, Browser-Hinweis kurz", () => {
    const c = content("booked", ev(), { fullName: "Julia Schneider", salutation: "Frau" }, "sie", { person: HERR, vorbereitung: vb(true) });
    const b = leadEmailBody(c, ev(), leadSignatur(DATEN));
    expect(b.text).toContain(BROWSER_HINWEIS);
    expect(b.text).toContain("Wie gewünscht schaut Herr Kannapinn im Termin auch, ob Sie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können.");
    expect(b.text).toContain("Legen Sie sich zum Termin bitte bereit:\n• Ihre bestehenden Verträge und Policen");
    expect(b.text).toContain("• Ihre IBAN, falls Sie direkt abschließen möchten");
    expect(b.html).toContain("<ul");
    expect(b.html).toContain("<li style=\"margin:0 0 4px\">Ihre bestehenden Verträge und Policen</li>");
    // Reihenfolge: Link, Vorbereitung, Kalender
    expect(b.text.indexOf("Videocall")).toBeLessThan(b.text.indexOf("Legen Sie sich"));
    expect(b.text.indexOf("Legen Sie sich")).toBeLessThan(b.text.indexOf("Zum Kalender hinzufügen"));
  });

  it("Komplettcheck Nein: kein Komplettcheck-Satz, keine Verträge in der Liste", () => {
    const c = content("booked", ev(), "Julia Schneider", "sie", { person: HERR, vorbereitung: vb(false) });
    const t = leadEmailBody(c, ev(), leadSignatur(DATEN)).text;
    expect(t).not.toContain("Wie gewünscht");
    expect(t).not.toContain("Verträge");
    expect(t).toContain("Legen Sie sich zum Termin bitte bereit:");
  });

  it("Du und Familie", () => {
    const c = content("booked", ev(), { firstName: "Julia", lastName: "Schneider" }, "du", { person: DU, vorbereitung: vb(true, "du", true) });
    const t = leadEmailBody(c, ev(), leadSignatur(DATEN)).text;
    expect(t).toContain("Wie gewünscht schaut Ole im Termin auch, ob du und deine Familie insgesamt gut abgesichert seid und wo ihr vielleicht etwas sparen könnt.");
    expect(t).toContain("Leg dir zum Termin bitte bereit:");
    expect(t).toContain("• Die Geburtsdaten aller Personen, die mitversichert werden sollen");
  });

  it("Ohne Vorbereitung (Vorlage aus bzw. ein Tipp): Bestätigung bleibt, ohne Vorbereitungsteil", () => {
    const c = content("booked", ev(), "Julia Schneider", "sie", { person: HERR, vorbereitung: null });
    const t = leadEmailBody(c, ev(), leadSignatur(DATEN)).text;
    expect(t).toContain("ist gebucht");
    expect(t).not.toContain("bereit:");
    expect(c.vorbereitung).toBeNull();
  });

  it("Vortags-Mail mit Vorbereitung, Absage und Verschiebung ohne", () => {
    expect(content("reminder", ev(), "Julia Schneider", "sie", { person: HERR, now: new Date("2026-11-19T10:00:00Z"), vorbereitung: vb(true) }).vorbereitung).not.toBeNull();
    for (const k of ["rescheduled", "cancelled", "updated"] as const) expect(content(k, ev(), "Julia Schneider", "sie", { person: HERR, vorbereitung: vb(true) }).vorbereitung).toBeNull();
  });

  it("Erstinformation steht nach der Vorbereitung", () => {
    const c = content("booked", ev(), "Julia Schneider", "sie", { person: HERR, erstinfoUrl: "https://x.example/e", vorbereitung: vb(false) });
    const t = leadEmailBody(c, ev(), leadSignatur(DATEN)).text;
    expect(t.indexOf("bereit:")).toBeLessThan(t.indexOf("Erstinformation"));
  });

  it("Leere Liste ohne Komplettcheck: kein Block", () => {
    expect(vorbereitungBlock({ bereitlegen: [], komplettcheck: false, familie: false }, "sie", HERR)).toBeNull();
  });
});

describe("Keine Termindauer in Minuten in Lead-Texten (Ole, 17.11.2026)", () => {
  it("Termin-Mails aller Arten, Ansprachen, mit und ohne Komplettcheck", () => {
    const kinds: LeadEmailKind[] = ["booked", "rescheduled", "cancelled", "reminder", "updated"];
    for (const kind of kinds)
      for (const an of ["sie", "du"] as const)
        for (const k of [true, false])
          for (const familie of [true, false])
            for (const mode of ["video", "phone"] as const) {
              const e = ev({ mode, videoUrl: mode === "video" ? "https://meet.example/abc" : null });
              const c = content(kind, e, "Julia Schneider", an, { person: an === "du" ? DU : HERR, now: new Date("2026-11-19T10:00:00Z"), vorbereitung: vb(k, an, familie) });
              const b = leadEmailBody(c, e, leadSignatur(DATEN));
              expect(`${c.subject}\n${b.text}`).not.toMatch(MINUTEN_RE);
              expect(hatGedankenstrich(b.text)).toBe(false);
            }
  });

  it("WhatsApp: Buchung, Komplettcheck-Frage, Schluss; Komplettcheck-Satz der Mail", () => {
    for (const an of ["sie", "du"] as const) {
      const person = an === "du" ? DU : HERR;
      for (const mode of ["video", "phone"] as const) {
        const t = buchungsText({ an, start: START, mode, meetUrl: mode === "video" ? "https://meet.example/abc" : null, person });
        expect(t).not.toMatch(MINUTEN_RE);
        // Browser-Hinweis nicht in der WhatsApp-Bestätigung (Ole, 17.11.2026)
        expect(t).not.toMatch(/Browser|ohne App/);
      }
      for (const familie of [true, false]) {
        expect(komplettcheckMailSatz(an, person, familie)).not.toMatch(MINUTEN_RE);
        const liste = vb(true, an, familie).bereitlegen;
        expect(abschlussText({ an, person, bereitlegen: liste, email: "a@b.de", nachFragen: true })).not.toMatch(MINUTEN_RE);
      }
    }
    for (const t of Object.values(KOMPLETTCHECK_TEXT)) expect(t).not.toMatch(MINUTEN_RE);
  });

  it("Mail-Vorlagen (Standardfassungen) ohne Minutenangabe", () => {
    for (const an of ["sie", "du"] as const) for (const v of STANDARD_VORLAGEN_JE[an]) expect(`${v.subject}\n${v.body}`).not.toMatch(MINUTEN_RE);
  });
});
