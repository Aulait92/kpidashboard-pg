// Antwortadresse mit Eingang (Paket M2): reine Teile. Adresse und Leadcode, Zerlegen, Schalter, automatische Antworten,
// SPF/DKIM/DMARC, Schleifenschutz, Anhangfilter, Weiterleitungstext (ohne Gedankenstriche), Zitat kürzen.
import { describe, expect, it } from "vitest";
import { antwortAdresse, antwortEingangAn, kurzname, leadCode, parseAntwortAdresse, reineAdresse } from "@/lib/mail/antwort-adresse";
import { anhaengeWaehlen, anhangErlaubt, authFehler, autoAntwortGrund, betreffKern, htmlZuText, istSchleife, ohneZitat, weiterleitungInhalt } from "@/lib/mail/eingang";
import { vermittlerAdresse } from "@/lib/mail/lead-versand";
import { mailVerlaufText, eingangAnhaenge } from "@/lib/mail/kontakt-mail";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Antwortadresse", () => {
  it("Leadcode: 8 Zeichen base32, fest je Lead und Geheimnis, verschieden je Lead", () => {
    const a = leadCode("lead_1", "geheim");
    expect(a).toMatch(/^[a-z2-7]{8}$/);
    expect(leadCode("lead_1", "geheim")).toBe(a);
    expect(leadCode("lead_2", "geheim")).not.toBe(a);
    expect(leadCode("lead_1", "anderes")).not.toBe(a);
  });

  it("Adresse mit und ohne Kurzname, Kurzname bereinigt", () => {
    expect(antwortAdresse("kannapinn", "abcd2345")).toBe("kannapinn.abcd2345@antwort.dein-beratungstermin.de");
    expect(antwortAdresse(null, "abcd2345")).toBe("abcd2345@antwort.dein-beratungstermin.de");
    expect(kurzname("Müller & Söhne")).toBe("mueller-soehne");
    expect(kurzname("  ")).toBeNull();
  });

  it("zerlegen: Code, Kurzname mit Punkt, fremde Domain, nur Kurzname", () => {
    expect(parseAntwortAdresse("Ole <kannapinn.abcd2345@antwort.dein-beratungstermin.de>")).toEqual({ kurz: "kannapinn", code: "abcd2345" });
    expect(parseAntwortAdresse("abcd2345@antwort.dein-beratungstermin.de")).toEqual({ kurz: null, code: "abcd2345" });
    expect(parseAntwortAdresse("KANNAPINN.ABCD2345@Antwort.Dein-Beratungstermin.de")).toEqual({ kurz: "kannapinn", code: "abcd2345" });
    expect(parseAntwortAdresse("kannapinn@antwort.dein-beratungstermin.de")).toEqual({ kurz: "kannapinn", code: null });
    // Code mit unerlaubten Zeichen (0, 1, 8, 9) ist keiner
    expect(parseAntwortAdresse("kannapinn.abcd1890@antwort.dein-beratungstermin.de")).toEqual({ kurz: "kannapinn-abcd1890", code: null });
    expect(parseAntwortAdresse("x.abcd2345@dein-beratungstermin.de")).toBeNull();
    expect(reineAdresse("Julia <Julia@Example.de>")).toBe("julia@example.de");
  });

  it("Schalter: Standard aus", () => {
    expect(antwortEingangAn({})).toBe(false);
    expect(antwortEingangAn({ MAIL_ANTWORT_EINGANG: "0" })).toBe(false);
    expect(antwortEingangAn({ MAIL_ANTWORT_EINGANG: "1" })).toBe(true);
    expect(antwortEingangAn({ MAIL_ANTWORT_EINGANG: "an" })).toBe(true);
  });

  it("Vermittleradresse: Berater vor Beraterdresse vor Inhaber", () => {
    expect(vermittlerAdresse({ zustaendig: { email: "berater@x.de", teamRole: "advisor" }, advisorEmail: "ole@x.de", ersterInhaber: "inh@x.de" })).toBe("berater@x.de");
    expect(vermittlerAdresse({ zustaendig: { email: "inh2@x.de", teamRole: "owner" }, advisorEmail: "ole@x.de" })).toBe("ole@x.de");
    expect(vermittlerAdresse({ ersterInhaber: "inh@x.de" })).toBe("inh@x.de");
    expect(vermittlerAdresse({})).toBeUndefined();
  });
});

describe("Eingang prüfen", () => {
  it("automatische Antworten erkennen", () => {
    expect(autoAntwortGrund({ "auto-submitted": "auto-replied" }, "Hallo", "a@b.de")).toBe("auto_submitted");
    expect(autoAntwortGrund({ "auto-submitted": "no" }, "Hallo", "a@b.de")).toBeNull();
    expect(autoAntwortGrund({ precedence: "bulk" }, "Hallo", "a@b.de")).toBe("precedence");
    expect(autoAntwortGrund({ "X-Autoreply": "yes" }, "Hallo", "a@b.de")).toBe("auto_kopf");
    expect(autoAntwortGrund({ "list-unsubscribe": "<mailto:x>" }, "Hallo", "a@b.de")).toBe("liste");
    expect(autoAntwortGrund({}, "Automatische Antwort: Ihre Terminbestätigung", "a@b.de")).toBe("betreff");
    expect(autoAntwortGrund({}, "Out of Office: bis 3.12.", "a@b.de")).toBe("betreff");
    expect(autoAntwortGrund({}, "Hallo", "mailer-daemon@googlemail.com")).toBe("absender");
    expect(autoAntwortGrund({}, "AW: Ihre Terminbestätigung", "julia@example.de")).toBeNull();
  });

  it("SPF/DKIM/DMARC: nur eindeutiger Fehler zählt", () => {
    expect(authFehler({ spf: "pass", dkim: "pass", dmarc: "pass" })).toBe(false);
    expect(authFehler({ spf: "gray", dkim: "gray", dmarc: "gray" })).toBe(false);
    expect(authFehler({ spf: "pass", dkim: "fail", dmarc: "fail" })).toBe(true);
    expect(authFehler({ spf: "fail", dkim: "fail", dmarc: "gray" })).toBe(true);
    expect(authFehler({ spf: "fail", dkim: "pass", dmarc: "gray" })).toBe(false);
    expect(authFehler(null, { "authentication-results": "mx.resend; spf=pass; dkim=pass; dmarc=fail" })).toBe(true);
    expect(authFehler(null, {})).toBe(false);
  });

  it("Schleifenschutz: eigene Domains und eigene Weiterleitung", () => {
    const env = { BOOKING_EMAIL_FROM: "termine@dein-beratungstermin.de" };
    expect(istSchleife("termine@dein-beratungstermin.de", {}, env)).toBe(true);
    expect(istSchleife("x.abcd2345@antwort.dein-beratungstermin.de", {}, env)).toBe(true);
    expect(istSchleife("julia@example.de", { "x-pg-eingang": "abc" }, env)).toBe(true);
    expect(istSchleife("julia@example.de", {}, env)).toBe(false);
  });

  it("Anhangfilter: Programme, Archive, Makros, Doppelendungen gesperrt", () => {
    expect(anhangErlaubt("police.pdf", "application/pdf")).toBe(true);
    expect(anhangErlaubt("foto.jpg", "image/jpeg")).toBe(true);
    expect(anhangErlaubt("Angebot.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(anhangErlaubt("rechnung.pdf.exe", "application/octet-stream")).toBe(false);
    expect(anhangErlaubt("unterlagen.zip", "application/zip")).toBe(false);
    expect(anhangErlaubt("liste.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12")).toBe(false);
    expect(anhangErlaubt("datei", "application/x-msdownload")).toBe(false);
    expect(anhangErlaubt("seite.html", "text/html")).toBe(false);
    expect(anhangErlaubt("script.js ", "text/plain")).toBe(false);
  });

  it("Anhänge wählen: Limit, eingebettete Bilder bleiben im HTML", () => {
    const liste = [
      { id: "a", filename: "a.pdf", size: 10, contentType: "application/pdf", inline: false },
      { id: "b", filename: "logo.png", size: 5, contentType: "image/png", inline: true },
      { id: "c", filename: "x.zip", size: 5, contentType: "application/zip", inline: false },
    ];
    const w = anhaengeWaehlen(liste, 100);
    expect(w.weiterleiten.map((a) => a.id)).toEqual(["a"]);
    expect(w.gesperrt.map((a) => a.id)).toEqual(["c"]);
    const gross = anhaengeWaehlen(liste, 5);
    expect(gross.weiterleiten).toEqual([]);
    expect(gross.zuGross.map((a) => a.id)).toEqual(["a"]);
  });
});

describe("Weiterleitung und Verlauf", () => {
  it("Weiterleitung: Anzeigename, Betreff ohne AW, Hinweise, keine Gedankenstriche im eigenen Text", () => {
    const w = weiterleitungInhalt({
      leadName: 'Julia "J" Schneider',
      leadAdresse: "julia@example.de",
      subject: "AW: Re: Ihre Terminbestätigung",
      text: "Danke, passt.",
      appLink: "https://app.test/buyer/leads/l1",
      hinweise: ["Aus Sicherheitsgründen nicht weitergeleitet: x.zip."],
      zugeordnet: true,
    });
    expect(w.fromName).toBe("Julia J Schneider (Antwort)");
    expect(w.subject).toBe("Antwort von Julia J Schneider: Ihre Terminbestätigung");
    expect(w.text).toContain("Antworten Sie einfach auf diese E-Mail, sie geht direkt an julia@example.de.");
    expect(w.text).toContain("Kontakt in der App: https://app.test/buyer/leads/l1");
    expect(w.text).toContain("x.zip");
    expect(w.text.endsWith("Danke, passt.")).toBe(true);
    expect(hatGedankenstrich(w.text.replace("Danke, passt.", ""))).toBe(false);
    expect(w.html).toContain("<strong>");
    const u = weiterleitungInhalt({ leadName: null, leadAdresse: "x@y.de", subject: "", text: "Hallo", zugeordnet: false });
    expect(u.subject).toBe("Antwort von x@y.de: (ohne Betreff)");
    expect(u.text).toContain("keinem Kontakt zugeordnet");
  });

  it("Zitat kürzen, HTML zu Text, Betreffkern", () => {
    expect(ohneZitat("Passt, bis morgen.\n\nAm 17.11.2026 um 18:00 schrieb Ole Kannapinn <termine@x.de>:\n> Hallo")).toBe("Passt, bis morgen.");
    expect(ohneZitat("> nur Zitat")).toBe("> nur Zitat");
    expect(htmlZuText("<p>Hallo</p><p>Gruß<br>Julia</p><style>p{}</style>")).toBe("Hallo\nGruß\nJulia");
    expect(betreffKern("WG: AW: Termin")).toBe("Termin");
  });

  it("Verlaufszeile und Anhänge im Eintrag", () => {
    expect(mailVerlaufText({ art: "antwort", automatic: false, to: "julia@example.de", subject: "AW: Termin", status: "empfangen", richtung: "eingang" })).toBe(
      "E-Mail erhalten von julia@example.de: AW: Termin",
    );
    expect(mailVerlaufText({ art: "antwort_auto", automatic: false, to: "j@x.de", subject: "Abwesend", status: "empfangen", richtung: "eingang" })).toBe(
      "E-Mail erhalten (Automatische Antwort) von j@x.de: Abwesend",
    );
    expect(
      eingangAnhaenge("l1", {
        id: "e1",
        anhaenge: [
          { id: "a1", name: "police.pdf", groesse: 10, erlaubt: true },
          { id: "a2", name: "x.zip", groesse: 5, erlaubt: false },
        ],
      }),
    ).toEqual([
      { name: "police.pdf", groesse: 10, link: "/api/buyer/leads/l1/mail-anhang/e1/a1" },
      { name: "x.zip", groesse: 5, link: null },
    ]);
  });
});
