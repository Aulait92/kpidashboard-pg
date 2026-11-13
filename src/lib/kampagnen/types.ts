// Kampagnen-Agenten: Typen, Grenzen und Prüfungen der Agenten-Ausgaben.
// Jeder Agent liefert strukturiertes JSON; der Code prüft es hier, bevor es
// weiterverwendet wird (ungültig → ein Wiederholungsversuch, dann Fehler).

export const STEPS = [
  { key: "stratege", label: "Stratege", doing: "plant Zielgruppe, Budget und Aufbau" },
  { key: "winkel", label: "Angle-Rechercheur", doing: "sucht Werbe-Winkel" },
  { key: "texter", label: "Texter", doing: "schreibt die Anzeigentexte" },
  { key: "bilder", label: "Creative-Agent", doing: "gestaltet die Bilder" },
  { key: "formular", label: "Formular-Agent", doing: "baut das Leadformular" },
  { key: "pruefer", label: "Prüfer", doing: "prüft Richtlinien und Qualität" },
  { key: "anlegen", label: "Bauer", doing: "legt alles pausiert bei Meta an" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export type StepStatus = "offen" | "laeuft" | "fertig" | "fehler" | "uebersprungen";
export type RunStep = {
  key: StepKey;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  note?: string;
  tokensIn?: number;
  tokensOut?: number;
};

export type RunStatus = "queued" | "running" | "review" | "building" | "built" | "blocked" | "failed" | "cancelled";
export const ACTIVE_STATUSES: RunStatus[] = ["queued", "running", "building"];

export function initialSteps(): RunStep[] {
  return STEPS.map((s) => ({ key: s.key, status: "offen" }));
}

// ─── Kontext (aus der Kundenakte, für alle Agenten) ─────────────────────

export type CampaignContext = {
  customerId: string;
  customerName: string;
  /** Name des Vermittlers (Person) bzw. der Agentur – Absender der Anzeigen. */
  advisorName: string;
  vermittlerTyp: "vertreter" | "makler";
  insurer: string | null;
  product: string;
  wish: string | null;
  anrede: "Sie" | "Du";
  city: string | null;
  zip: string | null;
  region: string | null;
  website: string | null;
  privacyUrl: string | null;
  pageId: string | null;
  adAccountId: string | null;
  dailyBudgetEur: number;
  cplEur: number | null;
  /** Besonderheiten aus dem Fragebogen (z. B. „Beratung auch auf Türkisch“). */
  special: string | null;
  /** Wissen des WhatsApp-Assistenten (gekürzt) – Grundlage für die Formularfragen. */
  assistantKnowledge: string | null;
  /** Bewährte Muster unserer eigenen Kampagnen für dieses Produkt. */
  patterns: string;
  /** Lange laufende Anzeigen anderer aus der Meta-Werbebibliothek (Vorlage, nicht wörtlich übernehmen). */
  libraryWinners?: string | null;
  /** Buchungsseite des Kunden – Pflicht auf der Dankeseite (Ole, 13.11.2026), damit Leads direkt einen Termin buchen. */
  bookingUrl?: string | null;
  /** Paket mit Software: Buchungsseite ist Pflicht (Nur Betreuung: ohne Kalender). */
  needsBooking?: boolean;
};

// ─── Agenten-Ergebnisse ─────────────────────────────────────────────────

export type PlanAdSet = { name: string; ageMin: number; ageMax: number; radiusKm: number; advantageAudience: boolean; note: string };
export type CampaignPlan = {
  campaignName: string;
  objective: "OUTCOME_LEADS";
  dailyBudgetEur: number;
  specialAdCategories: string[];
  adSets: PlanAdSet[];
  adsPerAdSet: number;
  zielgruppe: string;
  begruendung: string;
};

export type Angle = { key: string; title: string; hook: string; insight: string };
export type AdCopy = {
  angleKey: string;
  primaryText: string;
  headline: string;
  description: string;
  imageHeadline: string;
  imageSubline: string;
  cta: Cta;
};
export const CTAS = ["SIGN_UP", "LEARN_MORE", "GET_QUOTE", "APPLY_NOW"] as const;
export type Cta = (typeof CTAS)[number];

export type CreativeImage = { angleKey: string; imageUrl: string };

export type FormQuestion = { key: string; label: string; options: string[] };
export type LeadFormDraft = {
  formName: string;
  introTitle: string;
  introParagraphs: string[];
  questions: FormQuestion[];
  thankYouTitle: string;
  thankYouBody: string;
  consentText: string;
};

export type Finding = { severity: "rot" | "gelb"; area: "plan" | "text" | "bild" | "formular"; index: number | null; issue: string; fix: string };
export type ReviewResult = { status: "gruen" | "gelb" | "rot"; summary: string; findings: Finding[]; revised?: boolean };

export type BuiltState = {
  campaignId?: string;
  geoKey?: string | null;
  adSetIds: string[];
  formId?: string;
  imageHashes: string[];
  creativeIds: string[];
  adIds: string[];
  pageSubscribed?: boolean;
  leadSourceId?: string;
  cleanedAt?: string;
};
export const emptyBuilt = (): BuiltState => ({ adSetIds: [], imageHashes: [], creativeIds: [], adIds: [] });

// ─── Grenzen (Meta-Empfehlungen bzw. -Limits) ──────────────────────────

export const LIMITS = {
  primaryText: 600,
  headline: 40,
  description: 30,
  imageHeadline: 60,
  imageSubline: 100,
  questionLabel: 100,
  option: 60,
  formName: 120,
  introTitle: 60,
  thankYouTitle: 60,
  consentText: 600,
  dailyBudgetMin: 5,
  dailyBudgetMax: 500,
} as const;

// ─── Validierung ────────────────────────────────────────────────────────

export type Valid<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);

function textField(errors: string[], obj: Record<string, unknown>, key: string, label: string, max: number, min = 1): string {
  const v = str(obj[key]);
  if (v.length < min) errors.push(`${label} fehlt.`);
  else if (v.length > max) errors.push(`${label} ist zu lang (${v.length} > ${max} Zeichen).`);
  return v;
}

export function validatePlan(x: unknown): Valid<Omit<CampaignPlan, "campaignName" | "objective" | "specialAdCategories" | "dailyBudgetEur"> & { dailyBudgetEur: number }> {
  const errors: string[] = [];
  if (!isObj(x)) return { ok: false, errors: ["Antwort ist kein Objekt."] };
  const adSetsRaw = Array.isArray(x.adSets) ? x.adSets : [];
  if (adSetsRaw.length < 1 || adSetsRaw.length > 2) errors.push("adSets: 1 oder 2 Anzeigengruppen.");
  const adSets: PlanAdSet[] = adSetsRaw.slice(0, 2).map((a, i) => {
    const o = isObj(a) ? a : {};
    const ageMin = Math.round(num(o.ageMin));
    const ageMax = Math.round(num(o.ageMax));
    const radiusKm = Math.round(num(o.radiusKm));
    if (!(ageMin >= 18 && ageMin <= 65)) errors.push(`adSets[${i}].ageMin: 18–65.`);
    if (!(ageMax >= ageMin && ageMax <= 65)) errors.push(`adSets[${i}].ageMax: ≥ ageMin, höchstens 65.`);
    if (!(radiusKm >= 17 && radiusKm <= 80)) errors.push(`adSets[${i}].radiusKm: 17–80 (Meta-Grenze für Städte).`);
    return {
      name: str(o.name).slice(0, 80) || `Anzeigengruppe ${i + 1}`,
      ageMin,
      ageMax,
      radiusKm,
      advantageAudience: o.advantageAudience !== false,
      note: str(o.note).slice(0, 300),
    };
  });
  const adsPerAdSet = Math.round(num(x.adsPerAdSet));
  if (!(adsPerAdSet >= 3 && adsPerAdSet <= 5)) errors.push("adsPerAdSet: 3–5.");
  const dailyBudgetEur = num(x.dailyBudgetEur);
  if (!(dailyBudgetEur >= LIMITS.dailyBudgetMin && dailyBudgetEur <= LIMITS.dailyBudgetMax)) errors.push(`dailyBudgetEur: ${LIMITS.dailyBudgetMin}–${LIMITS.dailyBudgetMax}.`);
  const zielgruppe = textField(errors, x, "zielgruppe", "zielgruppe", 500);
  const begruendung = textField(errors, x, "begruendung", "begruendung", 1500);
  return errors.length ? { ok: false, errors } : { ok: true, value: { adSets, adsPerAdSet, dailyBudgetEur, zielgruppe, begruendung } };
}

export function validateAngles(x: unknown): Valid<Angle[]> {
  const errors: string[] = [];
  const raw = isObj(x) && Array.isArray(x.angles) ? x.angles : [];
  if (raw.length < 3 || raw.length > 5) errors.push("angles: 3–5 Winkel.");
  const seen = new Set<string>();
  const angles = raw.slice(0, 5).map((a, i) => {
    const o = isObj(a) ? a : {};
    const key = str(o.key).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || `winkel-${i + 1}`;
    if (seen.has(key)) errors.push(`angles[${i}].key doppelt.`);
    seen.add(key);
    return {
      key,
      title: textField(errors, o, "title", `angles[${i}].title`, 80),
      hook: textField(errors, o, "hook", `angles[${i}].hook`, 300),
      insight: textField(errors, o, "insight", `angles[${i}].insight`, 500),
    };
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: angles };
}

export function validateCopies(x: unknown, angleKeys: string[]): Valid<AdCopy[]> {
  const errors: string[] = [];
  const raw = isObj(x) && Array.isArray(x.ads) ? x.ads : [];
  if (raw.length < 3 || raw.length > 5) errors.push("ads: 3–5 Anzeigen.");
  const ads = raw.slice(0, 5).map((a, i) => {
    const o = isObj(a) ? a : {};
    const angleKey = str(o.angleKey);
    if (!angleKeys.includes(angleKey)) errors.push(`ads[${i}].angleKey unbekannt (${angleKey || "leer"}).`);
    const cta = str(o.cta) as Cta;
    if (!CTAS.includes(cta)) errors.push(`ads[${i}].cta: eines von ${CTAS.join(", ")}.`);
    return {
      angleKey,
      primaryText: textField(errors, o, "primaryText", `ads[${i}].primaryText`, LIMITS.primaryText, 40),
      headline: textField(errors, o, "headline", `ads[${i}].headline`, LIMITS.headline),
      description: textField(errors, o, "description", `ads[${i}].description`, LIMITS.description),
      imageHeadline: textField(errors, o, "imageHeadline", `ads[${i}].imageHeadline`, LIMITS.imageHeadline),
      imageSubline: textField(errors, o, "imageSubline", `ads[${i}].imageSubline`, LIMITS.imageSubline),
      cta,
    };
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: ads };
}

export function validateForm(x: unknown): Valid<LeadFormDraft> {
  const errors: string[] = [];
  if (!isObj(x)) return { ok: false, errors: ["Antwort ist kein Objekt."] };
  const qs = Array.isArray(x.questions) ? x.questions : [];
  if (qs.length < 2 || qs.length > 4) errors.push("questions: 2–4 Qualifizierungsfragen.");
  const keys = new Set<string>();
  const questions = qs.slice(0, 4).map((q, i) => {
    const o = isObj(q) ? q : {};
    const key = str(o.key).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    if (!key) errors.push(`questions[${i}].key fehlt.`);
    if (["full_name", "phone_number", "email"].includes(key)) errors.push(`questions[${i}].key „${key}“ ist für Kontaktfelder reserviert.`);
    if (keys.has(key)) errors.push(`questions[${i}].key doppelt.`);
    keys.add(key);
    const options = (Array.isArray(o.options) ? o.options : []).map((v) => str(v)).filter(Boolean);
    if (options.length && (options.length < 2 || options.length > 6)) errors.push(`questions[${i}].options: 2–6 Antworten oder keine.`);
    if (options.some((v) => v.length > LIMITS.option)) errors.push(`questions[${i}].options: Antworten höchstens ${LIMITS.option} Zeichen.`);
    return { key, label: textField(errors, o, "label", `questions[${i}].label`, LIMITS.questionLabel), options };
  });
  const introParagraphs = (Array.isArray(x.introParagraphs) ? x.introParagraphs : []).map((v) => str(v)).filter(Boolean).slice(0, 4);
  if (!introParagraphs.length) errors.push("introParagraphs fehlen.");
  const value: LeadFormDraft = {
    formName: textField(errors, x, "formName", "formName", LIMITS.formName),
    introTitle: textField(errors, x, "introTitle", "introTitle", LIMITS.introTitle),
    introParagraphs,
    questions,
    thankYouTitle: textField(errors, x, "thankYouTitle", "thankYouTitle", LIMITS.thankYouTitle),
    thankYouBody: textField(errors, x, "thankYouBody", "thankYouBody", 300),
    consentText: textField(errors, x, "consentText", "consentText", LIMITS.consentText, 30),
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateReview(x: unknown): Valid<ReviewResult> {
  const errors: string[] = [];
  if (!isObj(x)) return { ok: false, errors: ["Antwort ist kein Objekt."] };
  const status = str(x.status) as ReviewResult["status"];
  if (!["gruen", "gelb", "rot"].includes(status)) errors.push("status: gruen, gelb oder rot.");
  const findings = (Array.isArray(x.findings) ? x.findings : []).slice(0, 30).map((f, i) => {
    const o = isObj(f) ? f : {};
    const severity = str(o.severity) as Finding["severity"];
    const area = str(o.area) as Finding["area"];
    if (!["rot", "gelb"].includes(severity)) errors.push(`findings[${i}].severity: rot oder gelb.`);
    if (!["plan", "text", "bild", "formular"].includes(area)) errors.push(`findings[${i}].area ungültig.`);
    const index = typeof o.index === "number" && Number.isInteger(o.index) ? o.index : null;
    return { severity, area, index, issue: str(o.issue).slice(0, 400), fix: str(o.fix).slice(0, 400) };
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: { status, summary: str(x.summary).slice(0, 800), findings } };
}

/** Schlechtester Status aus Prüfer-Urteil und Befunden. */
export function worstStatus(status: ReviewResult["status"], findings: Finding[]): ReviewResult["status"] {
  if (status === "rot" || findings.some((f) => f.severity === "rot")) return "rot";
  if (status === "gelb" || findings.length) return "gelb";
  return "gruen";
}

/** Einheitliches Benennungsschema: „PG | <Kunde> | <Produkt> | <Datum>“. */
export function campaignName(customer: string, product: string, now: Date): string {
  const d = now.toISOString().slice(0, 10);
  return `PG | ${customer} | ${product} | ${d}`.slice(0, 200);
}
