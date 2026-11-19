// Verkaufsstärkere Vorlagen v4 (Ole, 15.11.2026): Erstanschreiben je Produkt mit erster Frage und PDF im Kopf,
// Knöpfe und ihre Verarbeitung, Terminvorschläge, Selbstbezeichnung nach Status, A/B-Statistik. Ohne Datenbank.
import { describe, expect, it } from "vitest";
import { decideAbWinner, normalCdf, variantForKey, zTest } from "@/lib/whatsapp/ab-test";
import { ersteFrageKnoepfe, ersteFrageRegel, outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { knopfAktion, knopfHinweis, slotPayload } from "@/lib/whatsapp/knopf";
import { pickTwoSlots, slotLabel } from "@/lib/whatsapp/termin-vorschlaege";
import { buildTemplateRequest, categoryFor, metaTemplateProblems, requestShape, withoutHeader } from "@/lib/whatsapp/template-plan";
import {
  ERSTINFO_FOOTER, ERSTINFO_FOOTER_V8, ERSTINFO_FOOTER_V9,
  freitextButtonsOf,
  interactiveButtons,
  isCurrentTemplateName,
  rankTemplates,
  rolleText,
  TEMPLATE_BUTTONS,
  TEMPLATE_VERSION,
  templateComponents,
  templateVersionFor,
  variantOfName,
  templateAnspracheOf,
  templateVersionOfName,
} from "@/lib/whatsapp/templates";
import { shapeOfComponents } from "@/lib/whatsapp/dialog360";
import { inboundBody, inboundPayload } from "@/lib/whatsapp/gateway";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { empfehlungsThema } from "@/lib/empfehlung/shared";

describe("Erstanschreiben je Produkt", () => {
  it("Produkt aus dem Leadformular → Vorlage, Produktname und erste Frage", () => {
    expect(outreachProdukt("Katzenversicherung (TKV)")).toMatchObject({ purpose: "outreach_tkv", produkt: "Katzenversicherung", frage1: "Wie alt ist Ihre Katze?", frage1Du: "Wie alt ist deine Katze?", knoepfe: [] });
    expect(outreachProdukt("Hundekrankenversicherung")?.frage1).toBe("Wie alt ist Ihr Hund?");
    expect(outreachProdukt("Tierkrankenversicherung")?.frage1).toBe("Wie alt ist Ihr Tier?");
    expect(outreachProdukt("Hundekrankenversicherung")?.purpose).toBe("outreach_tkv");
    expect(outreachProdukt("Zahnzusatz")).toMatchObject({ purpose: "outreach_zahn", produkt: "Zahnzusatzversicherung" });
    expect(outreachProdukt("PKV Wechsel")).toMatchObject({ purpose: "outreach_pkv", produkt: "privaten Krankenversicherung" });
    expect(outreachProdukt("Privatschutz")).toMatchObject({ purpose: "outreach_privatschutz", produkt: "Privatschutz" });
    expect(outreachProdukt("Hausrat")?.purpose).toBe("outreach_privatschutz");
    // Tierhalter-Haftpflicht ist keine Tierkrankenversicherung, Sterbegeld hat keine eigene Frage
    expect(outreachProdukt("Hundehalter-Haftpflicht")?.purpose).not.toBe("outreach_tkv");
    expect(outreachProdukt("Sterbegeldversicherung")).toBeNull();
    expect(outreachProdukt(null)).toBeNull();
    // Knöpfe im Freitext = Knöpfe im Prompt, solange Frage 1 gestellt wird (Zahnzusatz neutral, Art. 9 DSGVO; Tier ohne)
    for (const s of ["TKV Katze", "Zahnzusatz", "PKV"]) {
      const p = outreachProdukt(s)!;
      expect(freitextButtonsOf(p.purpose)).toBeUndefined();
      expect(ersteFrageKnoepfe(s, [])).toEqual(p.knoepfe);
    }
    // Privatschutz öffnet ab v8 mit „schon versichert?“ (ohne Knöpfe; die Zwischenfrage danach hat Knöpfe)
    expect(ersteFrageKnoepfe("Privatschutz", [])).toEqual([]);
  });

  it("Assistent: Knopf-Antwort = Antwort auf Frage 1, dann Frage 2, dann Termine", () => {
    // Frageplan (Ole, 17.11.2026): die Frage aus dem tatsächlich gesendeten Erstanschreiben gilt
    const r = ersteFrageRegel("TKV Katze", "Susanne Meier", { gesendet: "Hallo Frau X, danke …\n\n*Wie alt ist Ihre Katze?*" });
    expect(r).toContain("Unsere erste WhatsApp hat gefragt: „Wie alt ist Ihre Katze?“");
    expect(r).toContain("ist die Antwort darauf");
    // Ältere freigegebene v4 (Frage nach dem Tier mit Knöpfen) im Verlauf: deren Frage gilt
    const alt = ersteFrageRegel("TKV Katze", "Susanne Meier", { gesendet: "Guten Tag Frau X, … Für welches Tier suchen Sie den Schutz?" });
    expect(alt).toContain("„Für welches Tier suchen Sie den Schutz?“ (Knöpfe „Hund“, „Katze“)");
    // Lead hat zuerst geschrieben: Frage 1 jetzt stellen, fett am Ende
    expect(ersteFrageRegel("TKV Katze", "Susanne", { jetzt: true, an: "du" })).toContain("(ohne Sternchen, nicht fett): Wie alt ist deine Katze?");
    expect(ersteFrageRegel(null, "Susanne", { jetzt: true })).toBe("");
    expect(r).toContain("Danach noch genau diese Frage: „Soll vor allem eine Operation abgesichert sein");
    expect(ersteFrageRegel(null, "Susanne Meier")).toContain("„Lieber schriftlich“");
    const agent = { systemPrompt: "", knowledge: "", personality: "" };
    const prompt = buildSystemPrompt(agent, "TKV Katze", {
      qualified: false,
      summary: null,
      contact: { name: "Julia Schneider", phone: "49170", email: null },
      upcoming: null,
      formAnswers: [],
      advisorName: "Susanne Meier",
      aiDisclosed: true,
      ersteFrage: r,
      hint: "Der Lead hat per Knopf …",
    });
    expect(prompt).toContain("Fragen vor dem Termin (Frageplan");
    // „Vor dem Termin: Das Formular reicht“ (TKV) entfällt, wenn die erste Frage schon gestellt ist
    expect(prompt).not.toContain("Das Formular reicht");
    expect(prompt).toContain("Zur letzten Nachricht des Leads (hat Vorrang):\nDer Lead hat per Knopf …");
  });
});

describe("Dokument-Kopf (Erstinformation als PDF) und Antrag", () => {
  const pdf = "https://app.example.de/erstinformation/abc123/pdf";
  it("Erstanschreiben mit Kopf DOCUMENT, Beispiel-Link und Fußzeile; ohne Beispiel ohne Kopf", () => {
    const req = buildTemplateRequest("outreach_tkv", "Anid Brand", TEMPLATE_VERSION, "sie", { documentExample: pdf });
    const comps = req.components as { type: string; format?: string; example?: { header_handle: string[] }; text?: string }[];
    expect(comps.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER"]);
    expect(comps[0]).toEqual({ type: "HEADER", format: "DOCUMENT", example: { header_handle: [pdf] } });
    expect(comps[2].text).toBe(ERSTINFO_FOOTER_V9);
    expect(ERSTINFO_FOOTER.length).toBeLessThanOrEqual(60);
    expect(ERSTINFO_FOOTER_V8.length).toBeLessThanOrEqual(60);
    expect(ERSTINFO_FOOTER_V9.length).toBeLessThanOrEqual(60);
    expect(requestShape(req)).toEqual({ headerFormat: "DOCUMENT", buttons: [] });
    const plain = withoutHeader(req);
    expect((plain.components as { type: string }[]).map((c) => c.type)).toEqual(["BODY"]);
    const zahn = buildTemplateRequest("outreach_zahn", "Anid Brand", TEMPLATE_VERSION, "sie", { documentExample: pdf });
    // ab v6 ohne Knöpfe in der Vorlage (erste Frage als Platzhalter)
    expect((zahn.components as { type: string }[]).map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER"]);
    const ohneKopf = buildTemplateRequest("outreach_zahn", "Anid Brand", TEMPLATE_VERSION, "sie", { documentExample: pdf, kopf: false });
    expect((ohneKopf.components as { type: string }[]).map((c) => c.type)).toEqual(["BODY"]);
    expect(ohneKopf.name).toBe("pg_outreach_zahn_v9_ohnepdf_sie");
    expect(requestShape(plain).headerFormat).toBeNull();
    // Andere Zwecke bekommen nie einen Kopf
    const rem = buildTemplateRequest("reminder", "Anid Brand", TEMPLATE_VERSION, "sie", { documentExample: pdf });
    expect(requestShape(rem).headerFormat).toBeNull();
    const body = (req.components as { type: string; text?: string; example?: { body_text: string[][] } }[]).find((c) => c.type === "BODY")!;
    expect(metaTemplateProblems(body.text!, body.example!.body_text[0])).toEqual([]);
  });

  it("Senden: Kopf mit PDF-Link, Parameter, Knopf-Payloads nur passend zur Vorlage", () => {
    const c = templateComponents({ params: ["Frau Schneider", "Katzenversicherung"], document: { link: pdf, filename: "Erstinformation.pdf" }, buttonPayloads: null, buttonCount: 2 });
    expect(c).toEqual([
      { type: "header", parameters: [{ type: "document", document: { link: pdf, filename: "Erstinformation.pdf" } }] },
      { type: "body", parameters: [{ type: "text", text: "Frau Schneider" }, { type: "text", text: "Katzenversicherung" }] },
    ]);
    const f = templateComponents({ params: ["Julia"], buttonPayloads: ["slot:a", "slot:b", "andere_zeit"], buttonCount: 3 })!;
    expect(f).toHaveLength(4);
    expect(f[1]).toEqual({ type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "slot:a" }] });
    // Ältere Vorlage ohne Knöpfe: keine Payloads (Meta würde ablehnen)
    expect(templateComponents({ params: ["Julia"], buttonPayloads: ["slot:a", "slot:b", "x"], buttonCount: 0 })).toHaveLength(1);
    expect(templateComponents({ params: [] })).toBeUndefined();
  });

  it("Kopf und Knöpfe aus der Vorlagenliste von 360dialog lesen", () => {
    expect(shapeOfComponents([{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Hund" }] }])).toEqual({ headerFormat: "DOCUMENT", buttons: ["Hund"] });
    expect(shapeOfComponents([{ type: "BODY", text: "x" }])).toEqual({ headerFormat: null, buttons: [] });
    expect(shapeOfComponents(undefined)).toBeUndefined();
  });

  it("Kategorien: Termine UTILITY, Erstanschreiben und Nachfassen MARKETING", () => {
    for (const p of ["booking_confirmation", "reminder", "reminder_soon", "reschedule"] as const) expect(categoryFor(p)).toBe("UTILITY");
    for (const p of ["outreach", "outreach_tkv", "followup", "followup_last", "campaign_cross_sell", "referral_request"] as const) expect(categoryFor(p)).toBe("MARKETING");
  });
});

describe("Versionen und A/B-Fassungen bei der Auswahl", () => {
  const k = { firstName: "Julia", lastName: "Schneider", salutation: "Frau" };
  const v3 = { name: "pg_outreach_v3_sie", body: "Guten Tag {{1}}, alt {{2}} ok?", headerFormat: null };
  const v4 = { name: "pg_outreach_v4_sie", body: "Guten Tag {{1}}, neu ok?", headerFormat: "DOCUMENT" };
  const v5 = { name: "pg_outreach_v5_sie", body: "Hallo {{1}}, danke ok?", headerFormat: "DOCUMENT" };
  const v5ohne = { name: "pg_outreach_v5_sie_ohne_name", body: "Hallo, danke ok?", headerFormat: "DOCUMENT" };
  const lA = { name: "pg_followup_last_v5_sie", body: "Guten Tag {{1}}, A ok?", headerFormat: null };
  const lB = { name: "pg_followup_last_v5_b_sie", body: "Guten Tag {{1}}, B ok?", headerFormat: null };

  it("Erstanschreiben v9, übrige v4, unveränderte Zwecke behalten v3", () => {
    expect(TEMPLATE_VERSION).toBe("v4");
    expect(templateVersionFor("review_request")).toBe("v3");
    expect(templateVersionFor("outreach_tkv")).toBe("v9");
    expect(isCurrentTemplateName("pg_outreach_v9_sie", "outreach")).toBe(true);
    expect(isCurrentTemplateName("pg_outreach_v8_sie", "outreach")).toBe(false);
    expect(isCurrentTemplateName("pg_outreach_v7_sie", "outreach")).toBe(false);
    expect(isCurrentTemplateName("pg_outreach_v6_sie", "outreach")).toBe(false);
    expect(isCurrentTemplateName("pg_outreach_v5_sie", "outreach")).toBe(false);
    expect(isCurrentTemplateName("pg_outreach_v4_sie", "outreach")).toBe(false);
    // „outreach_tkv“ ist ein eigener Zweck, nicht die aktuelle Fassung von „outreach“
    expect(isCurrentTemplateName("pg_outreach_tkv_v5_sie", "outreach")).toBe(false);
    expect(variantOfName("pg_outreach_tkv_v4_b_sie_ohne_name_r2")).toBe("b");
    expect(variantOfName("pg_outreach_tkv_v4_sie")).toBe("a");
  });

  it("bis zur Freigabe von v6 bleibt die neueste ältere (v5, v4 bzw. v3) im Einsatz; ohne PDF keine Vorlage mit Kopf", () => {
    expect(rankTemplates([v3, v4, v5], "outreach", "sie", k)).toMatchObject({ tpl: { name: "pg_outreach_v5_sie" }, current: false });
    expect(rankTemplates([v3, v4], "outreach", "sie", k)).toMatchObject({ tpl: { name: "pg_outreach_v4_sie" }, current: false });
    expect(rankTemplates([v3], "outreach", "sie", k)).toMatchObject({ tpl: { name: "pg_outreach_v3_sie" }, current: false });
    expect(rankTemplates([v3, v4], "outreach", "sie", k, { documentHeader: false })?.tpl.name).toBe("pg_outreach_v3_sie");
    expect(rankTemplates([v4, v5], "outreach", "sie", k, { documentHeader: false })).toBeNull();
  });

  it("v5 Sie „Hallo {{1}},“: {{1}} = „Frau Schneider“; ohne Nachnamen die Fassung „Hallo,“", () => {
    const r = rankTemplates([v4, v5, v5ohne], "outreach", "sie", k)!;
    expect(r.tpl.name).toBe("pg_outreach_v5_sie");
    expect(r.params([])).toEqual(["Frau Schneider"]);
    const ohne = rankTemplates([v4, v5, v5ohne], "outreach", "sie", { firstName: "Julia" })!;
    expect(ohne.tpl.name).toBe("pg_outreach_v5_sie_ohne_name");
    expect(ohne.params([])).toEqual([]);
    expect(templateAnspracheOf(v5)).toBe("sie");
    expect(templateAnspracheOf({ name: "pg_outreach_v5", body: "Hallo {{1}}, danke" })).toBe("du");
    expect(templateVersionOfName("pg_outreach_tkv_v5_b_sie_r2")).toBe(5);
    expect(templateVersionOfName("eigene_vorlage")).toBe(0);
  });

  it("gewünschte A/B-Fassung zuerst, sonst die andere aktuelle", () => {
    expect(rankTemplates([lA, lB], "followup_last", "sie", k, { variant: "b" })).toMatchObject({ tpl: { name: lB.name }, variant: "b" });
    expect(rankTemplates([lA, lB], "followup_last", "sie", k, { variant: "a" })).toMatchObject({ tpl: { name: lA.name }, variant: "a" });
    expect(rankTemplates([lA], "followup_last", "sie", k, { variant: "b" })).toMatchObject({ tpl: { name: lA.name }, variant: "a" });
  });

  it("interaktive Knöpfe im offenen Fenster nur, wenn WhatsApp sie erlaubt (höchstens 3, je 20 Zeichen)", () => {
    expect(interactiveButtons(TEMPLATE_BUTTONS.reminder)).toEqual(["Ja, passt", "Bitte verschieben"]);
    expect(interactiveButtons(TEMPLATE_BUTTONS.campaign_cross_sell)).toBeNull(); // „Keine Nachrichten mehr“ ist zu lang
    expect(interactiveButtons([])).toBeNull();
    expect(interactiveButtons(undefined)).toBeNull();
  });
});

describe("Selbstbezeichnung nach Status (Erstinformation)", () => {
  it("Ausschließlichkeitsvertreter: Name und Gesellschaft; nie „Versicherungsberater“", () => {
    expect(rolleText("vertreter", ["Allianz"])).toBe(" von der Allianz");
    expect(rolleText("vertreter", ["die Allianz Versicherungs-AG"])).toBe(" von der Allianz Versicherungs-AG");
    expect(rolleText("vertreter", ["LVM Versicherungsverein"])).toBe(" vom LVM Versicherungsverein");
    expect(rolleText("vertreter", [])).toBe(", Ihr Versicherungsvertreter");
    expect(rolleText("mehrfachvertreter", ["A", "B"])).toBe(", Ihr Versicherungsvertreter");
    expect(rolleText("makler")).toBe(", Ihr Versicherungsmakler");
    expect(rolleText(null)).toBe(", Ihr Versicherungsvermittler");
    for (const s of ["vertreter", "mehrfachvertreter", "makler", null]) expect(rolleText(s, ["Allianz"])).not.toContain("Versicherungsberater");
  });
});

describe("Knopf-Antworten", () => {
  it("nur echte Klicks zählen; Bedeutung je Knopf", () => {
    expect(knopfAktion("text", "Nein, danke")).toBeNull();
    expect(knopfAktion("button", "Nein, danke")).toEqual({ aktion: "kein_bedarf" });
    expect(knopfAktion("button", "Kein Bedarf mehr")).toEqual({ aktion: "kein_bedarf" });
    expect(knopfAktion("button", "Ja, passt")).toEqual({ aktion: "bestaetigt" });
    expect(knopfAktion("interactive", "Bitte verschieben")).toEqual({ aktion: "verschieben" });
    expect(knopfAktion("button", "Termin verschieben")).toEqual({ aktion: "verschieben" });
    expect(knopfAktion("button", "Ja, neuer Termin")).toEqual({ aktion: "neuer_termin" });
    expect(knopfAktion("button", "Andere Zeit", "andere_zeit")).toEqual({ aktion: "andere_zeit" });
    expect(knopfAktion("button", "Eher der Beitrag")).toEqual({ aktion: "angebot", fokus: "beitrag" });
    const iso = "2026-11-17T09:00:00.000Z";
    expect(knopfAktion("button", "Erste Zeit passt", slotPayload(iso))).toEqual({ aktion: "zeit", start: iso });
    expect(knopfAktion("button", "Erste Zeit passt", "slot:kaputt")).toEqual({ aktion: "zeit", start: null });
    expect(knopfAktion("button", "Erste Zeit passt")).toEqual({ aktion: "zeit", start: null });
    // Antworten auf die erste Frage und „Kein Bedarf“ der Kampagnen gehen normal weiter
    expect(knopfAktion("button", "Katze")).toBeNull();
    expect(knopfAktion("button", "Kein Bedarf")).toBeNull();
  });

  it("Hinweise an den Assistenten: genaue Startzeit, keine Beträge", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const t = knopfHinweis({ aktion: "zeit", start: "2026-11-17T09:00:00.000Z" }, now)!;
    expect(t).toContain("start=2026-11-17T09:00:00.000Z");
    expect(t).toContain("Dienstag, 17.11., 10:00 Uhr");
    expect(knopfHinweis({ aktion: "zeit", start: "2026-11-15T10:05:00.000Z" }, now)).toContain("frische Zeiten");
    expect(knopfHinweis({ aktion: "angebot", fokus: "beitrag" }, now)).toContain("Nenne keine Beträge");
    expect(knopfHinweis({ aktion: "bestaetigt" }, now)).toBeNull();
  });

  it("Payload aus dem Webhook (Vorlage und interaktiv)", () => {
    expect(inboundPayload({ type: "button", button: { text: "Erste Zeit passt", payload: "slot:x" } })).toBe("slot:x");
    expect(inboundPayload({ type: "interactive", interactive: { button_reply: { id: "slot:y", title: "Zweite Zeit passt" } } })).toBe("slot:y");
    expect(inboundBody({ type: "interactive", interactive: { button_reply: { id: "slot:y", title: "Zweite Zeit passt" } } })).toBe("Zweite Zeit passt");
    expect(inboundPayload({ type: "text", text: { body: "Hallo" } })).toBeNull();
  });
});

describe("Terminvorschläge", () => {
  it("frühester Termin und frühester an einem anderen Tag", () => {
    const s = (iso: string) => ({ start: iso });
    expect(pickTwoSlots([s("2026-11-17T09:00:00Z"), s("2026-11-17T13:00:00Z"), s("2026-11-18T09:00:00Z")])?.map((x) => x.start)).toEqual(["2026-11-17T09:00:00Z", "2026-11-18T09:00:00Z"]);
    expect(pickTwoSlots([s("2026-11-17T09:00:00Z"), s("2026-11-17T13:00:00Z")])?.map((x) => x.start)).toEqual(["2026-11-17T09:00:00Z", "2026-11-17T13:00:00Z"]);
    expect(pickTwoSlots([s("2026-11-17T09:00:00Z")])).toBeNull();
    expect(slotLabel("2026-11-17T09:00:00Z")).toBe("Di., 17.11. um 10:00 Uhr");
  });
});

describe("Empfehlung mit Thema", () => {
  it("Thema aus dem Produkt", () => {
    expect(empfehlungsThema("Katzenversicherung (TKV)")).toBe("Tierversicherung");
    expect(empfehlungsThema("Privatschutz")).toBe("Privatschutz");
    expect(empfehlungsThema("Bestandskunde")).toBe("Absicherung");
    expect(empfehlungsThema("KFZ")).toBe("KFZ");
    expect(empfehlungsThema(null)).toBe("Absicherung");
  });
});

describe("A/B-Test: Statistik und Entscheidung", () => {
  it("Normalverteilung", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
  });

  it("z-Test für zwei Anteile (gepoolt, zweiseitig)", () => {
    // 30/100 gegen 45/100: z ≈ 2,19, p ≈ 0,028
    const t = zTest({ sent: 100, replied: 30 }, { sent: 100, replied: 45 });
    expect(t.z).toBeCloseTo(2.19, 2);
    expect(t.p).toBeCloseTo(0.0285, 3);
    expect(zTest({ sent: 100, replied: 45 }, { sent: 100, replied: 30 }).z).toBeCloseTo(-2.19, 2);
    expect(zTest({ sent: 0, replied: 0 }, { sent: 10, replied: 5 }).p).toBe(1);
    expect(zTest({ sent: 50, replied: 0 }, { sent: 50, replied: 0 }).p).toBe(1);
  });

  it("Gewinner erst ab 50 je Fassung und p < 0,05", () => {
    expect(decideAbWinner({ a: { sent: 49, replied: 5 }, b: { sent: 200, replied: 150 } })).toMatchObject({ winner: null, reason: "zu_wenig" });
    expect(decideAbWinner({ a: { sent: 100, replied: 30 }, b: { sent: 100, replied: 33 } })).toMatchObject({ winner: null, reason: "kein_unterschied" });
    // Signifikant genug (Ole, 19.11.2026): p unter 0,01; 30 % gegen 45 % bei je 100 (p ≈ 0,03) reicht nicht mehr
    expect(decideAbWinner({ a: { sent: 100, replied: 30 }, b: { sent: 100, replied: 45 } })).toMatchObject({ winner: null, reason: "kein_unterschied" });
    expect(decideAbWinner({ a: { sent: 200, replied: 60 }, b: { sent: 200, replied: 95 } })).toMatchObject({ winner: "b", reason: "entschieden" });
    expect(decideAbWinner({ a: { sent: 60, replied: 40 }, b: { sent: 60, replied: 20 } })).toMatchObject({ winner: "a" });
    // Zu wenige Treffer bzw. Nicht-Treffer je Fassung: keine Entscheidung, auch wenn der Unterschied riesig aussieht
    expect(decideAbWinner({ a: { sent: 30, replied: 0 }, b: { sent: 30, replied: 30 } }, { min: 20 })).toMatchObject({ winner: null, reason: "zu_wenig" });
    expect(decideAbWinner({ a: { sent: 100, replied: 0 }, b: { sent: 100, replied: 8 } })).toMatchObject({ winner: null, reason: "zu_wenig" });
  });

  it("Zuteilung fest je Lead und etwa hälftig", () => {
    expect(variantForKey("outreach_tkv", "lead1")).toBe(variantForKey("outreach_tkv", "lead1"));
    let b = 0;
    for (let i = 0; i < 2000; i++) if (variantForKey("outreach_tkv", `lead-${i}`) === "b") b++;
    expect(b).toBeGreaterThan(900);
    expect(b).toBeLessThan(1100);
  });

  it("Zuteilung je Vorlage unabhängig (nicht nur Parität der Zeichen, Korrektur 19.11.2026)", () => {
    let gleich = 0;
    for (let i = 0; i < 2000; i++) if (variantForKey("outreach_tkv", `lead-${i}`) === variantForKey("outreach_zahn", `lead-${i}`)) gleich++;
    // gekoppelt wären es 0 oder 2000; unabhängig etwa die Hälfte
    expect(gleich).toBeGreaterThan(900);
    expect(gleich).toBeLessThan(1100);
    // Zeichen mit gleicher Parität vertauscht: früher immer dieselbe Fassung
    const vs = new Set(["ab", "ba", "cd", "dc", "ef", "fe", "gh", "hg"].map((k) => variantForKey("outreach_tkv", k)));
    expect(vs.size).toBe(2);
  });
});
