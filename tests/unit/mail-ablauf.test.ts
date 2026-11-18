// E-Mails in der Customer Journey (Paket M0/M1/M9): Voreinstellungen, Stufen, BCC-Empfänger, Sperren, Rahmen, mailto.
import { describe, expect, it } from "vitest";
import { ABLAUF_VORLAGEN, bccEmpfaenger, leseMailAblauf, mailAblaufJson, mitStufe, NUR_TIPP, STANDARD_STUFEN, voreinstellungen, WERBLICH } from "@/lib/mail/ablauf";
import { sperrGrund, statusGruppe, type SperrDaten } from "@/lib/mail/sperren";
import { ABMELDE_TEXT, mailRahmen, SIGNATUR_MARKE } from "@/lib/mail/rahmen";
import { MAILTO_HINWEIS, MAILTO_MAX, mailtoHref, mailtoLink, ohneSignatur } from "@/lib/mail/mailto";
import { kopieInhalt } from "@/lib/mail/lead-versand";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Voreinstellungen (Customer.mailAblauf)", () => {
  it("null: Stufen laut Plan, BCC aus, nicht bestätigt", () => {
    const a = leseMailAblauf(null);
    expect(a.stufen).toEqual(STANDARD_STUFEN);
    expect(a.bcc).toEqual({ an: false, adresse: null });
    expect(a.bestaetigtAt).toBeNull();
    for (const k of ["termin_vorbereitung", "nicht_erreicht", "nicht_erschienen", "wie_besprochen", "nachfassen_angebot"] as const) expect(a.stufen[k]).toBe("auto");
    for (const k of ["angebot", "beratungsdoku", "unterlagen_fehlen", "nach_abschluss", "willkommen", "tuer_offen", "kuendigung"] as const) expect(a.stufen[k]).toBe("tipp");
    expect(ABLAUF_VORLAGEN).toHaveLength(12);
  });

  it("ungültige Werte fallen auf die Voreinstellung, Angebot nie automatisch", () => {
    const a = leseMailAblauf({ stufen: { nicht_erreicht: "aus", angebot: "auto", willkommen: "quatsch" }, bcc: { an: true, adresse: "kein-mail" }, bestaetigtAt: "nein" });
    expect(a.stufen.nicht_erreicht).toBe("aus");
    expect(a.stufen.angebot).toBe("tipp");
    expect(a.stufen.willkommen).toBe("tipp");
    expect(a.bcc).toEqual({ an: true, adresse: null });
    expect(a.bestaetigtAt).toBeNull();
    expect(NUR_TIPP.has("kuendigung")).toBe(true);
    expect(mitStufe(a, "beratungsdoku", "auto").stufen.beratungsdoku).toBe("tipp");
    expect(mitStufe(a, "tuer_offen", "aus").stufen.tuer_offen).toBe("aus");
  });

  it("„Ja, Mails in meinem Namen senden“: Voreinstellungen, Kopie an, bestätigt; JSON rund", () => {
    const now = new Date("2026-11-17T20:00:00Z");
    const v = voreinstellungen(now);
    expect(v.bcc).toEqual({ an: true, adresse: null });
    expect(v.bestaetigtAt).toBe(now.toISOString());
    expect(leseMailAblauf(JSON.parse(JSON.stringify(mailAblaufJson(v))))).toEqual(v);
  });

  it("BCC-Empfänger: aus, eigene, gewählte, ungültig, nicht an den Lead selbst", () => {
    const aus = leseMailAblauf(null);
    expect(bccEmpfaenger(aus, "ole@kannapinn.test")).toBeNull();
    const an = voreinstellungen();
    expect(bccEmpfaenger(an, "Ole@Kannapinn.test")).toBe("ole@kannapinn.test");
    expect(bccEmpfaenger({ ...an, bcc: { an: true, adresse: "buero@kannapinn.test" } }, "ole@kannapinn.test")).toBe("buero@kannapinn.test");
    expect(bccEmpfaenger(an, null)).toBeNull();
    expect(bccEmpfaenger(an, "ole@kannapinn.test", "OLE@kannapinn.test")).toBeNull();
  });
});

describe("Zentrale Sperren", () => {
  const ok: SperrDaten = { geloescht: false, ruhend: false, mailAus: false, adresse: "julia@example.org", abgemeldet: false, status: "Neuer Lead", antwort: false };
  const auto = { vorlage: "nicht_erreicht" as const, automatisch: true, stufe: "auto" as const };

  it("frei, wenn nichts dagegen spricht", () => {
    expect(sperrGrund(ok, auto)).toBeNull();
    expect(sperrGrund(ok, { vorlage: null, automatisch: false })).toBeNull();
  });

  it("immer: gelöscht, ruhend, E-Mail-Funktionen aus, keine Adresse (in dieser Reihenfolge)", () => {
    expect(sperrGrund({ ...ok, geloescht: true, ruhend: true }, auto)).toBe("geloescht");
    expect(sperrGrund({ ...ok, ruhend: true }, { vorlage: null, automatisch: false })).toBe("ruhend");
    expect(sperrGrund({ ...ok, mailAus: true }, { vorlage: null, automatisch: false })).toBe("mail_aus");
    expect(sperrGrund({ ...ok, adresse: "keine" }, auto)).toBe("keine_adresse");
    expect(sperrGrund({ ...ok, adresse: null }, auto)).toBe("keine_adresse");
  });

  it("Abmeldung: sperrt automatische und werbliche, nicht die persönliche Mail von Hand", () => {
    const ab = { ...ok, abgemeldet: true };
    expect(sperrGrund(ab, auto)).toBe("abgemeldet");
    expect(sperrGrund(ab, { vorlage: "nachfassen_angebot", automatisch: false })).toBe("abgemeldet");
    expect(sperrGrund(ab, { vorlage: "tuer_offen", automatisch: false })).toBe("abgemeldet");
    expect(sperrGrund(ab, { vorlage: "willkommen", automatisch: false })).toBeNull();
    expect(sperrGrund(ab, { vorlage: null, automatisch: false })).toBeNull();
    expect([...WERBLICH].sort()).toEqual(["nachfassen_angebot", "nicht_erschienen", "tuer_offen"]);
  });

  it("nur automatisch: Stufe, Stopp-Regeln (Abschluss, Absage), Antwort; Pflicht-Mails ausgenommen", () => {
    expect(sperrGrund(ok, { ...auto, stufe: "tipp" })).toBe("stufe");
    expect(sperrGrund(ok, { ...auto, stufe: "aus" })).toBe("stufe");
    expect(sperrGrund({ ...ok, status: "Abschluss" }, auto)).toBe("status");
    expect(sperrGrund({ ...ok, status: "Abschluss" }, { vorlage: "willkommen", automatisch: true, stufe: "auto" })).toBeNull();
    expect(sperrGrund({ ...ok, status: "Kein Interesse" }, auto)).toBe("status");
    expect(sperrGrund({ ...ok, status: "Kein Interesse" }, { vorlage: "tuer_offen", automatisch: true, stufe: "auto" })).toBeNull();
    expect(sperrGrund(ok, { vorlage: "willkommen", automatisch: true, stufe: "auto" })).toBe("status");
    expect(sperrGrund({ ...ok, antwort: true }, auto)).toBe("antwort");
    expect(sperrGrund({ ...ok, status: "Abschluss", antwort: true }, { ...auto, stufe: "aus", pflicht: true })).toBeNull();
    // von Hand gelten Stufe und Status nicht
    expect(sperrGrund({ ...ok, status: "Abschluss" }, { vorlage: "nicht_erreicht", automatisch: false })).toBeNull();
    expect(statusGruppe("Storno")).toBe("verloren");
    expect(statusGruppe("abschluss")).toBe("abschluss");
    expect(statusGruppe(null)).toBe("offen");
  });
});

describe("Rahmen der Vorlagen-Mails", () => {
  const sig = { text: "Viele Grüße\nOle Kannapinn\nKannapinn Versicherungen", html: "<p>Viele Grüße<br><strong>Ole Kannapinn</strong></p>" };

  it("Signatur an der Stelle der Marke, Knöpfe davor, ohne Abmeldelink", () => {
    const r = mailRahmen({ text: `Guten Tag Frau Schneider,\n\nich melde mich.\n\n${SIGNATUR_MARKE}`, signatur: sig, knoepfe: [{ label: "Termin wählen", url: "https://app.test/b/x" }] });
    expect(r.text).toBe("Guten Tag Frau Schneider,\n\nich melde mich.\n\nTermin wählen: https://app.test/b/x\n\nViele Grüße\nOle Kannapinn\nKannapinn Versicherungen");
    expect(r.html).toContain("<strong>Ole Kannapinn</strong>");
    expect(r.html.indexOf("Termin wählen")).toBeLessThan(r.html.indexOf("Ole Kannapinn"));
    expect(r.text).not.toContain(ABMELDE_TEXT);
    expect(r.html).not.toContain("\u0000");
  });

  it("werblich: Abmeldelink unter der Signatur; Text ohne Marke bekommt die Signatur ans Ende; Werte maskiert", () => {
    const r = mailRahmen({ text: "Hallo <Anna>, kurze Frage.", signatur: sig, abmeldeUrl: "https://app.test/abmelden/lx.y" });
    expect(r.text.endsWith(`${ABMELDE_TEXT} https://app.test/abmelden/lx.y`)).toBe(true);
    expect(r.text.indexOf("Ole Kannapinn")).toBeLessThan(r.text.indexOf(ABMELDE_TEXT));
    expect(r.html).toContain("&lt;Anna&gt;");
    expect(r.html).toContain('href="https://app.test/abmelden/lx.y"');
    expect(hatGedankenstrich(r.text)).toBe(false);
  });

  it("Kopie für den Vermittler: Betreff mit „Kopie:“, Hinweis auf den Empfänger", () => {
    const k = kopieInhalt({ lead: "julia@example.org", subject: "Kurz zu Ihrer Anfrage", text: "Hallo", html: "<p>Hallo</p>" });
    expect(k.subject).toBe("Kopie: Kurz zu Ihrer Anfrage");
    expect(k.text.startsWith("Kopie Ihrer E-Mail an julia@example.org\n\nHallo")).toBe(true);
    expect(k.html).toContain("julia@example.org");
  });
});

describe("mailto (Im eigenen Mailprogramm öffnen)", () => {
  it("kodiert mit encodeURIComponent, Umbrüche als %0D%0A, Adresse lesbar", () => {
    const href = mailtoHref({ to: "julia@example.org", subject: "Frau Schneider, kurz & knapp?", body: "Guten Tag,\n\nÄrger = 0%\r\nGruß" });
    expect(href.startsWith("mailto:julia@example.org?subject=")).toBe(true);
    expect(href).toContain("subject=Frau%20Schneider%2C%20kurz%20%26%20knapp%3F");
    expect(href).toContain("body=Guten%20Tag%2C%0D%0A%0D%0A%C3%84rger%20%3D%200%25%0D%0AGru%C3%9F");
    expect(href).not.toMatch(/%0A(?<!%0D%0A)/);
    expect(decodeURIComponent(href.split("body=")[1])).toBe("Guten Tag,\r\n\r\nÄrger = 0%\r\nGruß");
  });

  it("bis ca. 1.800 Zeichen voller Text, darüber Hinweis statt Text (Text in die Zwischenablage)", () => {
    const kurz = mailtoLink({ to: "a@b.de", subject: "Betreff", body: "x".repeat(1500) });
    expect(kurz.gekuerzt).toBe(false);
    expect(kurz.href.length).toBeLessThanOrEqual(MAILTO_MAX);
    const lang = mailtoLink({ to: "a@b.de", subject: "Betreff", body: "ü".repeat(400) });
    expect(lang.gekuerzt).toBe(true);
    expect(decodeURIComponent(lang.href.split("body=")[1])).toBe(MAILTO_HINWEIS);
    expect(lang.href.length).toBeLessThanOrEqual(MAILTO_MAX);
  });

  it("Signatur entfällt, der Gruß bleibt", () => {
    const sig = "Viele Grüße\nOle Kannapinn\nTelefon: 089 123456";
    expect(ohneSignatur(`Guten Tag,\n\nich melde mich.\n\n${sig}`, sig)).toBe("Guten Tag,\n\nich melde mich.\n\nViele Grüße");
    expect(ohneSignatur("Nur Text\n", sig)).toBe("Nur Text");
    expect(ohneSignatur("Text\n\nOle", "")).toBe("Text\n\nOle");
  });
});
