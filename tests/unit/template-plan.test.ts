import { describe, expect, it } from "vitest";
import {
  advisorDisplayName,
  buildTemplateRequest,
  CAMPAIGN_PURPOSES,
  categoryFor,
  CORE_PURPOSES,
  CUSTOMER_TITLES,
  exampleValuesFor,
  findRemote,
  mapRemoteStatus,
  previewBodyFor,
  purposesFor,
  templateBodyFor,
  templateNameFor,
} from "@/lib/whatsapp/template-plan";
import { OPT_OUT_BUTTON, PURPOSE_PARAMS, SUGGESTED_TEMPLATE_TEXT, TEMPLATE_BUTTONS, type NoticePurpose } from "@/lib/whatsapp/templates";
import { inboundBody } from "@/lib/whatsapp/gateway";
import { SEQUENCES } from "@/lib/lead-sequences";

const ALL = [...CORE_PURPOSES, ...CAMPAIGN_PURPOSES];

describe("Vorlagen-Plan", () => {
  it("Kampagnen-Vorlagen nur mit Bestandskunden-Modul", () => {
    expect(purposesFor({ bestand: false })).toHaveLength(8);
    expect(purposesFor({ bestand: false })).toContain("reschedule");
    expect(purposesFor({ bestand: false })).not.toContain("campaign_review");
    expect(purposesFor({ bestand: true })).toHaveLength(12);
  });

  it("Name: pg_<zweck>_v1, nur Kleinbuchstaben/Ziffern/Unterstrich", () => {
    expect(templateNameFor("outreach")).toBe("pg_outreach_v1");
    expect(templateNameFor("campaign_cross_sell", "v2")).toBe("pg_campaign_cross_sell_v2");
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

  it("Antrag: Beispielwerte je Platzhalter, Knöpfe nur bei Kampagnen", () => {
    for (const p of ALL) {
      const req = buildTemplateRequest(p, "Anid Brand");
      const body = req.components[0] as { type: string; text: string; example?: { body_text: string[][] } };
      expect(body.type).toBe("BODY");
      const vars = body.text.match(/\{\{\d+\}\}/g) ?? [];
      expect(vars.length).toBe(PURPOSE_PARAMS[p].length);
      if (vars.length) expect(body.example?.body_text[0]).toEqual(exampleValuesFor(p));
      else expect(body.example).toBeUndefined();
      const buttons = req.components.find((c) => (c as { type: string }).type === "BUTTONS") as { buttons: { type: string; text: string }[] } | undefined;
      if (CAMPAIGN_PURPOSES.includes(p)) {
        expect(buttons?.buttons).toEqual([{ type: "QUICK_REPLY", text: OPT_OUT_BUTTON }]);
        expect(req.category).toBe("MARKETING");
      } else {
        expect(buttons).toBeUndefined();
      }
    }
    expect(OPT_OUT_BUTTON.length).toBeLessThanOrEqual(25); // Meta-Grenze für Knopftexte
  });

  it("Texte nach Oles Prüfung: keine Gedankenstriche, kein STOPP-Satz, „Versicherungsberater“", () => {
    for (const p of Object.keys(SUGGESTED_TEMPLATE_TEXT) as NoticePurpose[]) {
      const t = SUGGESTED_TEMPLATE_TEXT[p];
      expect(t, p).not.toMatch(/[–—]/);
      expect(t, p).not.toContain("STOPP");
      expect(t, p).not.toContain("Allianz-Berater");
    }
    for (const p of ["campaign_cross_sell", "campaign_review", "campaign_renewal"] as const) expect(SUGGESTED_TEMPLATE_TEXT[p]).toContain("Ihr Versicherungsberater");
    expect(SUGGESTED_TEMPLATE_TEXT.followup_noshow).toBe(
      "Hallo {{1}}, schade, dass es mit unserem Termin nicht geklappt hat. Hier ist der digitale Assistent von [Berater]. Sollen wir einen neuen Termin finden? Antworte einfach hier.",
    );
    expect(SUGGESTED_TEMPLATE_TEXT.followup_last).toContain("Wenn nicht, ist das völlig in Ordnung, dann melden wir uns nicht weiter.");
    for (const p of Object.keys(TEMPLATE_BUTTONS) as NoticePurpose[]) expect(CAMPAIGN_PURPOSES).toContain(p);
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
