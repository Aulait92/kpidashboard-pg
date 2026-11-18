// E-Mail-Vorlagen, Pakete M4 und M6 (Ole, 18.11.2026): reine Regeln ohne Datenbank.
import { describe, expect, it } from "vitest";
import { sperrGrund, type SperrDaten } from "@/lib/mail/sperren";
import { AUSLOESER_AKTIV, STANDARD_STUFEN } from "@/lib/mail/ablauf";
import { rueckrufZeitenAusPlan, zeitImSatz } from "@/lib/call-plan";
import { nichtErreichtHinweis } from "@/lib/call-attempts";
import { BEGLEIT_KINDS, SEQUENCES, istBegleitAbfolge } from "@/lib/lead-sequences";
import { zuErsetzendeVertraege } from "@/lib/whatsapp/vorvertraege";
import { KUENDIGUNG_TODO, NACH_ABSCHLUSS_TODOS, kuendigungNote, versichererAusKuendigung } from "@/lib/vertraege-shared";
import { STANDARD_VORLAGEN_JE, VORLAGEN_STAND, neueFassungen } from "@/lib/mail/vorlagen";
import { STANDARD_VORLAGEN_STAND3 } from "@/lib/mail/vorlagen-alt";
import { fuelle, werteFuer } from "@/lib/mail/platzhalter";
import { ersterSatz } from "@/lib/mail/ein-tipp";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const frei: SperrDaten = { geloescht: false, ruhend: false, mailAus: false, adresse: "julia@example.org", abgemeldet: false, status: "Abschluss", antwort: false };
// Dienstag, 17.11.2026, 10:00 Uhr Berlin
const T0 = new Date("2026-11-17T09:00:00Z");
const H = 60 * 60 * 1000;

describe("Auslöser und Stufen", () => {
  it("M4-Auslöser laufen (Einstellungen zeigen „automatisch“ ohne „bald verfügbar“)", () => {
    expect([...AUSLOESER_AKTIV].sort()).toEqual(["nachfassen_angebot", "nicht_erreicht", "nicht_erschienen", "termin_vorbereitung", "wie_besprochen"]);
    for (const k of AUSLOESER_AKTIV) expect(STANDARD_STUFEN[k]).toBe("auto");
  });

  it("vom Vermittler angestoßen (Erinnerung „Unterlagen fehlen“): „ein Tipp“ genügt, „aus“ sperrt; sonst nur „automatisch“", () => {
    expect(sperrGrund(frei, { vorlage: "unterlagen_fehlen", automatisch: true, stufe: "tipp" })).toBe("stufe");
    expect(sperrGrund(frei, { vorlage: "unterlagen_fehlen", automatisch: true, stufe: "tipp", freigegeben: true })).toBeNull();
    expect(sperrGrund(frei, { vorlage: "unterlagen_fehlen", automatisch: true, stufe: "aus", freigegeben: true })).toBe("stufe");
    // Abmeldung bzw. Antwort sperren auch dann
    expect(sperrGrund({ ...frei, abgemeldet: true }, { vorlage: "unterlagen_fehlen", automatisch: true, stufe: "tipp", freigegeben: true })).toBe("abgemeldet");
    expect(sperrGrund({ ...frei, antwort: true }, { vorlage: "unterlagen_fehlen", automatisch: true, stufe: "tipp", freigegeben: true })).toBe("antwort");
    // Tür offen von Hand nach STOPP bzw. Abmeldung: gesperrt (werblich)
    expect(sperrGrund({ ...frei, abgemeldet: true, status: "Kein Interesse" }, { vorlage: "tuer_offen", automatisch: false })).toBe("abgemeldet");
  });
});

describe("Nicht erreicht: Rückrufzeiten aus dem Anrufplan", () => {
  it("Zeit im Satz: heute, morgen, Wochentag; volle Stunde ohne Minuten", () => {
    expect(zeitImSatz(new Date("2026-11-17T17:30:00Z"), T0)).toBe("heute um 18:30 Uhr");
    expect(zeitImSatz(new Date("2026-11-18T09:00:00Z"), T0)).toBe("morgen um 10 Uhr");
    expect(zeitImSatz(new Date("2026-11-20T14:00:00Z"), T0)).toBe("am Freitag um 15 Uhr");
  });

  it("geplanter Versuch und der danach; ohne Plan bzw. nach dem letzten Versuch null", () => {
    const plan = { followUpAt: new Date("2026-11-17T17:30:00Z"), followUpNote: "Anrufversuch 3 von 6", callAttempts: 2, callPlanStartedAt: T0, lastCallAttemptAt: new Date(T0.getTime() + 2 * H) };
    expect(rueckrufZeitenAusPlan(plan, new Date(T0.getTime() + 2 * H))).toEqual(["heute um 18:30 Uhr", "morgen um 10 Uhr"]);
    expect(rueckrufZeitenAusPlan({ ...plan, followUpNote: "Angebot nachfassen" }, T0)).toBeNull();
    expect(rueckrufZeitenAusPlan({ ...plan, followUpNote: "Anrufversuch 6 von 6", callAttempts: 5 }, T0)).toBeNull();
  });

  it("Hinweis im Fenster nach dem Anruf statt eines Angebots von Hand", () => {
    const at = new Date(T0.getTime() + 3 * H);
    expect(nichtErreichtHinweis({ geplant: { at, sofort: false }, gesendetAt: null, automatisch: true }, 2)).toEqual({ status: "geplant", at: at.toISOString(), sofort: false });
    expect(nichtErreichtHinweis({ geplant: null, gesendetAt: at, automatisch: true }, 3)).toEqual({ status: "gesendet", at: at.toISOString() });
    expect(nichtErreichtHinweis({ geplant: null, gesendetAt: null, automatisch: true }, 1)).toEqual({ status: "nach_versuch_2" });
    // nicht automatisch (Stufe „ein Tipp“, gesperrt) bzw. nach dem 2. Versuch ohne Mail: von Hand
    expect(nichtErreichtHinweis({ geplant: null, gesendetAt: null, automatisch: false }, 1)).toBeNull();
    expect(nichtErreichtHinweis({ geplant: null, gesendetAt: null, automatisch: true }, 3)).toBeNull();
  });
});

describe("Abfolgen mit Mail-Schritten", () => {
  it("No-Show: WhatsApp, 2 Std. später die Mail, am nächsten Tag WhatsApp", () => {
    expect(SEQUENCES.no_show.steps.map((s) => [s.day, s.action])).toEqual([
      [0, "whatsapp"],
      [2 / 24, "email"],
      [1, "whatsapp"],
    ]);
    const mail = SEQUENCES.no_show.steps[1];
    expect(mail.action === "email" && mail.vorlage).toBe("nicht_erschienen");
  });

  it("Begleit-Abfolgen: Mail „Nicht erreicht“ und Erinnerung „Unterlagen fehlen“ mit Aufgabe danach", () => {
    expect(BEGLEIT_KINDS).toEqual(["nicht_erreicht_mail", "unterlagen"]);
    expect(istBegleitAbfolge("unterlagen")).toBe(true);
    expect(istBegleitAbfolge("offer")).toBe(false);
    expect(SEQUENCES.nicht_erreicht_mail.steps).toMatchObject([{ day: 0, action: "email", vorlage: "nicht_erreicht" }]);
    expect(SEQUENCES.unterlagen.steps).toMatchObject([
      { day: 3, action: "email", vorlage: "unterlagen_fehlen" },
      { day: 5, action: "call", note: "Unterlagen nachfassen", aufgabe: "unterlagen_fehlen" },
    ]);
  });
});

describe("Kündigung: Abgleich mit dem Komplettcheck", () => {
  const v = { at: "", liste: [{ sparte: "Haftpflicht" as const, gesellschaft: "HUK-Coburg" }, { sparte: "Kfz" as const, gesellschaft: "Allianz" }, { sparte: "Tierkranken" as const }] };
  it("gleiche Sparte wie das Produkt des Abschlusses (auch Privatschutz und TKV)", () => {
    expect(zuErsetzendeVertraege(v, ["Privatschutz"])).toEqual([v.liste[0]]);
    expect(zuErsetzendeVertraege(v, ["Privathaftpflicht"])).toEqual([v.liste[0]]);
    expect(zuErsetzendeVertraege(v, ["tkv", null])).toEqual([v.liste[2]]);
    expect(zuErsetzendeVertraege(v, ["Autoversicherung"])).toEqual([v.liste[1]]);
    expect(zuErsetzendeVertraege(v, ["Zahnzusatzversicherung"])).toEqual([]);
    expect(zuErsetzendeVertraege(null, ["Privatschutz"])).toEqual([]);
  });
  it("Text der Aufgabe, Versicherer daraus, auf „Heute“ auch im Abschluss", () => {
    expect(kuendigungNote("Haftpflicht", "HUK-Coburg")).toBe("Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg");
    expect(kuendigungNote("Kfz", null)).toBe("Alten Vertrag kündigen: Kfz");
    expect(versichererAusKuendigung("Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg")).toBe("HUK-Coburg");
    expect(versichererAusKuendigung("Alten Vertrag kündigen: Kfz")).toBeNull();
    expect(NACH_ABSCHLUSS_TODOS).toContain(KUENDIGUNG_TODO);
    expect(NACH_ABSCHLUSS_TODOS).toContain("Unterlagen nachfassen");
  });
});

describe("Texte Stand 4", () => {
  const tpl = (an: "sie" | "du", key: string) => STANDARD_VORLAGEN_JE[an].find((v) => v.key === key)!;
  it("„Nach dem Abschluss“ zeitneutral, „Wie besprochen“ passt für den Tag selbst und aus dem Dialog", () => {
    expect(VORLAGEN_STAND).toBe(4);
    for (const an of ["sie", "du"] as const) {
      expect(tpl(an, "nach_abschluss").body).not.toMatch(/in Kürze|\bbald\b|demnächst/);
      expect(hatGedankenstrich(tpl(an, "nach_abschluss").body + tpl(an, "wie_besprochen").body)).toBe(false);
    }
    const w = { ...werteFuer({ name: "Julia Schneider", source: "Zahnzusatzversicherung", salutation: "Frau" }, "Ole Kannapinn", { ansprache: "sie" }), signatur: "" };
    expect(fuelle(tpl("sie", "wie_besprochen").body, { ...w, melde_wann: "heute" })).toContain("wie besprochen melde ich mich heute bei Ihnen zu Ihrer Zahnzusatzversicherung.");
    expect(fuelle(tpl("sie", "wie_besprochen").body, { ...w, melde_wann: "am Donnerstag, 26. November" })).toContain("melde ich mich am Donnerstag, 26. November bei Ihnen");
    expect(fuelle(tpl("du", "wie_besprochen").subject, { ...w, betreff_name: "" })).toBe("Ich melde mich wie besprochen");
  });
  it("unveränderte Stand-3-Fassungen werden gehoben, geänderte bleiben", () => {
    const alt = STANDARD_VORLAGEN_STAND3.sie.find((v) => v.key === "nach_abschluss")!;
    const du = STANDARD_VORLAGEN_STAND3.du.find((v) => v.key === "wie_besprochen")!;
    const r = neueFassungen([
      { id: "a", subject: alt.subject, body: alt.body, standardKey: "nach_abschluss" },
      { id: "b", subject: du.subject, body: du.body, standardKey: "wie_besprochen" },
      { id: "c", subject: alt.subject, body: `${alt.body} Eigener Satz.`, standardKey: "nach_abschluss" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r[0].body).toBe(tpl("sie", "nach_abschluss").body);
    expect(r[1].body).toBe(tpl("du", "wie_besprochen").body);
  });
  it("Vorschau unter dem Haken: erster Satz nach der Anrede", () => {
    expect(ersterSatz("Guten Tag Frau Schneider,\n\nvielen Dank für Ihr Vertrauen. Ich kümmere mich.\n\nViele Grüße")).toBe("Vielen Dank für Ihr Vertrauen.");
  });
});
