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
import { OPT_OUT_BUTTON, OUTREACH_PURPOSES, PURPOSE_PARAMS, SUGGESTED_TEMPLATE_TEXT, TEMPLATE_BUTTONS, type NoticePurpose } from "@/lib/whatsapp/templates";
import { inboundBody } from "@/lib/whatsapp/gateway";
import { SEQUENCES } from "@/lib/lead-sequences";

const ALL = [...CORE_PURPOSES, ...CAMPAIGN_PURPOSES];

describe("Vorlagen-Plan", () => {
  it("Kampagnen-Vorlagen nur mit Bestandskunden-Modul", () => {
    expect(purposesFor({ bestand: false })).toHaveLength(14);
    expect(purposesFor({ bestand: false })).toContain("reschedule");
    expect(purposesFor({ bestand: false })).not.toContain("campaign_review");
    expect(purposesFor({ bestand: true })).toHaveLength(18);
    expect(purposesFor({ bestand: false })).toEqual(expect.arrayContaining(["outreach_tkv", "outreach_zahn", "outreach_pkv", "outreach_privatschutz"]));
  });

  it("Name: pg_<zweck>_v4[_b][_sie|_sie_ohne_name], nur Kleinbuchstaben/Ziffern/Unterstrich", () => {
    expect(templateNameFor("outreach")).toBe("pg_outreach_v4");
    expect(templateNameFor("outreach_tkv", undefined, "sie", "b")).toBe("pg_outreach_tkv_v4_b_sie");
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
    const body = templateBodyFor("outreach", "Anid Brand");
    expect(body).toContain("Anid Brand");
    expect(body).not.toContain("[Berater]");
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
    for (const p of [...CORE_PURPOSES, ...CAMPAIGN_PURPOSES]) expect(TEMPLATE_BUTTONS[p]?.length, p).toBeGreaterThan(0);
    expect(TEMPLATE_BUTTONS.reminder).toEqual(["Ja, passt", "Bitte verschieben"]);
    expect(TEMPLATE_BUTTONS.followup_noshow).toEqual(["Ja, neuer Termin", "Kein Bedarf mehr"]);
    expect(TEMPLATE_BUTTONS.followup_last).toEqual(["Ja, noch aktuell", "Nein, danke"]);
    expect(TEMPLATE_BUTTONS.booking_confirmation).toEqual(["Termin verschieben"]);
    expect(TEMPLATE_BUTTONS.campaign_cross_sell).toEqual(["Ja, gern prüfen", "Kein Bedarf", OPT_OUT_BUTTON]);
    expect(TEMPLATE_BUTTONS.outreach_tkv).toEqual(["Hund", "Katze"]);
    expect(TEMPLATE_BUTTONS.outreach).toEqual(["Heute", "Morgen", "Lieber schriftlich"]);
    // Erstanschreiben: kein „Später“ und keine Erlaubnisfrage
    for (const p of OUTREACH_PURPOSES) {
      expect(TEMPLATE_BUTTONS[p]).not.toContain("Später");
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
      "Hallo {{1}}, kein Problem, so etwas passiert. Hier ist der digitale KI-Assistent von [Firma]. Sollen wir einen neuen Termin mit [Berater] finden?",
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
    expect(text).toContain("Anid Brand");
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
    expect(inboundBody({ type: "image" })).toBe("[image]");
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
