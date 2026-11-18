import { describe, expect, it } from "vitest";
import {
  ANGEBOT_AUFGABE,
  angebotAnrufTag,
  naechsterVersand,
  vorabCheckFaellig,
  vorabCheckPush,
  vorabCheckZeit,
  ANGEBOT_HINWEIS,
  SELBST_UPLOAD_HINWEIS,
  angebotAnrufPush,
  angebotMail,
  angebotStandText,
  angebotThema,
  angebotVorteile,
  angebotWhatsAppText,
  kombiSatz,
  leereListeWeg,
  mailWerte,
  nachfassMail,
  rueckrufPush,
  rueckrufSeite,
} from "@/lib/angebot-senden";
import { SEQUENCES } from "@/lib/lead-sequences";
import { planeNachrichten, type PlanEingabe } from "@/lib/nachrichtenplan";
import { STANDARD_VORLAGEN_JE } from "@/lib/mail/vorlagen";
import { PLATZHALTER, fuelle, werteFuer } from "@/lib/mail/platzhalter";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { ANGEBOT_PURPOSES, CORE_PURPOSES, buildTemplateRequest, categoryFor, exampleValuesFor, metaTemplateProblems, plannedTemplates, purposesFor, templateNameFor } from "@/lib/whatsapp/template-plan";
import { TEMPLATE_BODY } from "@/lib/whatsapp/templates";
import { END_CUSTOMER_PREFIXES, RESERVED_SEGMENTS } from "@/lib/public-booking-host";

const becker = { fullName: "Anna Becker", firstName: "Anna", lastName: "Becker", salutation: "Frau" as const };
const vorlage = (an: "sie" | "du", key: "angebot" | "nachfassen_angebot") => {
  const v = STANDARD_VORLAGEN_JE[an].find((x) => x.key === key)!;
  return { subject: v.subject, body: v.body };
};
const SIG = { text: "Viele Grüße\nOle Kannapinn", html: "<p>Viele Grüße<br>Ole Kannapinn</p>" };

describe("Angebot senden: Texte an den Lead", () => {
  it("Thema aus den gewählten Sparten", () => {
    expect(angebotThema(["Haftpflicht", "Hausrat"], "x")).toBe("Haftpflicht und Hausrat");
    expect(angebotThema(["Haftpflicht", "Hausrat", "Unfall"], "x")).toBe("Haftpflicht, Hausrat und Unfall");
    expect(angebotThema([], "Ihrer Anfrage")).toBe("Ihrer Anfrage");
  });

  it("WhatsApp in Oles Wortlaut, Sie und Du, Link in eigener Zeile, ohne Gedankenstriche", () => {
    const sie = angebotWhatsAppText({ an: "sie", kontakt: becker, thema: "Haftpflicht und Hausrat", link: "https://x.de/ihr-angebot/t" });
    expect(sie).toBe(
      "Vielen Dank für das Gespräch, Frau Becker! Wie besprochen hier Ihr Angebot für Haftpflicht und Hausrat:\nhttps://x.de/ihr-angebot/t\n\nBei Fragen schreiben Sie mir einfach hier.",
    );
    const du = angebotWhatsAppText({ an: "du", kontakt: becker, thema: "Haftpflicht und Hausrat", link: "L", kundenlink: "K" });
    expect(du).toContain("Vielen Dank für das Gespräch, Anna! Wie besprochen hier dein Angebot für Haftpflicht und Hausrat:");
    expect(du).toContain("Deine Beratung zum Nachlesen:\nK");
    expect(du).toContain("Bei Fragen schreib mir einfach hier.");
    expect(angebotWhatsAppText({ an: "sie", kontakt: null, thema: "Hausrat", link: "L" })).toMatch(/^Vielen Dank für das Gespräch! /);
    expect(hatGedankenstrich(sie + du)).toBe(false);
  });

  it("Kombi-Rabatt nur, wenn die App ihn berechnet", () => {
    expect(kombiSatz(null, "Haftpflicht und Hausrat")).toBeNull();
    expect(kombiSatz({ prozent: 0 }, "Haftpflicht und Hausrat")).toBeNull();
    const k = kombiSatz({ prozent: 10 }, "Haftpflicht und Hausrat");
    expect(k).toBe("Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %.");
    expect(angebotWhatsAppText({ an: "sie", kontakt: becker, thema: "Haftpflicht und Hausrat", link: "L", kombi: k })).toContain(k!);
    expect(angebotWhatsAppText({ an: "sie", kontakt: becker, thema: "Haftpflicht und Hausrat", link: "L" })).not.toContain("Kombi");
  });

  it("Angebots-Mail aus der Vorlage „Angebot“: Vorteile aus der Auswahl, Knöpfe und Signatur im Rahmen", () => {
    const werte = mailWerte({
      an: "sie",
      kontakt: becker,
      thema: "Haftpflicht und Hausrat",
      meinname: "Ole Kannapinn",
      now: new Date("2026-11-17T12:00:00Z"),
      extra: angebotVorteile(
        [
          { sparte: "Haftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitrag: 6.12 },
          { sparte: "Hausrat", gesellschaft: "Allianz", tarif: "Komfort", beitrag: 9.5 },
        ],
        kombiSatz({ prozent: 10 }, "Haftpflicht und Hausrat"),
      ),
    });
    const m = angebotMail({ vorlage: vorlage("sie", "angebot"), werte, link: "https://x.de/ihr-angebot/t", kundenlink: "https://x.de/beratung/k", signatur: SIG });
    expect(m.subject).toBe("Frau Becker, Ihr Angebot zu Haftpflicht und Hausrat");
    expect(m.text).toContain("Guten Tag Frau Becker,");
    expect(m.text).toContain("• Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %");
    expect(m.text).toContain("• Haftpflicht: Allianz Komfort, 6,12 € im Monat");
    expect(m.text).toContain("Angebot ansehen: https://x.de/ihr-angebot/t\nBeratung ansehen: https://x.de/beratung/k");
    expect(m.text.trim().endsWith("Ole Kannapinn")).toBe(true);
    expect(m.html).toContain('href="https://x.de/ihr-angebot/t"');
    expect(m.html).toContain(">Angebot ansehen</a>");
    expect(hatGedankenstrich(m.subject + m.text)).toBe(false);
  });

  it("ohne Auswahl im Termin entfällt die Aufzählung samt „Das Wichtigste für Sie:“", () => {
    const werte = mailWerte({ an: "du", kontakt: becker, thema: "Hausrat", meinname: "Ole", extra: angebotVorteile([], null) });
    const m = angebotMail({ vorlage: vorlage("du", "angebot"), werte, link: "L", signatur: SIG });
    expect(m.text).not.toContain("•");
    expect(m.text).not.toContain("Das Wichtigste");
    expect(m.text).toContain("wie besprochen bekommst du im Anhang dein Angebot.");
    expect(leereListeWeg("A. Liste:\n• \n•\n\nB")).toBe("A.\n\nB");
  });

  it("Nachfass-Mail aus der Vorlage „Nachfassen Angebot“ mit [Rückruf wünschen]; {rueckruf_link} als Platzhalter", () => {
    expect(PLATZHALTER).toContain("{rueckruf_link}");
    const werte = mailWerte({ an: "sie", kontakt: becker, thema: "Haftpflicht und Hausrat", meinname: "Ole Kannapinn" });
    const m = nachfassMail({ vorlage: vorlage("sie", "nachfassen_angebot"), werte, angebotLink: "https://x.de/ihr-angebot/t", rueckrufLink: "https://x.de/rueckruf/r", signatur: SIG });
    expect(m.text).toContain("konnten Sie sich das Angebot schon ansehen?");
    expect(m.text).toContain("Rückruf wünschen: https://x.de/rueckruf/r");
    expect(m.html).toContain(">Rückruf wünschen</a>");
    // Eigene Vorlage mit {rueckruf_link}: kein doppelter Knopf
    const eigen = nachfassMail({ vorlage: { subject: "Frage", body: "{anrede},\n\nRückruf? {rueckruf_link}\n\n{signatur}" }, werte, angebotLink: null, rueckrufLink: "https://x.de/rueckruf/r", signatur: SIG });
    expect(eigen.text.match(/rueckruf\/r/g)).toHaveLength(1);
    // Ohne Link entfällt der Satz
    const w = werteFuer({ name: "Anna Becker", source: null, firstName: "Anna", lastName: "Becker", salutation: "Frau" }, "Ole");
    expect(fuelle("Hallo.\nHier zurückrufen lassen: {rueckruf_link}\nEnde.", w)).not.toContain("zurückrufen");
  });

  it("Rückruf-Seite, Pushes und Hinweise in Sie-Form", () => {
    const t = rueckrufSeite("sie", { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" });
    expect(t.text).toBe("Herr Kannapinn ruft Sie gern an und beantwortet Ihre Fragen zum Angebot.");
    expect(t.danke).toBe("Danke! Herr Kannapinn meldet sich bei Ihnen.");
    expect(rueckrufSeite("du", { nom: "Ole", dat: "Ole" }).text).toContain("ruft dich gern an");
    expect(angebotAnrufPush({ leadId: "l1", name: "Frau Becker" })).toMatchObject({ title: "Frau Becker anrufen: Fragen zum Angebot?", url: "/buyer?anrufen=l1#anrufen" });
    expect(rueckrufPush({ leadId: "l1", name: "Frau Becker" }).title).toBe("Frau Becker wünscht einen Rückruf");
    expect(ANGEBOT_AUFGABE).toBe("Angebot ablegen und senden");
    expect(ANGEBOT_HINWEIS).toBe("Das Nachfassen zum Angebot startet erst, wenn Sie es hier senden.");
    expect(SELBST_UPLOAD_HINWEIS).toContain("hilft bei Ihren Zahlen");
    expect(hatGedankenstrich([t.text, t.danke, ANGEBOT_HINWEIS, SELBST_UPLOAD_HINWEIS].join(" "))).toBe(false);
  });

  it("Vorab-Check: Versand nur Mo bis Sa 9 bis 19 Uhr, Push um 18 Uhr am Vorabend, Text in Sie-Form", () => {
    // Do 19.11. 10 Uhr Berlin: im Fenster
    const do10 = new Date("2026-11-19T09:00:00Z");
    expect(naechsterVersand(do10)).toEqual(do10);
    // Sa 21.11. 20 Uhr → Mo 23.11. 9 Uhr (Sonntag ruht)
    expect(naechsterVersand(new Date("2026-11-21T19:00:00Z")).toISOString()).toBe("2026-11-23T08:00:00.000Z");
    expect(vorabCheckZeit(do10).toISOString()).toBe("2026-11-18T17:00:00.000Z");
    // Sommerzeit: 18 Uhr Berlin = 16 Uhr UTC
    expect(vorabCheckZeit(new Date("2026-06-10T08:00:00Z")).toISOString()).toBe("2026-06-09T16:00:00.000Z");
    expect(vorabCheckFaellig({ now: new Date("2026-11-18T16:59:00Z"), versand: do10 })).toBe(false);
    expect(vorabCheckFaellig({ now: new Date("2026-11-18T17:01:00Z"), versand: do10 })).toBe(true);
    // nachts kein Push (23 Uhr), am Morgen des Versands wieder
    expect(vorabCheckFaellig({ now: new Date("2026-11-18T22:00:00Z"), versand: do10 })).toBe(false);
    expect(vorabCheckFaellig({ now: new Date("2026-11-19T07:30:00Z"), versand: do10 })).toBe(true);
    expect(vorabCheckFaellig({ now: do10, versand: do10 })).toBe(false);
    const p = vorabCheckPush({ leadId: "l1", name: "Frau Becker", kanal: "whatsapp", versand: do10, now: new Date("2026-11-18T17:00:00Z") });
    // P4: zugleich die Abschluss-Frage am Vorabend, Deep-Link auf das Entscheidungsblatt
    expect(p).toMatchObject({ title: "Hat Frau Becker abgeschlossen?", url: "/buyer/abschluss?l=l1" });
    expect(p.body).toBe("Morgen fasst die App per WhatsApp zum Angebot nach. Mit einem Tipp eintragen oder pausieren.");
    expect(vorabCheckPush({ leadId: "l1", name: "Frau Becker", kanal: "email", versand: do10, now: new Date("2026-11-19T07:30:00Z") }).body).toBe("Heute fasst die App per E-Mail zum Angebot nach. Mit einem Tipp eintragen oder pausieren.");
    expect(vorabCheckPush({ leadId: "l1", name: "Frau Becker", kanal: "email", versand: new Date("2026-11-23T08:00:00Z"), now: new Date("2026-11-20T17:00:00Z") }).body).toMatch(
      /^Am Montag fasst die App per E-Mail zum Angebot nach\./,
    );
    expect(hatGedankenstrich(p.title + p.body)).toBe(false);
  });

  it("{anruf_tag} der Angebots-Mail ist der Tag der Anruf-Aufgabe (Tag 3), sonntags Montag", () => {
    expect(angebotAnrufTag(new Date("2026-11-17T09:00:00Z"))).toBe("Freitag"); // Di + 3
    expect(angebotAnrufTag(new Date("2026-11-19T09:00:00Z"))).toBe("Montag"); // Do + 3 = So
  });

  it("Stand für Terminvorbereitung und Kontakt", () => {
    const d = "2026-11-17T10:00:00Z";
    expect(angebotStandText({ abgelegtAt: null, gesendetAt: null, versand: null })).toBeNull();
    expect(angebotStandText({ abgelegtAt: d, gesendetAt: null, versand: null })).toBe("Angebot abgelegt am 17.11.");
    expect(angebotStandText({ abgelegtAt: d, gesendetAt: d, versand: "app", kanaele: "whatsapp,email" })).toBe("Angebot gesendet am 17.11. per WhatsApp und E-Mail");
    expect(angebotStandText({ abgelegtAt: null, gesendetAt: d, versand: "selbst" })).toBe("Angebot selbst gesendet am 17.11.");
  });
});

describe("Nachfassen zum Angebot (SEQUENCES)", () => {
  it("über die App: Tag 2 WhatsApp, Tag 3 Anruf mit Push, Tag 5 E-Mail aus der Vorlage, Tag 10 letzte WhatsApp, danach Anruf", () => {
    const s = SEQUENCES.offer.steps;
    expect(s.map((x) => [x.day, x.action])).toEqual([
      [2, "whatsapp"],
      [3, "call"],
      [5, "email"],
      [10, "whatsapp"],
      [12, "call"],
    ]);
    expect(s[1]).toMatchObject({ push: true });
    expect(s[2]).toMatchObject({ vorlage: "nachfassen_angebot", knoepfe: ["angebot", "rueckruf"] });
  });

  it("selbst gesendet: keine E-Mail, Text „das Angebot, das Herr Kannapinn Ihnen geschickt hat“", () => {
    const s = SEQUENCES.offer_selbst.steps;
    expect(s.some((x) => x.action === "email")).toBe(false);
    expect(s.map((x) => x.day)).toEqual([2, 3, 10, 12]);
    const wa = s[0] as Extract<(typeof s)[number], { action: "whatsapp" }>;
    const ctx = { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: becker, topic: "Haftpflicht und Hausrat", an: "sie" as const, person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } };
    expect(wa.text(ctx)).toContain("das Angebot, das Herr Kannapinn Ihnen geschickt hat");
    expect(wa.text({ ...ctx, an: "du", hi: "Hallo Anna,", person: { nom: "Ole", dat: "Ole" } })).toContain("das Angebot, das Ole dir geschickt hat");
    expect(wa.purpose).toBe("followup_offer_selbst");
    expect(wa.fallback?.purpose).toBe("followup_offer");
    for (const k of ["offer", "offer_selbst"] as const) {
      for (const st of SEQUENCES[k].steps) if (st.action === "whatsapp") expect(hatGedankenstrich(st.text(ctx) + st.text({ ...ctx, an: "du" }))).toBe(false);
    }
  });

  it("Nachrichtenplan zeigt WhatsApp, Anruf mit Push und die E-Mail mit Betreff aus der Vorlage", () => {
    const now = new Date("2026-11-17T09:00:00Z");
    const p: PlanEingabe = {
      now,
      an: "sie",
      hi: "Guten Tag Frau Becker,",
      person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
      label: "Frau Becker",
      leadId: "l1",
      termine: [],
      email: false,
      emailKontakt: true,
      whatsapp: true,
      abfolgen: [{ id: "s1", kind: "offer", step: 0, startedAt: now, nextAt: new Date(now.getTime() + 2 * 86400000), stoppedAt: null }],
      abfolgeKontext: { firstName: "Anna", hi: "Guten Tag Frau Becker,", kontakt: becker, topic: "Haftpflicht und Hausrat", an: "sie", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } },
      anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
    };
    const plan = planeNachrichten(p);
    // Vor jedem automatischen Nachfassen (WhatsApp, E-Mail) der Vorab-Check-Push am Vorabend um 18 Uhr
    expect(plan.map((e) => e.kanal)).toEqual(["push", "whatsapp", "anruf", "push", "push", "email", "push", "whatsapp", "anruf"]);
    expect(plan[0]).toMatchObject({ at: "2026-11-18T17:00:00.000Z", vorschau: "Hat Frau Becker abgeschlossen?" });
    expect(plan.filter((e) => e.kanal === "push").map((e) => e.vorschau)).toContain("Frau Becker anrufen: Fragen zum Angebot?");
    // Schon gesendeter Vorab-Check für den laufenden Schritt erscheint nicht noch einmal
    expect(planeNachrichten({ ...p, abfolgen: [{ ...p.abfolgen[0], vorabCheckStep: 0 }] })[0].kanal).toBe("whatsapp");
    const mail = plan.find((e) => e.kanal === "email")!;
    expect(mail.vorschau).toContain("Betreff: Frau Becker, kurze Frage zu Ihrem Angebot");
    expect(mail.vorschau).toContain("Rückruf wünschen: [Link Rückruf]");
    expect(mail.titel).not.toContain("entfällt");
    // eigene Vorlage des Vermittlers
    const eigen = planeNachrichten({ ...p, mailVorlagen: { nachfassen_angebot: { subject: "Noch Fragen, {vorname}?", body: "{anrede},\n\nnoch Fragen?\n\n{signatur}" } } });
    expect(eigen.find((e) => e.kanal === "email")?.vorschau).toContain("Betreff: Noch Fragen, Anna?");
  });
});

describe("Vorlagen und öffentliche Seiten", () => {
  it("„Angebot senden“ und das Nachfassen zum selbst gesendeten Angebot werden eingereicht (Ole, 17.11.2026) und sind Meta-tauglich", () => {
    for (const p of ANGEBOT_PURPOSES) {
      expect(CORE_PURPOSES).toContain(p);
      expect(plannedTemplates(purposesFor({ bestand: false })).filter((t) => t.purpose === p)).toHaveLength(3);
      for (const form of ["du", "sie", "sie_ohne_name"] as const) {
        const req = buildTemplateRequest(p, { firm: "Agentur Meier", advisor: "Susanne Meier" }, undefined, form);
        const body = (req.components as { type: string; text?: string }[]).find((c) => c.type === "BODY")!.text!;
        expect(metaTemplateProblems(body, exampleValuesFor(p, form)), `${p} ${form}`).toEqual([]);
        expect(hatGedankenstrich(body)).toBe(false);
      }
      expect(templateNameFor(p, undefined, "sie")).toBe(`pg_${p}_v5_sie`);
    }
    expect(categoryFor("offer_send")).toBe("UTILITY");
    expect(categoryFor("followup_offer_selbst")).toBe("MARKETING");
    expect(TEMPLATE_BODY.offer_send.sie).toContain("Wie besprochen hier Ihr Angebot für {{2}}: {{3}} Bei Fragen");
  });

  it("Angebots-Link und Rückruf-Seite sind Seiten für Endkunden", () => {
    for (const p of ["/ihr-angebot", "/rueckruf"] as const) expect(END_CUSTOMER_PREFIXES).toContain(p);
    expect(RESERVED_SEGMENTS.has("ihr-angebot")).toBe(true);
    expect(RESERVED_SEGMENTS.has("rueckruf")).toBe(true);
  });
});
