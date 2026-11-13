// Kampagnen-Agenten: die einzelnen Rollen (je ein Claude-Aufruf mit klarer
// Aufgabe und JSON-Schema). Der Ablauf und das Anlegen bei Meta stehen in
// run.ts bzw. builder.ts – hier gibt es keine Seiteneffekte.

import { runAgent, type AgentUsage, type LlmCall } from "@/lib/kampagnen/llm";
import {
  CTAS,
  LIMITS,
  validateAngles,
  validateCopies,
  validateForm,
  validatePlan,
  validateReview,
  worstStatus,
  type AdCopy,
  type Angle,
  type CampaignContext,
  type CampaignPlan,
  type CreativeImage,
  type Finding,
  type LeadFormDraft,
  type ReviewResult,
} from "@/lib/kampagnen/types";

// ─── Bewährte Muster aus unseren eigenen Kampagnen ──────────────────────

const PATTERNS: [RegExp, string][] = [
  [
    /katze|tkv(?!.*hund)|tierkranken/i,
    `Katzenversicherung (unser bestes Produkt, viele Leads zu niedrigem Preis):
- Tierarztkosten sind seit der neuen Gebührenordnung für Tierärzte (GOT, Ende 2022) deutlich gestiegen – Behandlungen kosten oft das Mehrfache.
- Eine OP (z. B. nach Unfall beim Freigang, Zahnbehandlung, Fremdkörper) kann schnell vierstellig werden.
- Hook-Formen, die funktionieren: Frage nach der letzten Tierarztrechnung, „Was viele Katzenhalter nicht wissen …“, Vergleich OP-Kosten vs. Monatsbeitrag (ohne konkrete Beitragszahlen), Wohnungskatze vs. Freigänger.
- Persönlich und regional: „Ihr Versicherungsberater in <Ort>“ wirkt besser als Konzernsprache.`,
  ],
  [/hund/i, `Hundekrankenversicherung: Tierarztkosten seit der GOT-Erhöhung gestiegen, OP-Kosten (Kreuzband, Magendrehung) schnell vierstellig, Hundehaftpflicht als Ergänzung erwähnen erlaubt.`],
  [/pferd/i, `Pferdeversicherung: OP-Kosten (z. B. Kolik-OP) sehr hoch, Pferdehalter planen langfristig, Stall- und Turnier-Alltag als Bildwelt.`],
  [/privatschutz|haftpflicht|hausrat|rechtsschutz/i, `Privatschutz: Haftpflicht, Hausrat und Rechtsschutz in einem Gespräch prüfen, „einmal alles sauber aufgestellt“, Doppelversicherungen vermeiden, Bündel statt Einzelverträge.`],
  [/sterbegeld/i, `Sterbegeld: Angehörige bei den Bestattungskosten entlasten, ruhiger und respektvoller Ton, Zielgruppe meist 50+, keine Angst-Botschaften.`],
  [/kinder|sparplan/i, `Kindersparplan: früh anfangen, kleine monatliche Beträge, Eltern und Großeltern als Zielgruppe, keine Renditeversprechen.`],
];

export function productPatterns(product: string): string {
  return PATTERNS.find(([re]) => re.test(product))?.[1] ?? "Keine bewährten Muster hinterlegt – ehrlich, konkret und regional werben.";
}

// ─── Gemeinsamer Rahmen ────────────────────────────────────────────────

const RULES = `Regeln für alle Werbetexte (Deutschland, Versicherungsvermittlung):
- Absender ist der Vermittler bzw. seine Agentur, nicht performancegrowth und nicht der Versicherer als Konzern.
- Keine Heilsversprechen, keine Garantien, keine erfundenen Preise, Prozentzahlen oder Ersparnisse, keine Superlative ohne Beleg („günstigste“, „beste“).
- Meta-Richtlinie „persönliche Merkmale“: Keine Unterstellungen über die Person („Sie haben eine Katze?“, „Ihr Hund ist krank?“). Erlaubt: allgemeine Aussagen („Für Katzenhalter in …“).
- Keine Angstmache, keine Dringlichkeits-Lügen („nur heute“).
- Korrektes Deutsch, Anrede durchgehend wie vorgegeben (Sie oder Du).`;

function contextBlock(c: CampaignContext): string {
  const ort = [c.zip, c.city].filter(Boolean).join(" ") || c.region || "Deutschland";
  return `KUNDE (Werbetreibender):
- Agentur/Kunde: ${c.customerName}
- Vermittler: ${c.advisorName} (${c.vermittlerTyp === "makler" ? "Versicherungsmakler, unabhängig, vergleicht mehrere Versicherer" : `Versicherungsvertreter${c.insurer ? ` der ${c.insurer}` : ""}`})
- Ort: ${ort}
- Produkt: ${c.product}
- Tagesbudget laut Vertrag: ${c.dailyBudgetEur} €
- Erwarteter Leadpreis: ${c.cplEur != null ? `ca. ${c.cplEur} €` : "unbekannt"}
- Anrede: ${c.anrede}
${c.special ? `- Besonderheiten laut Kunde: ${c.special}` : ""}
${c.wish ? `- Zusatzwunsch von Ole: ${c.wish}` : ""}

BEWÄHRTE MUSTER (unsere eigenen Kampagnen):
${c.patterns}${
    c.libraryWinners
      ? `

GEWINNER AUS DER META-WERBEBIBLIOTHEK (Anzeigen anderer, die in Deutschland seit mindestens 30 Tagen laufen – lange Laufzeit heißt meist: sie rechnen sich):
${c.libraryWinners}
So nutzen: Hook, Aufbau, Tonfall und Winkel dieser Gewinner als Vorlage nehmen und leicht abwandeln – auf den Vermittler, seinen Ort und die Anrede zuschneiden. Nie wörtlich übernehmen, keine fremden Firmen-, Marken- oder Personennamen, keine Preise oder Versprechen daraus übernehmen.`
      : ""
  }`;
}

// ─── 1. Stratege ───────────────────────────────────────────────────────

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dailyBudgetEur", "adSets", "adsPerAdSet", "zielgruppe", "begruendung"],
  properties: {
    dailyBudgetEur: { type: "number" },
    adSets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "ageMin", "ageMax", "radiusKm", "advantageAudience", "note"],
        properties: {
          name: { type: "string" },
          ageMin: { type: "integer" },
          ageMax: { type: "integer" },
          radiusKm: { type: "integer" },
          advantageAudience: { type: "boolean" },
          note: { type: "string" },
        },
      },
    },
    adsPerAdSet: { type: "integer" },
    zielgruppe: { type: "string" },
    begruendung: { type: "string" },
  },
} as const;

export async function strategist(llm: LlmCall, c: CampaignContext, name: string): Promise<{ value: CampaignPlan; usage: AgentUsage }> {
  const r = await runAgent(
    llm,
    {
      agent: "Stratege",
      system: `Du bist Senior Media Buyer für Meta Lead Ads (Instant Forms) für Versicherungsvermittler in Deutschland. Du planst Kampagnen, die mit kleinem Budget planbar Leads liefern.\n\n${RULES}`,
      user: `${contextBlock(c)}

AUFGABE: Plane die Kampagne (Ziel: Leads über ein Meta-Sofortformular, eine Kampagne mit Kampagnenbudget).
- Tagesbudget: übernimm das Vertragsbudget (${c.dailyBudgetEur} €), außer der Zusatzwunsch sagt etwas anderes; Spanne ${LIMITS.dailyBudgetMin}–${LIMITS.dailyBudgetMax} €.
- 1 Anzeigengruppe (Standard). 2 nur, wenn es einen klaren Grund gibt (z. B. zwei sehr unterschiedliche Zielgruppen) und das Budget mindestens 40 €/Tag beträgt.
- Je Anzeigengruppe: Alter (18–65), Umkreis um den Ort in km (17–80; ländlich größer, Großstadt kleiner), Advantage+ Zielgruppe ja/nein (Standard ja – Meta erweitert dann vorsichtig über die Vorgaben hinaus).
- adsPerAdSet: 3–5 Anzeigen (unterschiedliche Winkel).
- zielgruppe: 1–2 Sätze, wen wir erreichen wollen. begruendung: kurz, warum dieser Aufbau.`,
      schema: PLAN_SCHEMA,
    },
    validatePlan,
  );
  return {
    usage: r.usage,
    value: {
      ...r.value,
      campaignName: name,
      objective: "OUTCOME_LEADS",
      // Nur Deutschland als Zielland: die Special Ad Category „Financial products and services“
      // ist laut Meta nur für Werbetreibende in den USA bzw. Zielgruppen in den USA Pflicht.
      specialAdCategories: [],
    },
  };
}

// ─── 2. Angle-Rechercheur ──────────────────────────────────────────────

const ANGLES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["angles"],
  properties: {
    angles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "hook", "insight"],
        properties: { key: { type: "string" }, title: { type: "string" }, hook: { type: "string" }, insight: { type: "string" } },
      },
    },
  },
} as const;

export async function angleResearcher(llm: LlmCall, c: CampaignContext, plan: CampaignPlan): Promise<{ value: Angle[]; usage: AgentUsage }> {
  return runAgent(
    llm,
    {
      agent: "Angle-Rechercheur",
      system: `Du bist Direct-Response-Stratege für Versicherungs-Leadgenerierung auf Facebook und Instagram. Du findest Werbe-Winkel, die echte Gründe zum Handeln liefern.\n\n${RULES}`,
      user: `${contextBlock(c)}

ZIELGRUPPE LAUT PLAN: ${plan.zielgruppe}

AUFGABE: Leite ${plan.adsPerAdSet} unterschiedliche Werbe-Winkel ab (3–5). Jeder Winkel braucht:
- key: kurzer Schlüssel (kleinbuchstaben-mit-bindestrich)
- title: Name des Winkels
- hook: die erste Zeile bzw. Kernbotschaft, die im Feed stoppt
- insight: warum das bei dieser Zielgruppe in dieser Region wirkt
Die Winkel sollen sich klar unterscheiden (z. B. Kosten-Realität, Regionalität/persönlicher Berater, Neugier/Wissenslücke, Alltagsszene, Vergleich).${
        c.libraryWinners ? "\nMindestens zwei Winkel lehnen sich an die Gewinner aus der Werbebibliothek an (leicht abgewandelt); nenne im insight, an welchen." : ""
      }`,
      schema: ANGLES_SCHEMA,
    },
    validateAngles,
  );
}

// ─── 3. Texter ─────────────────────────────────────────────────────────

const COPIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ads"],
  properties: {
    ads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["angleKey", "primaryText", "headline", "description", "imageHeadline", "imageSubline", "cta"],
        properties: {
          angleKey: { type: "string" },
          primaryText: { type: "string" },
          headline: { type: "string" },
          description: { type: "string" },
          imageHeadline: { type: "string" },
          imageSubline: { type: "string" },
          cta: { type: "string", enum: [...CTAS] },
        },
      },
    },
  },
} as const;

const COPY_SPEC = `Je Anzeige:
- angleKey: Schlüssel des Winkels
- primaryText: Primärtext über dem Bild (80–${LIMITS.primaryText} Zeichen; erste Zeile = Hook; Absätze erlaubt; endet mit klarer Aufforderung zum Formular, z. B. „Jetzt kurz Ihre Angaben eintragen – ich melde mich persönlich.“)
- headline: Überschrift unter dem Bild (höchstens ${LIMITS.headline} Zeichen)
- description: kurzer Zusatz (höchstens ${LIMITS.description} Zeichen)
- imageHeadline: große Zeile IM Bild (höchstens ${LIMITS.imageHeadline} Zeichen)
- imageSubline: kleinere Zeile IM Bild (höchstens ${LIMITS.imageSubline} Zeichen)
- cta: Button, einer von ${CTAS.join(", ")} (Standard GET_QUOTE oder LEARN_MORE)`;

export async function copywriter(llm: LlmCall, c: CampaignContext, plan: CampaignPlan, angles: Angle[]): Promise<{ value: AdCopy[]; usage: AgentUsage }> {
  return runAgent(
    llm,
    {
      agent: "Texter",
      system: `Du bist Werbetexter für Versicherungsvermittler. Du schreibst im Namen des Vermittlers, persönlich, regional, klar – nie marktschreierisch.\n\n${RULES}`,
      user: `${contextBlock(c)}

WINKEL:
${angles.map((a) => `- ${a.key}: ${a.title} – Hook: ${a.hook} (${a.insight})`).join("\n")}

AUFGABE: Schreibe genau eine Anzeige je Winkel (${angles.length} Anzeigen), Anrede „${c.anrede}“.
${COPY_SPEC}`,
      schema: COPIES_SCHEMA,
    },
    (x) => validateCopies(x, angles.map((a) => a.key)),
  );
}

/** Texter überarbeitet nach Prüfer-Befunden (einmal). */
export async function reviseCopies(llm: LlmCall, c: CampaignContext, copies: AdCopy[], findings: Finding[], angleKeys: string[]): Promise<{ value: AdCopy[]; usage: AgentUsage }> {
  return runAgent(
    llm,
    {
      agent: "Texter (Überarbeitung)",
      system: `Du bist Werbetexter für Versicherungsvermittler und überarbeitest Anzeigen nach einer Prüfung.\n\n${RULES}`,
      user: `${contextBlock(c)}

BISHERIGE ANZEIGEN (JSON):
${JSON.stringify({ ads: copies }, null, 2)}

BEFUNDE DES PRÜFERS (beheben, Rest möglichst unverändert lassen):
${findings.map((f) => `- [${f.severity}] ${f.area}${f.index != null ? ` #${f.index + 1}` : ""}: ${f.issue} → ${f.fix}`).join("\n")}

Gib alle Anzeigen vollständig zurück.
${COPY_SPEC}`,
      schema: COPIES_SCHEMA,
    },
    (x) => validateCopies(x, angleKeys),
  );
}

// ─── 5. Formular-Agent ─────────────────────────────────────────────────

const FORM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["formName", "introTitle", "introParagraphs", "questions", "thankYouTitle", "thankYouBody", "consentText"],
  properties: {
    formName: { type: "string" },
    introTitle: { type: "string" },
    introParagraphs: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "options"],
        properties: { key: { type: "string" }, label: { type: "string" }, options: { type: "array", items: { type: "string" } } },
      },
    },
    thankYouTitle: { type: "string" },
    thankYouBody: { type: "string" },
    consentText: { type: "string" },
  },
} as const;

const FORM_SPEC = `- formName: interner Name, z. B. „${"PG | <Kunde> | <Produkt> | Formular"}“
- introTitle (höchstens ${LIMITS.introTitle} Zeichen) und introParagraphs (1–3 kurze Sätze: was passiert nach dem Absenden, wer meldet sich)
- questions: 2–4 Qualifizierungsfragen (key in snake_case, label höchstens ${LIMITS.questionLabel} Zeichen, options = 2–6 Antwortmöglichkeiten; Multiple Choice bevorzugt, damit es schnell geht). Name, Telefon und E-Mail fragt das Formular automatisch ab – NICHT als Frage aufnehmen.
- thankYouTitle (höchstens ${LIMITS.thankYouTitle} Zeichen), thankYouBody: was jetzt passiert (z. B. „Ich melde mich in Kürze per WhatsApp oder Telefon.“)
- consentText: Einwilligung zur Kontaktaufnahme durch den Vermittler per Telefon, E-Mail und WhatsApp zu dieser Anfrage, jederzeit widerrufbar (mit Name des Vermittlers bzw. der Agentur).`;

export async function formAgent(llm: LlmCall, c: CampaignContext): Promise<{ value: LeadFormDraft; usage: AgentUsage }> {
  return runAgent(
    llm,
    {
      agent: "Formular-Agent",
      system: `Du baust Meta-Sofortformulare (Lead Ads) für Versicherungsvermittler: kurz, qualifizierend, DSGVO-sauber. Die Antworten gehen an einen WhatsApp-Assistenten, der danach das Gespräch führt.\n\n${RULES}`,
      user: `${contextBlock(c)}

WISSEN DES WHATSAPP-ASSISTENTEN DIESES KUNDEN (gekürzt, für passende Fragen):
${c.assistantKnowledge ?? "(nicht hinterlegt)"}

AUFGABE: Entwirf das Sofortformular für „${c.product}“, Anrede „${c.anrede}“.
${FORM_SPEC}`,
      schema: FORM_SCHEMA,
    },
    validateForm,
  );
}

export async function reviseForm(llm: LlmCall, c: CampaignContext, form: LeadFormDraft, findings: Finding[]): Promise<{ value: LeadFormDraft; usage: AgentUsage }> {
  return runAgent(
    llm,
    {
      agent: "Formular-Agent (Überarbeitung)",
      system: `Du überarbeitest ein Meta-Sofortformular nach einer Prüfung.\n\n${RULES}`,
      user: `${contextBlock(c)}

BISHERIGES FORMULAR (JSON):
${JSON.stringify(form, null, 2)}

BEFUNDE DES PRÜFERS:
${findings.map((f) => `- [${f.severity}] ${f.issue} → ${f.fix}`).join("\n")}

Gib das vollständige Formular zurück.
${FORM_SPEC}`,
      schema: FORM_SCHEMA,
    },
    validateForm,
  );
}

// ─── 6. Prüfer ─────────────────────────────────────────────────────────

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "findings"],
  properties: {
    status: { type: "string", enum: ["gruen", "gelb", "rot"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "area", "index", "issue", "fix"],
        properties: {
          severity: { type: "string", enum: ["rot", "gelb"] },
          area: { type: "string", enum: ["plan", "text", "bild", "formular"] },
          index: { type: ["integer", "null"] },
          issue: { type: "string" },
          fix: { type: "string" },
        },
      },
    },
  },
} as const;

export const CHECKLIST = [
  "Meta-Werberichtlinien: keine Unterstellung persönlicher Merkmale (Gesundheit, Finanzen, Tierbesitz direkt angesprochen), keine reißerischen Vorher/Nachher-Aussagen, kein irreführender Button.",
  "Wettbewerbsrecht/UWG: keine Irreführung, keine unbelegten Superlative, keine erfundenen Preise, Ersparnisse oder Garantien, keine Dringlichkeits-Lügen.",
  "Versicherungsvermittlung: Absender ist klar der Vermittler (Vertreter bzw. Makler), kein Auftreten als Versicherer-Konzern; Makler nicht als Vertreter einer Gesellschaft darstellen und umgekehrt.",
  "Formular: Einwilligung zur Kontaktaufnahme (Telefon, E-Mail, WhatsApp) vorhanden und verständlich; keine sensiblen Gesundheitsfragen zu Personen; Fragen passen zum Produkt.",
  "Sprache: Rechtschreibung, einheitliche Anrede, Zeichengrenzen eingehalten.",
  "Plan: Budget passt zum Vertrag, Ort stimmt mit der Kundenakte überein.",
];

export async function reviewer(
  llm: LlmCall,
  c: CampaignContext,
  input: { plan: CampaignPlan; copies: AdCopy[]; form: LeadFormDraft; images: CreativeImage[] },
): Promise<{ value: ReviewResult; usage: AgentUsage }> {
  const r = await runAgent(
    llm,
    {
      agent: "Prüfer",
      system: `Du bist Compliance- und Qualitätsprüfer für Meta-Anzeigen von Versicherungsvermittlern in Deutschland. Du bist streng, aber praktisch: „rot“ nur bei echten Verstößen (Richtlinie, Recht, falsche Fakten), „gelb“ für Verbesserungen, „gruen“ wenn alles passt.`,
      user: `${contextBlock(c)}

CHECKLISTE:
${CHECKLIST.map((x, i) => `${i + 1}. ${x}`).join("\n")}

PLAN: ${JSON.stringify({ dailyBudgetEur: input.plan.dailyBudgetEur, adSets: input.plan.adSets, zielgruppe: input.plan.zielgruppe })}
ANZEIGEN (index ab 0): ${JSON.stringify(input.copies)}
FORMULAR: ${JSON.stringify(input.form)}
BILDER: ${input.images.length} Stück erzeugt.

Gib status, summary (1–3 Sätze) und findings zurück (index = Anzeige ab 0 bzw. Frage ab 0, sonst null).`,
      schema: REVIEW_SCHEMA,
    },
    validateReview,
  );
  const findings = [...r.value.findings, ...staticChecks(c, input)];
  return { usage: r.usage, value: { ...r.value, findings, status: worstStatus(r.value.status, findings) } };
}

/** Feste Prüfungen ohne KI (laufen immer zusätzlich zum Prüfer). */
export function staticChecks(c: CampaignContext, input: { plan: CampaignPlan; copies: AdCopy[]; form: LeadFormDraft; images: CreativeImage[] }): Finding[] {
  const out: Finding[] = [];
  if (!c.privacyUrl) out.push({ severity: "rot", area: "formular", index: null, issue: "Keine Datenschutz-URL des Kunden.", fix: "Datenschutz-URL in der Kampagnen-Karte eintragen." });
  if (!c.city && !c.zip && !c.region) out.push({ severity: "gelb", area: "plan", index: null, issue: "Kein Ort in der Kundenakte – Kampagne läuft deutschlandweit.", fix: "Ort/PLZ im Vertriebskontakt ergänzen." });
  if (Math.abs(input.plan.dailyBudgetEur - c.dailyBudgetEur) > 0.5) {
    out.push({ severity: "gelb", area: "plan", index: null, issue: `Tagesbudget ${input.plan.dailyBudgetEur} € weicht vom Vertrag (${c.dailyBudgetEur} €) ab.`, fix: "Bewusst so gewollt? Sonst Budget anpassen." });
  }
  const garantie = /garantie|garantiert|100\s?%|kostenlos versichert|günstigste|billigste/i;
  input.copies.forEach((a, i) => {
    if (garantie.test(`${a.primaryText} ${a.headline} ${a.description} ${a.imageHeadline} ${a.imageSubline}`)) {
      out.push({ severity: "rot", area: "text", index: i, issue: "Werbeversprechen (Garantie/Superlativ) im Text.", fix: "Versprechen streichen bzw. sachlich formulieren." });
    }
    const du = /\b(du|dich|dein|deine|dir)\b/i.test(a.primaryText);
    const sie = /\b(Sie|Ihnen|Ihr|Ihre)\b/.test(a.primaryText);
    if ((c.anrede === "Sie" && du) || (c.anrede === "Du" && sie && !du)) {
      out.push({ severity: "gelb", area: "text", index: i, issue: `Anrede passt nicht (vorgegeben: ${c.anrede}).`, fix: `Durchgehend „${c.anrede}“.` });
    }
  });
  if (input.images.length < input.copies.length) {
    out.push({ severity: "gelb", area: "bild", index: null, issue: `Nur ${input.images.length} von ${input.copies.length} Bildern erzeugt.`, fix: "Fehlende Bilder neu erzeugen (Anzeigen ohne Bild werden nicht angelegt)." });
  }
  return out;
}
