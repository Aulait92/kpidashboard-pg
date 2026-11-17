import { describe, expect, it } from "vitest";
import { a, anredeName, anredeZeile, asAnsprache, begruessung, kontaktParts, salutationFromForm, salutationOf, type Ansprache } from "@/lib/ansprache";
import {
  buildTemplateRequest,
  exampleValuesFor,
  isTemplateRevisionOf,
  metaTemplateProblems,
  plannedTemplates,
  previewBodyFor,
  purposesFor,
  templateBodyFor,
  templateNameFor,
  templateNamesOf,
} from "@/lib/whatsapp/template-plan";
import {
  formsFor,
  isSieTemplateName,
  nameSlotOf,
  noticeText,
  rankTemplates,
  renderTemplate,
  SIE_TEMPLATE_TEXT,
  SUGGESTED_TEMPLATE_TEXT,
  TEMPLATE_BODY,
  TEMPLATE_BODY_B,
  rolleText,
  templateParams,
  templateTextFor,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { campaignText } from "@/lib/bestand/campaigns";
import { renderText, OCCASIONS } from "@/lib/empfehlung/shared";
import { werteFuer, fuelle } from "@/lib/mail/platzhalter";
import { customerEventDescription } from "@/lib/whatsapp/event-text";
import { content } from "@/lib/calendar/lead-email";
import { greetingFor } from "@/lib/vertrieb/followup";
import { advisorPerson, firmDisplayName, personFromCustomerName } from "@/lib/advisor-name";

// Vier Kontakte: mit/ohne Anrede × mit/ohne Nachnamen
const FRAU = { firstName: "Julia", lastName: "Schneider", salutation: "Frau" };
const OHNE_ANREDE = { fullName: "Julia Schneider" };
const NUR_VORNAME_FRAU = { fullName: "Julia", salutation: "weiblich" };
const NUR_VORNAME = { fullName: "Julia" };

describe("Anrede-Zeile (Ole, 14.11.2026)", () => {
  it("Sie: Frau/Herr mit Nachnamen, sonst voller Name, ohne Nachnamen „Guten Tag,“", () => {
    expect(anredeZeile("sie", FRAU)).toBe("Guten Tag Frau Schneider,");
    expect(anredeZeile("sie", { fullName: "Peter Schneider", salutation: "Herr" })).toBe("Guten Tag Herr Schneider,");
    expect(anredeZeile("sie", OHNE_ANREDE)).toBe("Guten Tag Julia Schneider,");
    expect(anredeZeile("sie", NUR_VORNAME_FRAU)).toBe("Guten Tag,");
    expect(anredeZeile("sie", NUR_VORNAME)).toBe("Guten Tag,");
    expect(anredeZeile("sie", null)).toBe("Guten Tag,");
  });

  it("Du: „Hallo Vorname,“, mit und ohne Anrede bzw. Nachnamen", () => {
    expect(anredeZeile("du", FRAU)).toBe("Hallo Julia,");
    expect(anredeZeile("du", OHNE_ANREDE)).toBe("Hallo Julia,");
    expect(anredeZeile("du", NUR_VORNAME_FRAU)).toBe("Hallo Julia,");
    expect(anredeZeile("du", NUR_VORNAME)).toBe("Hallo Julia,");
    expect(anredeZeile("du", {})).toBe("Hallo,");
  });

  it("Anrede wird nicht aus dem Vornamen geraten", () => {
    expect(anredeName("sie", { fullName: "Maria Schneider" })).toBe("Maria Schneider");
    expect(anredeName("sie", { fullName: "Peter Meier" })).toBe("Peter Meier");
  });

  it("Herr/Frau robust aus Formularwerten; divers und Unbekanntes → unbekannt", () => {
    for (const v of ["Herr", "herr", "Hr.", "männlich", "maennlich", "m", "M", "Mr", "Mr.", "male"]) expect(salutationOf(v), v).toBe("Herr");
    for (const v of ["Frau", "frau", "Fr.", "weiblich", "w", "W", "f", "Mrs", "Mrs.", "Ms", "female"]) expect(salutationOf(v), v).toBe("Frau");
    for (const v of ["divers", "d", "Divers", "keine Angabe", "", null, undefined, 3, "Firma"]) expect(salutationOf(v), String(v)).toBeNull();
  });

  it("Anrede aus Lead.formData: nur passende Felder (nicht „Geschlecht (Tier)“)", () => {
    expect(salutationFromForm([{ label: "Anrede", value: "Frau" }])).toBe("Frau");
    expect(salutationFromForm([{ label: "Geschlecht", value: "männlich" }])).toBe("Herr");
    expect(salutationFromForm([{ label: "Geschlecht (Tier)", value: "weiblich" }])).toBeNull();
    expect(salutationFromForm([{ label: "Anrede", value: "divers" }])).toBeNull();
    expect(salutationFromForm(null)).toBeNull();
  });

  it("Namensteile: Zusätze, „Frau Schneider“ im Namensfeld, getrennte Felder", () => {
    expect(kontaktParts({ fullName: "Anna von Schneider" }).last).toBe("von Schneider");
    expect(anredeZeile("sie", { fullName: "Frau Schneider" })).toBe("Guten Tag Frau Schneider,");
    expect(anredeZeile("sie", { fullName: "Herr Peter Schneider" })).toBe("Guten Tag Herr Schneider,");
    expect(anredeZeile("du", { fullName: "Frau Schneider" })).toBe("Hallo,");
    expect(anredeZeile("sie", { firstName: "Julia", lastName: "Schneider" })).toBe("Guten Tag Julia Schneider,");
    expect(begruessung("sie", "Anna Beispiel")).toBe("Guten Tag Anna Beispiel");
    expect(begruessung("sie", "Anna")).toBe("Guten Tag");
    expect(begruessung("du", "Anna Beispiel")).toBe("Hallo Anna");
    expect(asAnsprache(undefined)).toBe("sie");
    expect(a("sie", "dich", "Sie")).toBe("Sie");
  });
});

const ALL = purposesFor({ bestand: true, empfehlung: true });

describe("Meta-Vorlagen: Fassungen, Namen, Regeln", () => {
  it("je Zweck alle Fassungen: Du, Sie, Sie ohne Namen (Kampagnen/Empfehlungen nur Sie)", () => {
    expect(formsFor("outreach")).toEqual(["du", "sie", "sie_ohne_name"]);
    expect(formsFor("campaign_review")).toEqual(["sie", "sie_ohne_name"]);
    const names = plannedTemplates(purposesFor({ bestand: false })).map((t) => templateNameFor(t.purpose, "v2", t.form, t.variant, t.kopf));
    // 16 Zwecke je 3 Fassungen (inkl. Show-up: 15 Min., Wartet), dazu A/B-Fassung b für followup_last; Erstanschreiben ab v7 nur mit PDF-Kopf
    expect(names).toHaveLength(51);
    expect(names.some((n) => n.includes("ohnepdf"))).toBe(false);
    expect(names).toContain("pg_followup_last_v2_b_sie");
    expect(names).toContain("pg_outreach_v2");
    expect(names).toContain("pg_outreach_v2_sie");
    expect(names).toContain("pg_outreach_v2_sie_ohne_name");
    expect(new Set(names).size).toBe(names.length);
  });

  it("Texte: Du „Hallo {{1}},“, Sie „Guten Tag {{1}},“, ohne Namen „Guten Tag,“ mit nachgerückten Platzhaltern", () => {
    expect(templateTextFor("booking_confirmation", "du")).toMatch(/^Hallo \{\{1\}\}, dein Termin bei \[Firma\] ist bestätigt: \{\{2\}\} \(\{\{3\}\}\)\. \{\{4\}\}/);
    expect(templateTextFor("booking_confirmation", "sie")).toMatch(/^Guten Tag \{\{1\}\}, Ihr Termin bei \[Firma\] ist bestätigt: \{\{2\}\}/);
    expect(templateTextFor("booking_confirmation", "sie_ohne_name")).toMatch(/^Guten Tag, Ihr Termin bei \[Firma\] ist bestätigt: \{\{1\}\} \(\{\{2\}\}\)\. \{\{3\}\}/);
    // Erstanschreiben v8: „Hallo“ auch gesiezt, Thema fest, Vermittler {{2}}, erste Frage {{3}} fett mit festem „?“
    expect(templateTextFor("outreach_tkv", "sie_ohne_name")).toBe("Hallo, danke für Ihre Anfrage zur Tierkrankenversicherung! Hier schreibt der digitale Assistent von {{1}}.\n\n*{{2}}?*");
    expect(templateTextFor("outreach_tkv", "sie")).toMatch(/^Hallo \{\{1\}\}, danke für Ihre Anfrage zur Tierkrankenversicherung! /);
    expect(templateTextFor("outreach_tkv", "du")).toMatch(/^Hallo \{\{1\}\}, danke für deine Anfrage zur Tierkrankenversicherung![\s\S]*\n\n\*\{\{3\}\}\?\*$/);
    expect(templateTextFor("outreach", "sie")).not.toMatch(/Erstinformation|Später|kurz Zeit/);
    expect(SIE_TEMPLATE_TEXT.outreach).toBe(templateTextFor("outreach", "sie"));
  });

  it("alle Fassungen erfüllen Metas Regeln (kein Platzhalter am Anfang/Ende, keine leeren Beispiele, fortlaufend)", () => {
    for (const { purpose, form, variant } of plannedTemplates(ALL)) {
      const req = buildTemplateRequest(purpose, templateNamesOf("Agentur Susanne Meier"), "v2", form, { variant });
      const body = req.components[0] as { text: string; example?: { body_text: string[][] } };
      const examples = body.example?.body_text[0] ?? [];
      expect(metaTemplateProblems(body.text, examples), `${req.name}: ${body.text}`).toEqual([]);
      expect(body.text).not.toMatch(/\[(Firma|Berater|Rolle)\]/);
      expect(req.name).toMatch(/^[a-z0-9_]+$/);
    }
    // Die Prüfung selbst schlägt an
    expect(metaTemplateProblems("{{1}}, hallo", ["x"])).toContain("Platzhalter am Anfang");
    expect(metaTemplateProblems("Hallo {{1}}", ["x"])).toContain("Platzhalter am Ende");
    expect(metaTemplateProblems("Hallo {{1}} und {{3}}.", ["x", "y"])).toContain("Platzhalter nicht fortlaufend ab {{1}}");
    expect(metaTemplateProblems("Guten Tag {{1}}, ok.", [""])).toContain("leerer Beispielwert");
  });

  it("Sie-Fassungen siezen, Du-Fassungen duzen; keine Gedankenstriche", () => {
    for (const set of [TEMPLATE_BODY, TEMPLATE_BODY_B]) {
      for (const [p, b] of Object.entries(set) as [NoticePurpose, { du?: string; sie: string }][]) {
        expect(b.sie, p).not.toMatch(/\b(du|dich|dir|dein|deine|deinen)\b/i);
        expect(b.sie, p).not.toMatch(/[–—]/);
        if (b.du) expect(b.du, p).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre)\b/);
        if (b.du) expect(b.du, p).not.toMatch(/[–—]/);
      }
    }
    for (const t of Object.values(SUGGESTED_TEMPLATE_TEXT)) expect(t).not.toMatch(/[–—]/);
  });

  it("Firma und Berater getrennt: „Buchung bei Agentur Susanne Meier“, „hier ist Susanne Meier“", () => {
    const names = templateNamesOf("Agentur Susanne Meier");
    expect(names).toMatchObject({ firm: "Agentur Susanne Meier", advisor: "Susanne Meier", kurz: "Agentur Susanne Meier" });
    expect(templateBodyFor("booking_confirmation", names, "sie")).toContain("Ihr Termin bei Agentur Susanne Meier ist bestätigt");
    expect(templateBodyFor("followup_nudge", names, "du")).toContain("digitale KI-Assistent von Agentur Susanne Meier");
    // Erstanschreiben v8: Vermittler als Platzhalter; in der Vorschau der Name des Kunden (Du: Vorname laut Profil, Sie mit
    // Anrede „Frau Meier“, ohne Anrede Vor- und Nachname)
    expect(templateBodyFor("outreach", names, "du")).toContain("digitale Assistent von {{2}}.");
    expect(previewBodyFor("outreach", templateNamesOf("Agentur Susanne Meier", undefined, "Susanne Meier"), "du")).toContain("digitale Assistent von Susanne.");
    expect(previewBodyFor("outreach", names, "sie")).toContain("digitale Assistent von Susanne Meier.");
    expect(previewBodyFor("outreach", templateNamesOf("Agentur Susanne Meier", undefined, "Susanne Meier", "Frau"), "sie")).toContain("digitale Assistent von Frau Meier.");
    // Ohne Status neutral, sonst nach Erstinformation (rolleText)
    expect(templateBodyFor("campaign_review", names, "sie")).toContain("hier ist Susanne Meier, Ihr Versicherungsvermittler.");
    expect(templateBodyFor("campaign_review", templateNamesOf("Agentur Susanne Meier", rolleText("vertreter", ["Allianz"])), "sie")).toContain("hier ist Susanne Meier von der Allianz.");
    expect(templateBodyFor("campaign_review", names, "sie")).not.toContain("Versicherungsberater");
    expect(templateNamesOf("Allianz Anid Brand")).toMatchObject({ firm: "Anid Brand", advisor: "Anid Brand", kurz: "Anid Brand" });
    expect(personFromCustomerName("Allianz Generalvertretung Meier")).toBe("Generalvertretung Meier");
    expect(advisorPerson("Agentur Susanne Meier", "Tom Berater")).toBe("Tom Berater");
    expect(advisorPerson("Agentur Susanne Meier", null)).toBe("Susanne Meier");
    expect(firmDisplayName("Allianz Agentur Meier")).toBe("Agentur Meier");
  });

  it("Namen: Sie-Fassungen erkennbar, Revisionen getrennt", () => {
    expect(isSieTemplateName("pg_outreach_v2_sie")).toBe(true);
    expect(isSieTemplateName("pg_outreach_v2_sie_ohne_name_r2")).toBe(true);
    expect(isSieTemplateName("pg_outreach_v1_sie_r2")).toBe(true);
    expect(isSieTemplateName("pg_outreach_v2_r2")).toBe(false);
    expect(isTemplateRevisionOf("pg_outreach_v2_r3", "pg_outreach_v2")).toBe(true);
    expect(isTemplateRevisionOf("pg_outreach_v2_sie", "pg_outreach_v2")).toBe(false);
    expect(isTemplateRevisionOf("pg_outreach_v2_sie_ohne_name", "pg_outreach_v2_sie")).toBe(false);
  });
});

describe("Vorschau auf der Seite WhatsApp-Vorlagen", () => {
  const names = templateNamesOf("Agentur Susanne Meier");
  it("Sie: Erstanschreiben „Hallo Frau Schneider, danke für Ihre Anfrage!“ (nicht „Hallo Julia“), sonst „Guten Tag“", () => {
    const t = previewBodyFor("outreach", names, "sie");
    expect(t.startsWith("Hallo Frau Schneider, danke für Ihre Anfrage! Hier schreibt")).toBe(true);
    expect(t).not.toContain("Julia");
    expect(previewBodyFor("booking_confirmation", names, "sie")).toContain("Guten Tag Frau Schneider, Ihr Termin bei Agentur Susanne Meier ist bestätigt");
    expect(previewBodyFor("booking_confirmation", names, "sie")).toContain("Wir rufen Sie unter Ihrer Nummer an.");
  });
  it("Du: „Hallo Julia, danke für deine Anfrage!“", () => {
    expect(previewBodyFor("outreach", names, "du").startsWith("Hallo Julia, danke für deine Anfrage! Hier schreibt")).toBe(true);
    // Kampagnen siezen immer, auch bei „Du“
    expect(previewBodyFor("campaign_review", names, "du").startsWith("Guten Tag Frau Schneider, hier ist Susanne Meier")).toBe(true);
    expect(exampleValuesFor("outreach", "sie")).toEqual(["Frau Schneider", "Herrn Schmidt", "Wann erreicht Herr Schmidt Sie am besten für ein kurzes Telefonat"]);
    expect(exampleValuesFor("outreach_tkv", "sie")).toEqual(["Frau Schneider", "Herrn Schmidt", "Wie alt ist Ihre Katze"]);
    expect(exampleValuesFor("outreach_tkv", "du")).toEqual(["Julia", "Thomas", "Wie alt ist deine Katze"]);
    expect(exampleValuesFor("outreach_pkv", "sie_ohne_name")).toEqual(["Herrn Schmidt", "Wie sind Sie aktuell beruflich aufgestellt"]);
  });
});

describe("Vorlage wählen und Parameter setzen", () => {
  const v1du = { name: "pg_booking_confirmation_v1", body: "Hallo {{1}}, vielen Dank für deine Buchung bei X. Dein Termin ist bestätigt: {{2}} ({{3}}). {{4}} Wir freuen uns!" };
  const v1sie = { name: "pg_booking_confirmation_v1_sie", body: "Hallo {{1}}, vielen Dank für Ihre Buchung bei X. Ihr Termin ist bestätigt: {{2}} ({{3}}). {{4}} Wir freuen uns!" };
  const v2du = { name: "pg_booking_confirmation_v2", body: templateBodyFor("booking_confirmation", "X", "du") };
  const v2sie = { name: "pg_booking_confirmation_v2_sie", body: templateBodyFor("booking_confirmation", "X", "sie") };
  const v2ohne = { name: "pg_booking_confirmation_v2_sie_ohne_name", body: templateBodyFor("booking_confirmation", "X", "sie_ohne_name") };
  const rest = ["Mo., 10:00 Uhr", "Telefonat", "Wir rufen Sie an."];
  const send = (list: { name: string; body: string }[], an: Ansprache, k: Parameters<typeof rankTemplates>[3]) => {
    const r = rankTemplates(list, "booking_confirmation", an, k);
    return r ? { name: r.tpl.name, text: renderTemplate(r.tpl.body, r.params(rest)) } : null;
  };

  it("Sie-Kunde mit Anrede und Nachnamen → „Guten Tag Frau Schneider“", () => {
    const r = send([v1du, v1sie, v2du, v2sie, v2ohne], "sie", FRAU)!;
    expect(r.name).toBe("pg_booking_confirmation_v2_sie");
    expect(r.text.startsWith("Guten Tag Frau Schneider, Ihr Termin bei X ist bestätigt")).toBe(true);
  });
  it("Sie-Kunde ohne Anrede → voller Name", () => {
    expect(send([v2sie, v2ohne], "sie", OHNE_ANREDE)!.text.startsWith("Guten Tag Julia Schneider,")).toBe(true);
  });
  it("Sie-Kunde ohne Nachnamen (mit und ohne Anrede) → Fassung ohne Namen, Platzhalter rücken auf", () => {
    for (const k of [NUR_VORNAME, NUR_VORNAME_FRAU]) {
      const r = send([v2sie, v2ohne, v1sie], "sie", k)!;
      expect(r.name).toBe("pg_booking_confirmation_v2_sie_ohne_name");
      expect(r.text).toBe(`Guten Tag, Ihr Termin bei X ist bestätigt: ${rest[0]} (${rest[1]}). ${rest[2]} Zur Vorbereitung: Legen Sie sich gern Ihre bisherigen Unterlagen zum Thema bereit, falls vorhanden.`);
    }
    // Nur die Fassung mit Namen freigegeben → nie mit leerem Namen, sondern die bisherige
    expect(send([v2sie, v1sie], "sie", NUR_VORNAME)!.name).toBe("pg_booking_confirmation_v1_sie");
    expect(send([v2sie], "sie", NUR_VORNAME)).toBeNull();
  });
  it("bis zur Freigabe der neuen Fassung bleibt die bisherige freigegebene im Einsatz", () => {
    expect(send([v1du, v1sie], "sie", FRAU)!.name).toBe("pg_booking_confirmation_v1_sie");
    expect(send([v1du], "sie", FRAU)!.text.startsWith("Hallo Julia,")).toBe(true);
    expect(send([v1du, v1sie], "du", FRAU)!.name).toBe("pg_booking_confirmation_v1");
  });
  it("Du-Kunde (mit/ohne Anrede, mit/ohne Nachnamen) → „Hallo Julia“", () => {
    for (const k of [FRAU, OHNE_ANREDE, NUR_VORNAME_FRAU, NUR_VORNAME]) {
      const r = send([v1du, v1sie, v2du, v2sie, v2ohne], "du", k)!;
      expect(r.name).toBe("pg_booking_confirmation_v2");
      expect(r.text.startsWith("Hallo Julia, dein Termin bei X ist bestätigt")).toBe(true);
    }
  });
  it("Namensplatzhalter am Text erkannt, auch bei von Hand angelegten Vorlagen", () => {
    expect(nameSlotOf("Guten Tag {{1}}, …")).toBe("anrede");
    expect(nameSlotOf("Guten Tag, kurze Rückmeldung: {{1}} Danke")).toBe("ohne");
    expect(nameSlotOf("Hallo {{1}}, …")).toBe("vorname");
    expect(templateParams("Guten Tag {{1}}, x {{2}}.", "sie", NUR_VORNAME, ["a"])).toBeNull();
    expect(templateParams("Hallo {{1}}, x {{2}}.", "du", {}, ["a"])).toEqual(["du", "a"]);
  });
  it("Freitext im offenen Fenster: gleiche Anrede-Regel", () => {
    const names = { firm: "Agentur Susanne Meier", advisor: "Susanne Meier" };
    // Erstanschreiben v8 (Text der Vorlage; gesendet wird der Freitext aus erstanschreiben.ts, siehe assistent-feinschliff.test.ts)
    expect(noticeText("outreach_tkv", "sie", { ...names, kurz: "Susanne" }, FRAU, ["Frau Meier", "Wie alt ist Ihre Katze"])).toBe(
      "Hallo Frau Schneider, danke für Ihre Anfrage zur Tierkrankenversicherung! Hier schreibt der digitale Assistent von Frau Meier.\n\n*Wie alt ist Ihre Katze?*",
    );
    expect(noticeText("outreach", "sie", names, NUR_VORNAME, ["Susanne Meier", "Wann passt es Ihnen"]).startsWith("Hallo, danke für Ihre Anfrage! Hier schreibt")).toBe(true);
    expect(noticeText("outreach", "du", names, FRAU, ["Susanne", "Wann passt es dir"]).startsWith("Hallo Julia, danke für deine Anfrage! Hier schreibt der digitale Assistent von Susanne.")).toBe(true);
    expect(noticeText("followup_offer", "sie", names, OHNE_ANREDE, ["Hausrat"])).toContain("Guten Tag Julia Schneider, hier ist der digitale KI-Assistent von Agentur Susanne Meier. Konnten Sie sich das Angebot zu Hausrat");
  });
});

describe("KI-Assistent: Anrede im Prompt", () => {
  const agent = { systemPrompt: "", knowledge: "", personality: "" };
  const base = (anrede: object | null, ansprache: Ansprache, name = "Julia Schneider") => ({
    qualified: false,
    summary: null,
    contact: { name, phone: "4917600000001", email: null },
    upcoming: null,
    formAnswers: [],
    advisorName: "Susanne Meier",
    firmName: "Agentur Susanne Meier",
    aiDisclosed: false,
    ansprache,
    anrede: anrede as never,
  });
  it("Sie mit Anrede: „Guten Tag Frau Schneider“, im Verlauf nur „Frau Schneider“", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", base(FRAU, "sie"));
    expect(p).toContain("Begrüßung: „Guten Tag Frau Schneider,“");
    expect(p).toContain("Im laufenden Chat sprich den Lead NICHT mit Namen an");
    expect(p).toContain("nie mit dem Vornamen allein");
    expect(p).toContain("Anrede: Frau");
    expect(p).toContain("Sieze den Lead");
    expect(p).toContain("digitale KI-Assistent von Agentur Susanne Meier");
    // Vermittler als Person (Ole, 17.11.2026): ohne Anrede in den Anbieterangaben mit vollem Namen
    expect(p).toContain("Gegenüber dem Lead nennst du ihn immer „Susanne Meier“");
  });
  it("Sie ohne Anrede: voller Name, Herr/Frau nicht raten", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", base(OHNE_ANREDE, "sie"));
    expect(p).toContain("Begrüßung: „Guten Tag Julia Schneider,“");
    expect(p).toContain("leite es nie aus dem Vornamen ab");
  });
  it("Sie ohne Nachnamen: „Guten Tag,“ ohne Namen", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", base(NUR_VORNAME_FRAU, "sie", "Julia"));
    expect(p).toContain("Begrüßung: „Guten Tag,“");
    expect(p).toContain("ohne Namen an, nie mit dem Vornamen");
  });
  it("Du: „Hallo Julia,“ und Vorname im Verlauf (mit und ohne Nachnamen)", () => {
    for (const k of [FRAU, NUR_VORNAME]) {
      const p = buildSystemPrompt(agent, "Privatschutz", base(k, "du"));
      expect(p).toContain("Begrüßung: „Hallo Julia,“");
      expect(p).toContain("Duze den Lead");
      expect(p).not.toContain("Guten Tag");
    }
  });
  it("Bestandskunde: immer Sie, auch bei Kundeneinstellung „Du“", () => {
    const p = buildSystemPrompt(agent, "Bestandskunde", base(FRAU, "du"));
    expect(p).toContain("Begrüßung: „Guten Tag Frau Schneider,“");
    expect(p).not.toContain("Duze den Lead");
  });
});

describe("Weitere Texte an Leads und Kunden", () => {
  it("Bestandskampagnen: Sie mit Anrede aus dem Bestand", () => {
    expect(campaignText("review", { firstName: "Erika", lastName: "Muster", salutation: "Frau" }, null)).toMatch(/^Guten Tag Frau Muster, es ist Zeit/);
    expect(campaignText("birthday", { firstName: "Erika", lastName: "Muster" }, null)).toMatch(/^Guten Tag Erika Muster, herzlichen Glückwunsch/);
    expect(campaignText("cross_sell", "Erika", "Hausrat")).toMatch(/^Guten Tag, viele meiner Kunden haben beim Thema Hausrat eine Lücke/);
  });

  it("Empfehlungs-Anlässe: „Guten Tag Frau Schneider“ statt „Hallo Julia“ mit Sie; alte eigene Texte auch", () => {
    const k = { firstName: "Julia", lastName: "Schneider", salutation: "Frau" };
    for (const o of Object.values(OCCASIONS)) {
      const t = renderText(o.text, { vorname: "Julia", link: "L", vertreter: "Susanne Meier", anrede: k });
      expect(t.startsWith("Guten Tag Frau Schneider, ")).toBe(true);
      expect(t).not.toMatch(/[–—]/);
    }
    expect(renderText("Hallo {Vorname}, danke! {Link}", { vorname: "Julia", link: "L", vertreter: "X", anrede: k })).toBe("Guten Tag Frau Schneider, danke! L");
    expect(renderText("Hallo {Vorname}, danke! {Link}", { vorname: "Julia", link: "L", vertreter: "X", anrede: { firstName: "Julia" } })).toBe("Guten Tag, danke! L");
    expect(renderText("Danke, {Vorname}! Gruß", { vertreter: "X", anrede: { firstName: "Julia" } })).toBe("Danke! Gruß");
  });

  it("E-Mail-Vorlagen: {anrede} je Ansprache und Anrede", () => {
    const sie = werteFuer({ name: "Julia Schneider", source: null, salutation: "Frau" }, "Susanne Meier", { ansprache: "sie" });
    expect(fuelle("{anrede},\n\nText", sie)).toBe("Guten Tag Frau Schneider,\n\nText");
    // E-Mails ohne bekannte Anrede neutral (Ole, 15.11.2026), nicht „Guten Tag Julia Schneider“
    expect(werteFuer({ name: "Julia Schneider", source: null }, "S", { ansprache: "sie" }).anrede).toBe("Guten Tag");
    expect(werteFuer({ name: "Julia", source: null, salutation: "Frau" }, "S", { ansprache: "sie" }).anrede).toBe("Guten Tag");
    expect(werteFuer({ name: "Julia Schneider", source: null, salutation: "Frau" }, "S", { ansprache: "du" }).anrede).toBe("Hallo Julia");
    expect(werteFuer({ name: "Julia Schneider", source: null }, "S").nachname).toBe("Schneider");
  });

  it("Termin-Mails: Anrede, Person im Betreff", () => {
    const ev = { advisorName: "Susanne Meier", start: new Date("2026-11-20T09:00:00Z"), mode: "video", videoUrl: "https://meet.example/x" } as Parameters<typeof content>[1];
    const sie = content("booked", ev, FRAU, "sie");
    expect(sie.lines[0]).toBe("Guten Tag Frau Schneider,");
    expect(sie.subject).toContain("Ihr Termin mit Susanne Meier");
    expect(content("reminder", ev, NUR_VORNAME, "sie").lines[0]).toBe("Guten Tag,");
    expect(content("booked", ev, FRAU, "du").lines[0]).toBe("Hallo Julia,");
    expect(content("booked", ev, "Julia Schneider", "sie").lines[0]).toBe("Guten Tag Julia Schneider,");
  });

  it("Kalendereintrag für den Lead: Anrede und Ansprache", () => {
    const d = customerEventDescription({ hi: "Guten Tag Frau Schneider,", an: "sie", mode: "phone", phone: "4917600000001", videoUrl: null, manageUrl: "https://x", advisorName: "Susanne Meier" });
    expect(d.startsWith("Guten Tag Frau Schneider,\n\nvielen Dank für Ihre Terminbuchung!")).toBe(true);
    expect(d).toContain("Susanne Meier ruft Sie zur vereinbarten Zeit");
    expect(d).not.toMatch(/\b(dich|du|deine)\b/);
  });

  it("Vertriebs-Follow-ups: dieselbe Regel", () => {
    expect(greetingFor({ salutation: "frau", firstName: "Anna", lastName: "Meier" })).toBe("Guten Tag Frau Meier,");
    expect(greetingFor({ salutation: "w", firstName: "Anna", lastName: "Meier" })).toBe("Guten Tag Frau Meier,");
    expect(greetingFor({ salutation: null, firstName: "Anna", lastName: "Meier" })).toBe("Guten Tag Anna Meier,");
    expect(greetingFor({ salutation: "Herr", firstName: "Anna", lastName: null })).toBe("Guten Tag,");
  });
});
