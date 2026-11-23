import { describe, expect, it } from "vitest";
import {
  advisorDisplayName,
  buildTemplateRequest,
  CAMPAIGN_PURPOSES,
  categoryFor,
  CORE_PURPOSES,
  CUSTOMER_TITLES,
  EMPFEHLUNG_PURPOSES,
  exampleValuesFor,
  findRemote,
  mapRemoteStatus,
  previewBodyFor,
  purposesFor,
  templateBodyFor,
  templateNameFor,
} from "@/lib/whatsapp/template-plan";
import { NAECHSTE_FASSUNG, OPT_OUT_BUTTON, OUTREACH_PURPOSES, PURPOSE_PARAMS, SUGGESTED_TEMPLATE_TEXT, TEMPLATE_BODY, TEMPLATE_BUTTONS, templateVersionFor, type NoticePurpose } from "@/lib/whatsapp/templates";
import { inboundBody } from "@/lib/whatsapp/gateway";
import { SEQUENCES } from "@/lib/lead-sequences";

const ALL = [...CORE_PURPOSES, ...CAMPAIGN_PURPOSES];

describe("Vorlagen-Plan", () => {
  it("Kampagnen-Vorlagen nur mit Bestandskunden-Modul", () => {
    // inkl. Show-up-Paket (freigegeben 17.11.2026): 15 Minuten vorher, „wartet im Videoraum“; Angebot (P3, 17.11.2026); Halbzeit-Erinnerung (20.11.2026)
    // Kfz-Einstiegsfrage je Anlass (Ole, 21.11.2026): outreach_kfz, outreach_kfz_wechsel, outreach_kfz_neu
    // Nachfassen nach Absage (Ole, 23.11.2026): followup_absage
    expect(purposesFor({ bestand: false })).toHaveLength(26);
    expect(purposesFor({ bestand: false })).toContain("reschedule");
    expect(purposesFor({ bestand: false })).toEqual(expect.arrayContaining(["reminder_start", "appt_waiting", "appt_halbzeit"]));
    expect(purposesFor({ bestand: false })).not.toContain("campaign_review");
    expect(purposesFor({ bestand: true })).toHaveLength(30);
    expect(purposesFor({ bestand: false })).toEqual(expect.arrayContaining(["outreach_tkv", "outreach_zahn", "outreach_pkv", "outreach_privatschutz", "outreach_hausrat", "outreach_kfz", "outreach_kfz_wechsel", "outreach_kfz_neu"]));
  });

  it("Name: pg_<zweck>_v4[_b][_sie|_sie_ohne_name], nur Kleinbuchstaben/Ziffern/Unterstrich", () => {
    // Erstanschreiben v10 (19.11.2026, feste Frage, nur mit PDF-Kopf; Fassung b = v11), übrige Zwecke v4
    expect(templateNameFor("outreach")).toBe("pg_outreach_v12");
    expect(templateNameFor("outreach_tkv", undefined, "sie")).toBe("pg_outreach_tkv_v12_sie");
    expect(templateNameFor("outreach_tkv", undefined, "sie", "b")).toBe("pg_outreach_tkv_v12_b_sie");
    expect(templateNameFor("outreach_tkv", "v6", "sie_ohne_name", "a", false)).toBe("pg_outreach_tkv_v6_ohnepdf_sie_ohne_name");
    // Nachfassen v5 (Ole, 18.11.2026, zur Einreichung freigegeben: Vermittler-Nennung)
    expect(templateNameFor("followup_last", undefined, "sie", "b")).toBe("pg_followup_last_v5_b_sie");
    // Unveränderte Texte behalten ihre Version (keine erneute Einreichung)
    expect(templateNameFor("referral_thanks", undefined, "sie")).toBe("pg_referral_thanks_v3_sie");
    expect(templateNameFor("outreach", "v3", "sie")).toBe("pg_outreach_v3_sie");
    expect(templateNameFor("outreach", "v2", "sie_ohne_name")).toBe("pg_outreach_v2_sie_ohne_name");
    // Kampagnen gibt es nur gesiezt
    expect(templateNameFor("campaign_cross_sell", "v2")).toBe("pg_campaign_cross_sell_v2_sie");
    for (const p of ALL) expect(templateNameFor(p)).toMatch(/^[a-z0-9_]+$/);
  });

  it("Kategorie: Termine UTILITY, sonst MARKETING", () => {
    expect(categoryFor("booking_confirmation")).toBe("UTILITY");
    expect(categoryFor("reminder")).toBe("UTILITY");
    expect(categoryFor("reschedule")).toBe("UTILITY");
    expect(categoryFor("outreach")).toBe("MARKETING");
    expect(categoryFor("campaign_birthday")).toBe("MARKETING");
  });

  it("Beraternamen einsetzen (ohne „Allianz“ vorne)", () => {
    expect(advisorDisplayName("Allianz Anid Brand")).toBe("Anid Brand");
    expect(advisorDisplayName("Agentur Müller")).toBe("Agentur Müller");
    const body = templateBodyFor("followup_noshow", "Anid Brand");
    expect(body).toContain("Anid Brand");
    expect(body).not.toContain("[Berater]");
    // Erstanschreiben v6 bis v8: Vermittler als Platzhalter; v9 ohne Vermittler, {{2}} ist die erste Frage; v10 feste Frage
    expect(templateBodyFor("outreach", "Anid Brand")).toBe("Hallo {{1}}, danke für deine Anfrage! *Wann passt dir ein kurzes Telefonat?*");
  });

  it("Antrag: Beispielwerte je Platzhalter, Knöpfe wo eine Antwort erwartet wird, Abmeldeknopf bei Werbung", () => {
    for (const p of ALL) {
      const req = buildTemplateRequest(p, "Anid Brand");
      const body = req.components.find((c) => (c as { type: string }).type === "BODY") as { type: string; text: string; example?: { body_text: string[][] } };
      expect(body.type).toBe("BODY");
      const vars = body.text.match(/\{\{\d+\}\}/g) ?? [];
      expect(vars.length).toBe(PURPOSE_PARAMS[p].length);
      if (vars.length) expect(body.example?.body_text[0]).toEqual(exampleValuesFor(p));
      else expect(body.example).toBeUndefined();
      const buttons = req.components.find((c) => (c as { type: string }).type === "BUTTONS") as { buttons: { type: string; text: string }[] } | undefined;
      if (CAMPAIGN_PURPOSES.includes(p)) {
        expect(buttons?.buttons.at(-1)).toEqual({ type: "QUICK_REPLY", text: OPT_OUT_BUTTON });
        expect(req.category).toBe("MARKETING");
      }
      expect(buttons?.buttons.map((b) => b.text), p).toEqual(TEMPLATE_BUTTONS[p]);
      for (const b of buttons?.buttons ?? []) expect(b.text.length, b.text).toBeLessThanOrEqual(25); // Meta-Grenze für Knopftexte
      expect((buttons?.buttons ?? []).length).toBeLessThanOrEqual(3);
    }
    // Knöpfe überall, wo eine Antwort erwartet wird
    // Erstanschreiben ab v6: die erste Frage ist ein Platzhalter, daher ohne Knöpfe in der Vorlage. „Wartet im Videoraum“
    // erwartet keine Antwort (nur der Link), daher ohne Knöpfe.
    for (const p of [...CORE_PURPOSES, ...CAMPAIGN_PURPOSES].filter((x) => !(OUTREACH_PURPOSES as readonly string[]).includes(x) && x !== "appt_waiting" && x !== "offer_send" && x !== "glueckwunsch")) expect(TEMPLATE_BUTTONS[p]?.length, p).toBeGreaterThan(0);
    expect(TEMPLATE_BUTTONS.appt_waiting).toBeUndefined();
    expect(TEMPLATE_BUTTONS.reminder).toEqual(["Ja, passt", "Bitte verschieben"]);
    expect(TEMPLATE_BUTTONS.followup_noshow).toEqual(["Ja, neuer Termin", "Kein Bedarf mehr"]);
    expect(TEMPLATE_BUTTONS.followup_last).toEqual(["Ja, noch aktuell", "Nein, danke"]);
    expect(TEMPLATE_BUTTONS.booking_confirmation).toEqual(["Termin verschieben"]);
    expect(TEMPLATE_BUTTONS.campaign_cross_sell).toEqual(["Ja, gern prüfen", "Kein Bedarf", OPT_OUT_BUTTON]);
    // Erstanschreiben v10 (Ole, 19.11.2026): Antwortknöpfe der festen Frage, höchstens 3 und je 20 Zeichen (auch interaktiv)
    for (const p of OUTREACH_PURPOSES) {
      expect(TEMPLATE_BUTTONS[p]!.length, p).toBeGreaterThan(1);
      expect(TEMPLATE_BUTTONS[p]!.length, p).toBeLessThanOrEqual(3);
      for (const k of TEMPLATE_BUTTONS[p]!) expect(k.length, k).toBeLessThanOrEqual(20);
    }
    // Erstanschreiben: kein „Später“ und keine Erlaubnisfrage
    for (const p of OUTREACH_PURPOSES) {
      expect(TEMPLATE_BUTTONS[p] ?? []).not.toContain("Später");
      expect(SUGGESTED_TEMPLATE_TEXT[p]).not.toMatch(/kurz Zeit|darf ich/i);
    }
  });

  it("Texte nach Oles Prüfung: keine Gedankenstriche, kein STOPP-Satz, „Versicherungsberater“", () => {
    for (const p of Object.keys(SUGGESTED_TEMPLATE_TEXT) as NoticePurpose[]) {
      const t = SUGGESTED_TEMPLATE_TEXT[p];
      expect(t, p).not.toMatch(/[–—]/);
      expect(t, p).not.toContain("STOPP");
      expect(t, p).not.toContain("Allianz-Berater");
    }
    // Selbstbezeichnung nach Status ([Rolle]), nie „Versicherungsberater“ (geschützter Beruf, § 34d Abs. 2 GewO)
    for (const p of ["campaign_cross_sell", "campaign_review", "campaign_renewal"] as const) expect(SUGGESTED_TEMPLATE_TEXT[p]).toContain("hier ist [Berater][Rolle].");
    for (const t of Object.values(SUGGESTED_TEMPLATE_TEXT)) expect(t).not.toContain("Versicherungsberater");
    expect(SUGGESTED_TEMPLATE_TEXT.followup_noshow).toBe(
      "Hallo {{1}}, kein Problem, so etwas passiert. Hier ist der digitale KI-Assistent von [Firma]. Sollen wir einen neuen Termin mit [BeraterDat] finden?",
    );
    expect(SUGGESTED_TEMPLATE_TEXT.followup_noshow).not.toMatch(/schade/i);
    expect(SUGGESTED_TEMPLATE_TEXT.followup_last).toContain("Wenn nicht, ist das völlig in Ordnung, dann melden wir uns nicht weiter.");
    expect(SUGGESTED_TEMPLATE_TEXT.campaign_cross_sell).toContain("Viele meiner Kunden haben beim Thema {{2}} eine Lücke, die erst im Schadenfall auffällt. Soll ich in 10 Minuten kurz prüfen, ob das bei Ihnen auch so ist?");
    // Widerspruchs-Knopf nur bei Werbung: Bestandskunden-Kampagnen, Bitte um Empfehlung und Bewertungsbitte
    for (const p of Object.keys(TEMPLATE_BUTTONS) as NoticePurpose[]) {
      if (TEMPLATE_BUTTONS[p]!.includes(OPT_OUT_BUTTON)) expect([...CAMPAIGN_PURPOSES, ...EMPFEHLUNG_PURPOSES]).toContain(p);
      if ([...CAMPAIGN_PURPOSES, "referral_request", "review_request"].includes(p)) expect(TEMPLATE_BUTTONS[p]).toContain(OPT_OUT_BUTTON);
    }
  });

  it("Freitext der Nachfass-Abfolgen ebenfalls ohne Gedankenstriche", () => {
    const texts = JSON.stringify(SEQUENCES);
    expect(texts).not.toMatch(/[–—]/);
  });

  it("Vorschau setzt Beispielwerte und Beraternamen ein", () => {
    const text = previewBodyFor("outreach", "Anid Brand");
    expect(text).not.toMatch(/\{\{\d+\}\}/);
    expect(text).toContain("Julia");
    // Erstanschreiben v9 nennt den Vermittler nicht mehr; Beraternamen z. B. im Nachfassen nach verpasstem Termin
    const noshow = previewBodyFor("followup_noshow", "Anid Brand");
    expect(noshow).not.toMatch(/\{\{\d+\}\}/);
    expect(noshow).toContain("Anid Brand");
    for (const p of ALL) expect(CUSTOMER_TITLES[p].title.length).toBeGreaterThan(3);
  });

  it("Status von 360dialog/Meta abbilden", () => {
    expect(mapRemoteStatus("APPROVED")).toBe("approved");
    expect(mapRemoteStatus("approved")).toBe("approved");
    expect(mapRemoteStatus("REJECTED")).toBe("rejected");
    expect(mapRemoteStatus("DISABLED")).toBe("rejected");
    expect(mapRemoteStatus("PAUSED")).toBe("paused");
    expect(mapRemoteStatus("SUBMITTED")).toBe("pending");
    expect(mapRemoteStatus("PENDING")).toBe("pending");
    expect(mapRemoteStatus("IN_APPEAL")).toBe("pending");
  });

  it("Vorlage in der Liste finden (Sprache de oder de_DE)", () => {
    const list = [
      { name: "pg_outreach_v1", language: "en", status: "APPROVED", category: null, rejectedReason: null },
      { name: "pg_outreach_v1", language: "de_DE", status: "PENDING", category: null, rejectedReason: null },
    ];
    expect(findRemote(list, "pg_outreach_v1")?.status).toBe("PENDING");
    expect(findRemote(list, "pg_reminder_v1")).toBeNull();
  });
});

describe("Eingehende Knopf-Antworten", () => {
  it("Schnellantwort einer Vorlage → Knopftext (wird wie „STOPP“ behandelt)", () => {
    expect(inboundBody({ type: "button", button: { text: "Keine Nachrichten mehr", payload: "Keine Nachrichten mehr" } })).toBe("Keine Nachrichten mehr");
    expect(inboundBody({ type: "interactive", interactive: { button_reply: { title: "Ja" } } })).toBe("Ja");
    expect(inboundBody({ type: "text", text: { body: "Hallo" } })).toBe("Hallo");
    // Fotos und PDFs (Policen, lib/policen): ohne Dateinamen, bis klar ist, ob er gezeigt werden darf
    expect(inboundBody({ type: "image" })).toBe("Dokument empfangen");
    expect(inboundBody({ type: "document", document: { filename: "Kranken.pdf" } })).toBe("Dokument empfangen");
    expect(inboundBody({ type: "audio" })).toBe("[audio]");
  });
});

describe("Bewertungsbitte (Anwalts-Memo 15.11.2026): neutral, eigene Version, alte Fassung nicht mehr", () => {
  it("v3 nur für review_request, Text neutral ohne „5 Sterne“, Abmeldeknopf, Meta-Regeln erfüllt", async () => {
    const { metaTemplateProblems } = await import("@/lib/whatsapp/template-plan");
    const { rankTemplates, templateVersionFor } = await import("@/lib/whatsapp/templates");
    expect(templateNameFor("review_request", "v3", "sie")).toBe("pg_review_request_v3_sie");
    expect(templateNameFor("outreach", "v2", "sie")).toBe("pg_outreach_v2_sie");
    expect(templateVersionFor("review_request")).toBe("v3");
    const body = templateBodyFor("review_request", "Max Muster", "sie");
    expect(body).toContain("ehrliche Bewertung");
    expect(body).not.toMatch(/sterne|zufrieden waren/i);
    expect(TEMPLATE_BUTTONS.review_request).toEqual([OPT_OUT_BUTTON]);
    for (const form of ["sie", "sie_ohne_name"] as const) {
      const req = buildTemplateRequest("review_request", "Max Muster", "v3", form);
      const text = (req.components[0] as { text: string }).text;
      expect(metaTemplateProblems(text, exampleValuesFor("review_request", form)), text).toEqual([]);
    }
    // Ältere freigegebene Fassung (v2, „wenn Sie zufrieden waren“) wird nicht mehr gesendet; manuelle schon
    const old = { name: "pg_review_request_v2_sie", body: "Guten Tag {{1}}, alt {{2}} Grüße" };
    const cur = { name: "pg_review_request_v3_sie", body: "Guten Tag {{1}}, neu {{2}} Grüße" };
    const manual = { name: "bewertung_handarbeit", body: "Guten Tag {{1}}, eigene {{2}} Grüße" };
    const k = { firstName: "Julia", lastName: "Schneider", salutation: "Frau" };
    expect(rankTemplates([old], "review_request", "sie", k)).toBeNull();
    expect(rankTemplates([old, cur], "review_request", "sie", k)?.tpl.name).toBe("pg_review_request_v3_sie");
    expect(rankTemplates([old, manual], "review_request", "sie", k)?.tpl.name).toBe("bewertung_handarbeit");
    // Andere Zwecke dürfen bis zur Freigabe weiter die ältere Fassung nutzen
    expect(rankTemplates([{ name: "pg_referral_request_v1_sie", body: "Guten Tag {{1}}, x {{2}} y" }], "referral_request", "sie", k)).not.toBeNull();
  });
  it("Einwilligung für Nachfrage und Bitten; Quellenhinweis für angezeigte Bewertungen", async () => {
    const { feedbackAllowed, REVIEW_SOURCE_NOTE, DEFAULT_TEXTS } = await import("@/lib/empfehlung/shared");
    expect(feedbackAllowed({ feedbackConsentAt: null, feedbackOptOutAt: null })).toBe(false);
    expect(feedbackAllowed({ feedbackConsentAt: new Date(), feedbackOptOutAt: null })).toBe(true);
    expect(feedbackAllowed({ feedbackConsentAt: new Date(), feedbackOptOutAt: new Date() })).toBe(false);
    expect(REVIEW_SOURCE_NOTE).toBe("Bewertungen stammen von Google, keine eigene Echtheitsprüfung.");
    expect(DEFAULT_TEXTS.review).toContain("STOPP");
    expect(DEFAULT_TEXTS.review).toContain("ehrliche Bewertung");
  });
});

describe("Vorgemerkte nächste Fassung (Rechtsvorprüfung 16.11.2026)", () => {
  it("Kampagne „Lücke schließen“: freigegebene v4 bleibt, v5 ist vorgemerkt, gleiche Platzhalter, ohne Gedankenstriche", () => {
    // gesendet und eingereicht wird weiter der freigegebene Text (muss zur Meta-Freigabe passen)
    expect(templateVersionFor("campaign_cross_sell")).toBe("v4");
    expect(templateNameFor("campaign_cross_sell", undefined, "sie")).toBe("pg_campaign_cross_sell_v4_sie");
    expect(TEMPLATE_BODY.campaign_cross_sell.sie).toContain("Viele meiner Kunden haben beim Thema {{2}} eine Lücke");
    const next = NAECHSTE_FASSUNG.campaign_cross_sell!;
    expect(next.version).toBe("v5");
    expect(next.sie).toContain("Beim Thema {{2}} gibt es oft Lücken, die erst im Schadenfall auffallen.");
    expect(next.sie).not.toMatch(/viele meiner Kunden/i);
    expect(next.sie).not.toMatch(/[–—]/);
    for (const [purpose, f] of Object.entries(NAECHSTE_FASSUNG) as [NoticePurpose, NonNullable<(typeof NAECHSTE_FASSUNG)[NoticePurpose]>][]) {
      // Meta-Parameter müssen gleich bleiben ([Firma]/[Berater] füllt die App je Kunde)
      const vars = (t: string) => (t.match(/\{\{\d+\}\}/g) ?? []).sort();
      expect(vars(f.sie), purpose).toEqual(vars(TEMPLATE_BODY[purpose].sie));
      expect(!!f.du, purpose).toBe(!!TEMPLATE_BODY[purpose].du);
      expect(Number(f.version.slice(1)), purpose).toBeGreaterThan(Number(templateVersionFor(purpose).slice(1)));
    }
  });
});
