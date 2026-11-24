// Kampagnen-Agenten – Ablauf eines Laufs. Deterministischer Code verbindet die
// Agenten (Stratege → Winkel → Texter → Bilder → Formular → Prüfer → Bauer).
// Jeder Schritt wird sofort gespeichert; ein abgebrochener Lauf (Neustart,
// Timeout) macht beim nächsten Cron-Aufruf an derselben Stelle weiter.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { claudeCall, AgentError, type AgentUsage, type LlmCall } from "@/lib/kampagnen/llm";
import { CONSENT_VERSION } from "@/lib/einwilligung-leadformular";
import { angleResearcher, copywriter, formAgent, leitplankenBefunde, reviewer, reviseCopies, reviseForm, strategist } from "@/lib/kampagnen/agents";
import { bildideeAusBild, gueltigeBildidee } from "@/lib/kampagnen/bildidee";
import { checkPrerequisites, loadCampaignContext, pruefeVorlagenQuelle, VorlagenFehler, type Problem } from "@/lib/kampagnen/context";
import { gewinnerFuerWinkel, type EigeneGewinnerErgebnis } from "@/lib/kampagnen/eigene-gewinner";
import { leitplankenKontext, musterAnzeige, musterFuerWinkel, sichereKontext, type FremdDeps, type GesicherterKontext, type Namensteil } from "@/lib/kampagnen/fremdvorlagen";
import type { LernSperre } from "@/lib/kampagnen/lern-sperre";
import { formularMitVorgaben } from "@/lib/kampagnen/formular-vorgaben";
import { adsManagerUrl, buildCampaign, cleanupCampaign, explainMetaError, formUrl, graphApi, pageAccessToken, type MetaApi } from "@/lib/kampagnen/builder";
import {
  ACTIVE_STATUSES,
  campaignName,
  emptyBuilt,
  initialSteps,
  type AdCopy,
  type Angle,
  type Bildidee,
  type BuiltState,
  type CampaignContext,
  type CampaignPlan,
  type CreativeImage,
  type Finding,
  type LeadFormDraft,
  type ReviewResult,
  type RunStatus,
  type RunStep,
  type StepKey,
} from "@/lib/kampagnen/types";

export type RenderCreative = (o: {
  product: string;
  place: string | null;
  advisorName: string;
  headline: string;
  subline: string;
  angle: string;
  requestId: string;
  index: number;
  /** Bild eines EIGENEN Gewinners als Stilvorlage (lib/kampagnen/eigene-gewinner.ts), optional. Nie ein Bild aus einem anderen Werbekonto. */
  referenceImageUrl?: string | null;
  /** Stilhinweis zum eigenen Gewinner (Name, Zahlen, was übernehmen) */
  styleHint?: string | null;
  /**
   * Abstrakte Bildidee bei Mustern aus einem anderen Werbekonto (lib/kampagnen/bildidee.ts): nur Schlüssel fester
   * Kategorien (Motivart, Bildaufbau, Farbwelt, Platzierung der Texte). Dann gibt es weder Vorlagenbild noch Stilhinweis.
   */
  bildidee?: Bildidee | null;
}) => Promise<{ imageUrl: string }>;

export type CampaignDeps = {
  llm: LlmCall;
  renderCreative: RenderCreative;
  meta: MetaApi;
  checkAdAccount: (id: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>;
  subscribePage: (pageId: string) => Promise<void>;
  notify: (title: string, body: string, url: string) => Promise<void>;
  env: () => { anthropic: boolean; r2: boolean; meta: boolean };
  /** Widerspruch gegen das gemeinsame Anzeigenlernen (Standard: lib/kampagnen/lern-sperre.ts), ersetzbar für Tests */
  lernSperre?: LernSperre;
  /** Gewinner aus einem Werbekonto laden (Standard: Meta), ersetzbar für Tests */
  eigeneGewinner?: (input: { customerId: string; adAccountId: string | null; product: string }) => Promise<EigeneGewinnerErgebnis>;
  /** Kundendaten der Quelle bei Mustern aus einem anderen Werbekonto (Standard: Datenbank), ersetzbar für Tests */
  fremd?: Pick<FremdDeps, "quelle" | "quelleNachName">;
};

export function defaultDeps(): CampaignDeps {
  return {
    llm: claudeCall,
    renderCreative: async (o) => (await import("@/lib/creative-gen")).renderProductCreative(o),
    meta: graphApi,
    checkAdAccount: async (id) => {
      const r = await (await import("@/lib/meta")).checkAdAccountAccess(id);
      return r.ok ? { ok: true, name: r.name } : r;
    },
    subscribePage: async (pageId) => (await import("@/lib/meta-leads")).subscribePage(pageId),
    notify: async (title, body, url) => {
      await (await import("@/lib/push")).sendToAdmins({ title, body, url }).catch(() => undefined);
    },
    env: () => ({
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      r2: !!process.env.R2_BUCKET && !!process.env.R2_PUBLIC_URL,
      meta: !!process.env.META_ACCESS_TOKEN,
    }),
  };
}

const LOCK_MS = 15 * 60_000;
const json = (v: unknown) => v as Prisma.InputJsonValue;

type RunRow = Awaited<ReturnType<typeof loadRun>>;
async function loadRun(id: string) {
  return prisma.campaignRun.findUniqueOrThrow({ where: { id }, include: { customer: { select: { name: true } } } });
}

// ─── Start ─────────────────────────────────────────────────────────────

export type StartResult = { ok: true; runId: string } | { ok: false; problems: Problem[] };

/** Neuen Lauf anlegen (höchstens einer je Kunde gleichzeitig). Voraussetzungen werden vorher geprüft. */
export async function startCampaignRun(
  input: {
    customerId: string;
    product: string;
    wish?: string | null;
    privacyUrl?: string | null;
    autoBuild?: boolean;
    createdBy?: string | null;
    dailyBudgetEur?: number | null;
    trigger?: "manuell" | "produkt";
    /** Gewinner eines anderen Kunden als Vorlage (Kunden-ID), siehe loadCampaignContext */
    vorlagenVon?: string | null;
  },
  deps: CampaignDeps = defaultDeps(),
): Promise<StartResult> {
  const running = await prisma.campaignRun.findFirst({ where: { customerId: input.customerId, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
  if (running) return { ok: false, problems: [{ key: "running", message: "Für diesen Kunden läuft schon ein Lauf. Bitte warten, bis er fertig ist." }] };
  // Muster aus dem Werbekonto eines anderen Kunden (gemeinsames Anzeigenlernen): Quelle muss es geben, und weder Quelle
  // noch Ziel dürfen ausgenommen sein. Sonst klare Meldung statt stillschweigend eigener Vorlagen.
  const quelleId = input.vorlagenVon && input.vorlagenVon !== input.customerId ? input.vorlagenVon : null;
  if (quelleId) {
    const problem = await pruefeVorlagenQuelle(input.customerId, quelleId, { lernSperre: deps.lernSperre, quelle: deps.fremd?.quelle });
    if (problem) return { ok: false, problems: [problem] };
  }
  // Bildidee statt Vorlagenbild: eigener Bild-Aufruf je Muster, Kosten zählen zum Lauf
  let bildideeKosten: AgentUsage = { tokensIn: 0, tokensOut: 0, costCents: 0 };
  let ctx: CampaignContext;
  try {
    ctx = await loadCampaignContext(input.customerId, input.product, {
      wish: input.wish,
      privacyUrl: input.privacyUrl,
      dailyBudgetEur: input.dailyBudgetEur,
      vorlagenVon: quelleId,
      eigeneGewinner: deps.eigeneGewinner,
      lernSperre: deps.lernSperre,
      quelle: deps.fremd?.quelle,
      bildidee:
        quelleId && deps.env().anthropic
          ? async (bildUrl) => {
              const r = await bildideeAusBild(deps.llm, bildUrl);
              bildideeKosten = plus(bildideeKosten, r.usage);
              return r.value;
            }
          : undefined,
    });
  } catch (err) {
    if (err instanceof VorlagenFehler) return { ok: false, problems: [{ key: "vorlagenVon", message: err.message }] };
    throw err;
  }
  const problems = await checkPrerequisites(ctx, { checkAdAccount: deps.checkAdAccount, pageToken: (p) => pageAccessToken(deps.meta, p),
    leadgenTos: async (p) => {
      const t = await pageAccessToken(deps.meta, p);
      const r = await deps.meta.get<{ leadgen_tos_accepted?: boolean }>(p, { fields: "leadgen_tos_accepted" }, t);
      return typeof r.leadgen_tos_accepted === "boolean" ? r.leadgen_tos_accepted : null;
    },
    env: deps.env,
  });
  if (problems.length) return { ok: false, problems };
  const run = await prisma.campaignRun.create({
    data: {
      customerId: input.customerId,
      product: input.product,
      wish: ctx.wish,
      autoBuild: input.autoBuild ?? true,
      steps: json(initialSteps()),
      context: json(ctx),
      createdBy: input.createdBy ?? null,
      trigger: input.trigger ?? "manuell",
      ...(bildideeKosten.tokensIn || bildideeKosten.tokensOut ? { costCents: bildideeKosten.costCents, tokensIn: bildideeKosten.tokensIn, tokensOut: bildideeKosten.tokensOut } : {}),
    },
  });
  // Die Quelle steht in keiner Ansicht und in keiner Anweisung: für die Nachvollziehbarkeit hier im Audit-Log des Laufs
  await audit("kampagne.start", {
    entity: "CampaignRun",
    entityId: run.id,
    customerId: input.customerId,
    details: { product: input.product, ...(ctx.fremdvorlagen && ctx.vorlagenQuelleId ? { vorlagenVon: ctx.vorlagenQuelleId } : {}) },
  }).catch(() => undefined);
  return { ok: true, runId: run.id };
}

// ─── Hilfen ────────────────────────────────────────────────────────────

async function lock(id: string): Promise<boolean> {
  const r = await prisma.campaignRun.updateMany({
    where: { id, OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_MS) } }] },
    data: { lockedAt: new Date() },
  });
  return r.count === 1;
}
const unlock = (id: string) => prisma.campaignRun.update({ where: { id }, data: { lockedAt: null } });

function setStep(steps: RunStep[], key: StepKey, patch: Partial<RunStep>): RunStep[] {
  return steps.map((s) => (s.key === key ? { ...s, ...patch } : s));
}

async function saveStep(run: { id: string; steps: RunStep[] }, key: StepKey, patch: Partial<RunStep>, data: Prisma.CampaignRunUpdateInput = {}, usage?: AgentUsage) {
  run.steps = setStep(run.steps, key, {
    ...patch,
    ...(usage ? { tokensIn: (run.steps.find((s) => s.key === key)?.tokensIn ?? 0) + usage.tokensIn, tokensOut: (run.steps.find((s) => s.key === key)?.tokensOut ?? 0) + usage.tokensOut } : {}),
  });
  await prisma.campaignRun.update({
    where: { id: run.id },
    data: {
      ...data,
      steps: json(run.steps),
      lockedAt: new Date(),
      ...(usage ? { costCents: { increment: usage.costCents }, tokensIn: { increment: usage.tokensIn }, tokensOut: { increment: usage.tokensOut } } : {}),
    },
  });
}

const now = () => new Date().toISOString();
const place = (c: CampaignContext) => [c.zip, c.city].filter(Boolean).join(" ") || c.region || null;
const plus = (a: AgentUsage, b: AgentUsage): AgentUsage => ({ tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut, costCents: a.costCents + b.costCents });

// ─── Leitplanken für Muster aus einem anderen Werbekonto ───────────────
// (gemeinsames Anzeigenlernen, Ole, 24.11.2026; Regeln und Prüfungen in lib/kampagnen/fremdvorlagen.ts)

export const LEITPLANKEN_ROT =
  "Leitplanken für Muster aus einem anderen Werbekonto: Ein Text enthält einen Namen bzw. Ort aus dem anderen Werbekonto, übernimmt ein Muster wörtlich oder enthält einen Platzhalter. Nichts bei Meta angelegt.";
export const ALTLAST_BEI_META =
  "Dieser Lauf nutzt Muster aus einem anderen Werbekonto nach altem Stand (bzw. inzwischen entfernte Muster) und ist schon teilweise bei Meta angelegt. Er wird nicht fortgesetzt: bitte bei Meta aufräumen und neu starten.";
const NEU_ERZEUGT = "neu erzeugt: Leitplanken für Muster aus einem anderen Werbekonto";

type LaufZeile = { id: string; customerId: string; status?: string; context: unknown; plan?: unknown; angles?: unknown; copies?: unknown; creatives?: unknown; form?: unknown; updatedAt?: Date };
type KontextDeps = Pick<CampaignDeps, "lernSperre" | "fremd">;
/** Siehe CampaignContext.fremdAltlast: was vor dem Anlegen neu erzeugt werden muss (null: nichts). */
export type Altlast = NonNullable<CampaignContext["fremdAltlast"]> | null;

const mitAltlast = (ctx: CampaignContext, altlast: Altlast): CampaignContext => {
  const rest = { ...ctx };
  delete rest.fremdAltlast;
  return altlast ? { ...rest, fremdAltlast: altlast } : rest;
};
/**
 * Liegt schon etwas bei Meta, das aus den betroffenen Ergebnissen entstand? Bilder, Creatives und Anzeigen stammen aus
 * Texten und Bildern; mit `auchPlanUndFormular` (altes Format) zählen auch Kampagne, Anzeigengruppen und Formular.
 */
const hatInhaltBeiMeta = (b: unknown, auchPlanUndFormular = false) => {
  const built = b as Partial<BuiltState> | null;
  if (built?.imageHashes?.length || built?.creativeIds?.length || built?.adIds?.length) return true;
  return auchPlanUndFormular && !!(built?.campaignId || built?.adSetIds?.length || built?.formId);
};

/**
 * Kontext eines Laufs vor jeder Weiterverwendung absichern (Fortsetzen, Anlegen, Auffrischung, „Bild neu“) und
 * bereinigt speichern: Läufe im alten Format bekommen die sichere Form, bei Widerspruch von Quelle oder Ziel werden
 * die Muster entfernt. `altlast`: Ergebnisse des Laufs sind vor den Leitplanken („altformat“) bzw. aus inzwischen
 * entfernten Mustern („entfernt“) entstanden und müssen vor dem Anlegen neu erzeugt werden.
 * `teile`: Namensteile der Quelle für die feste Ausgabeprüfung, nur im Speicher.
 * Bei abgeschlossenen Läufen (und mit `zeitstempelBehalten`) bleibt `updatedAt` stehen: Das Bereinigen ist keine
 * Arbeit am Lauf (der Monatsbericht zählt angelegte Kampagnen nach diesem Zeitpunkt).
 */
export async function laufKontext(
  row: LaufZeile,
  deps: KontextDeps = {},
  o: { zeitstempelBehalten?: boolean } = {},
): Promise<{ ctx: CampaignContext; teile: Namensteil[]; altlast: Altlast; gesichert: GesicherterKontext }> {
  const roh = (row.context ?? {}) as unknown as CampaignContext;
  const g = await sichereKontext(roh, { sperre: deps.lernSperre, ...deps.fremd });
  const vorher: Altlast = roh.fremdAltlast === "altformat" || roh.fremdAltlast === "entfernt" ? roh.fremdAltlast : null;
  const art: Altlast = vorher === "altformat" || g.altformat ? "altformat" : vorher === "entfernt" || g.entfernt ? "entfernt" : null;
  // Betroffen: Winkel, Texte, Bilder; im alten Format auch Plan und Formular (alle Agenten sahen die Gewinner der Quelle).
  // Abgeschlossene Läufe (angelegt, aufgeräumt) werden nicht mehr neu erzeugt, dort wird nur bereinigt.
  const kreativ = !!(row.angles || row.copies || row.creatives);
  const betroffen = art === "altformat" ? kreativ || !!row.plan || !!row.form : kreativ;
  const altlast: Altlast = art && betroffen && !["built", "cancelled"].includes(row.status ?? "") ? art : null;
  const ctx = altlast !== (g.ctx.fremdAltlast ?? null) ? mitAltlast(g.ctx, altlast) : g.ctx;
  if (g.geaendert || altlast !== vorher) {
    const fertig = ["built", "cancelled", "blocked"].includes(row.status ?? "");
    await prisma.campaignRun.update({
      where: { id: row.id },
      data: { context: json(ctx), ...(ctx.wish !== roh.wish ? { wish: ctx.wish } : {}), ...(row.updatedAt && (fertig || o.zeitstempelBehalten) ? { updatedAt: row.updatedAt } : {}) },
    });
  }
  if (g.geaendert && (g.entfernt || g.altformat)) {
    await audit("kampagne.leitplanken", {
      entity: "CampaignRun",
      entityId: row.id,
      customerId: row.customerId,
      details: { was: g.entfernt ? "Muster entfernt (Widerspruch oder Quelle nicht prüfbar)" : "altes Format bereinigt", ...(g.quelleId ? { vorlagenVon: g.quelleId } : {}) },
      actor: { role: "system" },
    }).catch(() => undefined);
  }
  return { ctx, teile: g.namensteile, altlast, gesichert: g };
}

/**
 * Alte Läufe vorsorglich bereinigen (Stand vom 24.11.2026, erkennbar am alten Hinweis): Kontexte, in denen noch die
 * ungefilterten Gewinner eines anderen Kunden stehen (Bild-Adressen, Anzeigen- und Kampagnennamen, Kennzahlen, Name der
 * Quelle), bekommen die sichere Form, auch wenn der Lauf nie wieder angefasst wird. Läuft im Cron vor dem Fortsetzen
 * (resumeCampaignRuns); sobald nichts mehr im alten Format vorliegt, findet die Abfrage nichts. Gerade laufende Läufe
 * bleiben aus (sie sichern ihren Kontext selbst ab).
 */
export async function bereinigeAlteFremdKontexte(deps: KontextDeps = {}, max = 20): Promise<number> {
  const rows = await prisma.campaignRun.findMany({
    where: {
      context: { path: ["eigeneGewinnerHinweis"], string_starts_with: "Vorlagen aus dem Werbekonto von " },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_MS) } }],
    },
    orderBy: { createdAt: "asc" },
    take: max,
    select: { id: true, customerId: true, status: true, context: true, plan: true, angles: true, copies: true, creatives: true, form: true, updatedAt: true },
  });
  for (const row of rows) await laufKontext(row, deps, { zeitstempelBehalten: true }).catch((err) => reportError(err, "kampagne-leitplanken", { run: row.id }));
  return rows.length;
}

/**
 * Winkel, Texte, Bilder und Prüfung verwerfen (entstanden vor den Leitplanken bzw. aus inzwischen entfernten Mustern):
 * Der Lauf erzeugt sie mit dem bereinigten Kontext neu. `auchPlanUndFormular` (Lauf im alten Format): auch Plan und
 * Formular, denn damals sahen alle Agenten die ungefilterten Gewinner der Quelle.
 */
export async function neuErzeugen(state: { id: string; steps: RunStep[] }, ctx: CampaignContext, auchPlanUndFormular = false): Promise<CampaignContext> {
  const sauber = mitAltlast(ctx, null);
  const offen: StepKey[] = [...(auchPlanUndFormular ? (["stratege", "formular"] as const) : []), "winkel", "texter", "bilder", "pruefer", "anlegen"];
  state.steps = state.steps.map((s): RunStep => (offen.includes(s.key) ? { key: s.key, status: "offen", ...(s.key === "winkel" ? { note: NEU_ERZEUGT } : {}) } : s));
  await prisma.campaignRun.update({
    where: { id: state.id },
    data: {
      context: json(sauber),
      ...(auchPlanUndFormular ? { plan: Prisma.DbNull, form: Prisma.DbNull } : {}),
      angles: Prisma.DbNull,
      copies: Prisma.DbNull,
      creatives: Prisma.DbNull,
      review: Prisma.DbNull,
      steps: json(state.steps),
      status: "queued",
      error: null,
      finishedAt: null,
    },
  });
  return sauber;
}

/**
 * Feste Ausgabeprüfung nach der Texterstellung (kein Modell): Bei einem Treffer überarbeitet der Texter einmal mit den
 * Befunden (reviseCopies). Bleibt ein Treffer, kommen die Befunde zurück (der Lauf geht dann in „Prüfung rot“).
 */
export async function texteMitLeitplanken(
  llm: LlmCall,
  ctx: CampaignContext,
  copies: AdCopy[],
  angleKeys: string[],
  teile: Namensteil[],
  /** Kosten des Texters bis hierher; zurück kommt die Summe mit der Überarbeitung */
  bisher: AgentUsage,
): Promise<{ copies: AdCopy[]; usage: AgentUsage; befunde: Finding[]; ueberarbeitet: boolean }> {
  const befunde = leitplankenBefunde(ctx, copies, teile);
  if (!befunde.length) return { copies, usage: bisher, befunde, ueberarbeitet: false };
  try {
    const rc = await reviseCopies(llm, ctx, copies, befunde, angleKeys);
    return { copies: rc.value, usage: plus(bisher, rc.usage), befunde: leitplankenBefunde(ctx, rc.value, teile), ueberarbeitet: true };
  } catch (err) {
    // Scheitert die Überarbeitung, gehen die Kosten des Texters nicht verloren
    if (err instanceof AgentError) throw new AgentError(err.message, plus(bisher, err.usage));
    throw err;
  }
}

/** Lauf in „Prüfung rot“ geben: Befunde der Leitplanken als Prüfbericht, nichts wird bei Meta angelegt. */
export async function leitplankenStopp(o: {
  id: string;
  state: { id: string; steps: RunStep[] };
  schritt: StepKey;
  befunde: Finding[];
  meldung?: string;
  copies?: AdCopy[] | null;
  review?: ReviewResult | null;
  usage?: AgentUsage | null;
}): Promise<RunStatus> {
  const meldung = o.meldung ?? LEITPLANKEN_ROT;
  const review: ReviewResult = { ...(o.review ?? {}), status: "rot", summary: meldung, findings: [...(o.review?.findings ?? []), ...o.befunde] };
  await saveStep(o.state, o.schritt, { status: "fehler", finishedAt: now(), error: meldung.slice(0, 500) }, { ...(o.copies ? { copies: json(o.copies) } : {}), review: json(review) }, o.usage ?? undefined);
  if (o.schritt !== "anlegen") await saveStep(o.state, "anlegen", { status: "uebersprungen", note: "Prüfung rot, nichts bei Meta angelegt" });
  await prisma.campaignRun.update({ where: { id: o.id }, data: { status: "blocked", finishedAt: new Date(), error: `Prüfung rot: ${meldung}`.slice(0, 1000) } });
  return "blocked";
}

// ─── Ablauf ────────────────────────────────────────────────────────────

/** Lauf abarbeiten bzw. fortsetzen. Gibt den neuen Status zurück. */
export async function processCampaignRun(id: string, deps: CampaignDeps = defaultDeps()): Promise<RunStatus> {
  const kind = await prisma.campaignRun.findUnique({ where: { id }, select: { kind: true } });
  if (kind?.kind === "auffrischung") return (await import("@/lib/kampagnen/refresh")).processRefreshRun(id, deps);
  if (!(await lock(id))) return (await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true } })).status as RunStatus;
  const row = await loadRun(id);
  const state = { id, steps: row.steps as unknown as RunStep[] };
  let current: StepKey = "stratege";
  try {
    if (!["queued", "running"].includes(row.status)) return row.status as RunStatus;
    // Leitplanken für Muster aus einem anderen Werbekonto: Kontext absichern (altes Format, Widerspruch)
    const gesichert = await laufKontext(row, deps);
    let ctx = gesichert.ctx;
    const teile = gesichert.teile;
    const altesFormat = gesichert.altlast === "altformat";
    if (gesichert.altlast) {
      if (hatInhaltBeiMeta(row.built, altesFormat)) return await leitplankenStopp({ id, state, schritt: "anlegen", befunde: [], meldung: ALTLAST_BEI_META, review: row.review as unknown as ReviewResult | null });
      ctx = await neuErzeugen(state, ctx, altesFormat);
    }
    // Nach neuErzeugen sind Winkel, Texte, Bilder und Prüfung verworfen, im alten Format auch Plan und Formular
    const alt = <T,>(v: unknown) => (gesichert.altlast ? null : (v as T | null));
    const altPlan = <T,>(v: unknown) => (altesFormat ? null : (v as T | null));
    await prisma.campaignRun.update({ where: { id }, data: { status: "running", error: null } });

    // 1. Stratege
    current = "stratege";
    let plan = altPlan<CampaignPlan>(row.plan);
    if (!plan) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await strategist(deps.llm, ctx, campaignName(row.product, new Date()));
      plan = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { plan: json(plan) }, r.usage);
    }

    // 2. Winkel
    current = "winkel";
    let angles = alt<Angle[]>(row.angles);
    if (!angles) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await angleResearcher(deps.llm, ctx, plan, { fremdNamensteile: teile });
      angles = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { angles: json(angles) }, r.usage);
    }

    // 3. Texter
    current = "texter";
    let copies = alt<AdCopy[]>(row.copies);
    if (!copies) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await copywriter(deps.llm, ctx, plan, angles);
      // Leitplanken (fest, kein Modell; ohne Fremdvorlagen nie ein Befund): Treffer → einmal überarbeiten, sonst Prüfung rot
      const p = await texteMitLeitplanken(deps.llm, ctx, r.value, angles.map((a) => a.key), teile, r.usage);
      copies = p.copies;
      if (p.befunde.length) {
        await deps.notify(`Kampagne ${row.customer.name}: Prüfung rot`, "Nichts bei Meta angelegt, bitte Befunde ansehen.", `/admin/neu/kunden/${row.customerId}/kampagne`);
        return await leitplankenStopp({ id, state, schritt: current, befunde: p.befunde, copies, usage: p.usage });
      }
      await saveStep(state, current, { status: "fertig", finishedAt: now(), ...(p.ueberarbeitet ? { note: "nach den Leitplanken für Lernmuster überarbeitet" } : {}) }, { copies: json(copies) }, p.usage);
    }

    // 4. Creative-Agent (Bilder über die vorhandene Creative-Pipeline)
    current = "bilder";
    let images = alt<CreativeImage[]>(row.creatives);
    if (!images) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      images = await renderImages(deps, ctx, angles, copies, id);
      if (!images.length) throw new Error("Kein Bild konnte erzeugt werden.");
      await saveStep(state, current, { status: "fertig", finishedAt: now(), note: `${images.length} von ${copies.length} Bildern` }, { creatives: json(images) });
    }

    // 5. Formular-Agent
    current = "formular";
    let form = altPlan<LeadFormDraft>(row.form);
    if (!form) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await formAgent(deps.llm, ctx);
      form = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { form: json(form) }, r.usage);
    }

    // 6. Prüfer (bei rot genau eine Überarbeitung, dann erneut prüfen)
    current = "pruefer";
    let review = alt<ReviewResult>(row.review);
    if (!review) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      let r = await reviewer(deps.llm, ctx, { plan, copies, form, images, angles, fremdNamensteile: teile });
      await saveStep(state, current, {}, {}, r.usage);
      review = r.value;
      if (review.status === "rot") {
        const red = review.findings.filter((f) => f.severity === "rot" || review!.status === "rot");
        const textFindings = red.filter((f) => f.area === "text" || f.area === "bild");
        const formFindings = red.filter((f) => f.area === "formular");
        if (textFindings.length) {
          const before = copies;
          const rc = await reviseCopies(deps.llm, ctx, copies, textFindings, angles.map((a) => a.key));
          copies = rc.value;
          await saveStep(state, current, { note: "Texte überarbeitet" }, { copies: json(copies) }, rc.usage);
          // Bild neu, wenn sich die Texte im Bild geändert haben
          const changed = copies.map((c, i) => c.imageHeadline !== before[i]?.imageHeadline || c.imageSubline !== before[i]?.imageSubline);
          if (changed.some(Boolean)) {
            images = await renderImages(deps, ctx, angles, copies, id, images, changed);
            await prisma.campaignRun.update({ where: { id }, data: { creatives: json(images) } });
          }
        }
        if (formFindings.length) {
          const rf = await reviseForm(deps.llm, ctx, form, formFindings);
          form = rf.value;
          await saveStep(state, current, { note: "Formular überarbeitet" }, { form: json(form) }, rf.usage);
        }
        r = await reviewer(deps.llm, ctx, { plan, copies, form, images, angles, fremdNamensteile: teile });
        review = { ...r.value, revised: true };
        await saveStep(state, current, {}, {}, r.usage);
      }
      await saveStep(state, current, { status: review.status === "rot" ? "fehler" : "fertig", finishedAt: now(), note: review.summary.slice(0, 200) }, { review: json(review) });
    }

    if (review.status === "rot") {
      await saveStep(state, "anlegen", { status: "uebersprungen", note: "Prüfung rot, nichts bei Meta angelegt" });
      await prisma.campaignRun.update({ where: { id }, data: { status: "blocked", finishedAt: new Date(), error: `Prüfung rot: ${review.summary}`.slice(0, 1000) } });
      await deps.notify(`Kampagne ${row.customer.name}: Prüfung rot`, "Nichts bei Meta angelegt, bitte Befunde ansehen.", `/admin/neu/kunden/${row.customerId}/kampagne`);
      return "blocked";
    }
    if (!row.autoBuild) {
      await prisma.campaignRun.update({ where: { id }, data: { status: "review" } });
      return "review";
    }
  } catch (err) {
    return await fail(id, state, current, err);
  } finally {
    await unlock(id).catch(() => undefined);
  }
  // 7. Bauer (eigener Lock)
  return buildCampaignRun(id, deps);
}

async function renderImages(
  deps: CampaignDeps,
  ctx: CampaignContext,
  angles: Angle[],
  copies: AdCopy[],
  runId: string,
  existing: CreativeImage[] = [],
  only: boolean[] | null = null,
): Promise<CreativeImage[]> {
  // Sicherheitsnetz (auch für Läufe im alten Format): Mit Mustern aus einem anderen Werbekonto gibt es hier keine
  // Gewinner und damit keine Bild-Adresse mehr, nur noch die abstrakte Bildidee.
  ctx = leitplankenKontext(ctx);
  const out: CreativeImage[] = [];
  for (let i = 0; i < copies.length; i++) {
    const c = copies[i];
    const old = existing.find((e) => e.angleKey === c.angleKey);
    if (old && only && !only[i]) {
      out.push(old);
      continue;
    }
    const angle = angles.find((a) => a.key === c.angleKey);
    const winkelText = angle ? `${angle.title} ${angle.hook} ${angle.insight}` : "";
    // Eigener Gewinner als Bildvorlage: der im Winkel genannte, sonst der beste mit Bild
    const vorlage = ctx.fremdvorlagen ? null : gewinnerFuerWinkel(ctx.eigeneGewinner, winkelText);
    // Muster aus einem anderen Werbekonto: nie das Bild, nur die Bildidee in festen Kategorien
    const bildidee = ctx.fremdvorlagen ? gueltigeBildidee(musterFuerWinkel(ctx.fremdMuster, winkelText)?.bildidee) : null;
    try {
      const r = await deps.renderCreative({
        product: ctx.product,
        place: place(ctx),
        advisorName: ctx.advisorName,
        headline: c.imageHeadline,
        subline: c.imageSubline,
        angle: angle ? `${angle.title}: ${angle.hook}` : c.angleKey,
        requestId: runId,
        index: i,
        referenceImageUrl: vorlage?.bildUrl ?? null,
        styleHint: vorlage
          ? `Eigene Gewinner-Anzeige des Kunden „${vorlage.name}“ (${vorlage.cpl.toLocaleString("de-DE")} € je Lead, ${vorlage.leads} Leads${vorlage.video ? ", Video, Bild ist das Vorschaubild" : ""}${vorlage.headline ? `, Überschrift „${vorlage.headline}“` : ""}). Bildaufbau, Motivart, Farbwelt, Bildausschnitt und Platzierung der Texte als Vorlage nehmen und für das neue Produkt abwandeln. Keine Texte, Logos oder Preise aus dem Vorlagenbild übernehmen.`
          : null,
        ...(bildidee ? { bildidee } : {}),
      });
      out.push({ angleKey: c.angleKey, imageUrl: r.imageUrl });
    } catch (err) {
      reportError(err, "kampagne-bild", { run: runId });
      if (old) out.push(old);
    }
  }
  return out;
}

async function fail(id: string, state: { id: string; steps: RunStep[] }, key: StepKey, err: unknown): Promise<RunStatus> {
  const raw = err instanceof Error ? err.message : String(err);
  const usage = err instanceof AgentError ? err.usage : undefined;
  const run = await prisma.campaignRun.findUnique({ where: { id }, select: { context: true, customerId: true } });
  const ctx = (run?.context ?? {}) as unknown as CampaignContext;
  const message = explainMetaError(raw, ctx).slice(0, 1000);
  await saveStep(state, key, { status: "fehler", finishedAt: now(), error: message.slice(0, 500) }, {}, usage).catch(() => undefined);
  await prisma.campaignRun.update({ where: { id }, data: { status: "failed", error: message, finishedAt: new Date() } });
  reportError(err, "kampagne-lauf", { run: id, step: key });
  return "failed";
}

// ─── Anlegen bei Meta ──────────────────────────────────────────────────

/** Pausiert anlegen (automatisch nach grüner/gelber Prüfung oder per Knopf; setzt nach Fehlern fort). */
export async function buildCampaignRun(id: string, deps: CampaignDeps = defaultDeps()): Promise<RunStatus> {
  const pre = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true, review: true, kind: true } });
  if (pre.kind === "auffrischung") return (await import("@/lib/kampagnen/refresh")).processRefreshRun(id, deps);
  const review = pre.review as unknown as ReviewResult | null;
  if (!review || review.status === "rot") return pre.status as RunStatus;
  if (!["running", "review", "failed", "building"].includes(pre.status)) return pre.status as RunStatus;
  if (!(await lock(id))) return pre.status as RunStatus;
  const row = await loadRun(id);
  const state = { id, steps: row.steps as unknown as RunStep[] };
  try {
    // Leitplanken für Muster aus einem anderen Werbekonto, letzte Sperre vor dem Anlegen bei Meta:
    // 1. Kontext absichern (altes Format, Widerspruch). Sind Texte und Bilder vor den Leitplanken bzw. aus inzwischen
    //    entfernten Mustern entstanden, werden sie neu erzeugt (unten), statt sie anzulegen.
    const gesichert = await laufKontext(row, deps);
    const altesFormat = gesichert.altlast === "altformat";
    if (gesichert.altlast && hatInhaltBeiMeta(row.built, altesFormat)) {
      return await leitplankenStopp({ id, state, schritt: "anlegen", befunde: [], meldung: ALTLAST_BEI_META, review });
    }
    if (!gesichert.altlast) {
      // 2. Feste Ausgabeprüfung (auch nach Änderungen von Hand): bei einem Treffer wird nichts angelegt
      const befunde = leitplankenBefunde(gesichert.ctx, row.copies as unknown as AdCopy[], gesichert.teile);
      if (befunde.length) {
        await deps.notify(`Kampagne ${row.customer.name}: Prüfung rot`, "Nichts bei Meta angelegt, bitte Befunde ansehen.", `/admin/neu/kunden/${row.customerId}/kampagne`);
        return await leitplankenStopp({ id, state, schritt: "anlegen", befunde, review });
      }
      return await anlegen(id, row, state, gesichert.ctx, deps);
    }
    await neuErzeugen(state, gesichert.ctx, altesFormat);
  } catch (err) {
    return await fail(id, state, "anlegen", err);
  } finally {
    await unlock(id).catch(() => undefined);
  }
  // Nur nach neuErzeugen: Winkel, Texte, Bilder und Prüfung (im alten Format auch Plan und Formular) mit dem
  // bereinigten Kontext neu, danach wie gewohnt weiter
  return processCampaignRun(id, deps);
}

/** Eigentliches Anlegen bei Meta (aus buildCampaignRun, Sperre und Leitplanken sind dort geprüft). */
async function anlegen(id: string, row: RunRow, state: { id: string; steps: RunStep[] }, ctx: CampaignContext, deps: CampaignDeps): Promise<RunStatus> {
  await prisma.campaignRun.update({ where: { id }, data: { status: "building", error: null } });
  await saveStep(state, "anlegen", { status: "laeuft", startedAt: now(), error: undefined });
  const plan = row.plan as unknown as CampaignPlan;
  const copies = row.copies as unknown as AdCopy[];
  const images = row.creatives as unknown as CreativeImage[];
  // Feste Fragen je Produkt auch für Läufe, deren Formular vor dieser Regel entstand (idempotent)
  const form = formularMitVorgaben(row.form as unknown as LeadFormDraft, ctx);
  const built = await buildCampaign(deps.meta, {
    ctx,
    plan,
    copies,
    images,
    form,
    built: { ...emptyBuilt(), ...((row.built as unknown as BuiltState | null) ?? {}) },
    onProgress: async (b) => {
      await prisma.campaignRun.update({ where: { id }, data: { built: json(b), lockedAt: new Date() } });
    },
  });
  // Formular dem Kunden zuordnen (Leads kommen automatisch an) und Seite abonnieren
  if (built.formId && !built.leadSourceId) {
    const ls = await prisma.leadSource.upsert({
      where: { formId: built.formId },
      create: {
        formId: built.formId,
        pageId: ctx.pageId,
        formName: form.formName,
        customerId: row.customerId,
        productKey: row.product,
        questionLabels: json(Object.fromEntries(form.questions.map((q) => [q.key, q.label]))),
        // Nachweis am Lead: Wortlaut und Version der Einwilligung (lib/einwilligung-leadformular.ts)
        consentText: form.consentText,
        consentVersion: form.consentText === ctx.consentText ? CONSENT_VERSION : null,
      },
      update: { customerId: row.customerId, productKey: row.product, active: true, consentText: form.consentText, consentVersion: form.consentText === ctx.consentText ? CONSENT_VERSION : null },
    });
    built.leadSourceId = ls.id;
  }
  if (!built.pageSubscribed && ctx.pageId) {
    try {
      await deps.subscribePage(ctx.pageId);
      built.pageSubscribed = true;
    } catch (err) {
      reportError(err, "kampagne-seite-abo", { run: id });
    }
  }
  await prisma.campaignRun.update({ where: { id }, data: { built: json(built), status: "built", finishedAt: new Date() } });
  await saveStep(state, "anlegen", { status: "fertig", finishedAt: now(), note: `${built.adIds.length} Anzeigen pausiert angelegt` });
  await audit("kampagne.angelegt", { entity: "CampaignRun", entityId: id, customerId: row.customerId, details: { campaignId: built.campaignId, formId: built.formId } }).catch(() => undefined);
  await deps.notify(
    `Kampagne für ${row.customer.name} ist angelegt (pausiert)`,
    "Bitte im Werbeanzeigenmanager prüfen und veröffentlichen.",
    built.campaignId && ctx.adAccountId ? adsManagerUrl(ctx.adAccountId, built.campaignId) : `/admin/neu/kunden/${row.customerId}/kampagne`,
  );
  return "built";
}

// ─── Bearbeiten vor dem Anlegen ───────────────────────────────────────

const EDITABLE = ["primaryText", "headline", "description", "imageHeadline", "imageSubline"] as const;

export async function updateRunCopy(id: string, index: number, patch: Partial<Pick<AdCopy, (typeof EDITABLE)[number]>>): Promise<{ ok: boolean; error?: string }> {
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true, copies: true, built: true } });
  if (!["review", "failed", "blocked"].includes(run.status) || (run.built as BuiltState | null)?.creativeIds?.length) {
    return { ok: false, error: "Texte lassen sich nur vor dem Anlegen bei Meta ändern." };
  }
  const copies = [...((run.copies as unknown as AdCopy[]) ?? [])];
  if (!copies[index]) return { ok: false, error: "Anzeige nicht gefunden." };
  const next = { ...copies[index] };
  for (const k of EDITABLE) if (typeof patch[k] === "string") next[k] = patch[k]!.trim();
  copies[index] = next;
  await prisma.campaignRun.update({ where: { id }, data: { copies: json(copies) } });
  return { ok: true };
}

export async function regenerateRunImage(id: string, index: number, deps: CampaignDeps = defaultDeps()): Promise<{ ok: boolean; error?: string }> {
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { id: true, customerId: true, status: true, plan: true, copies: true, angles: true, creatives: true, form: true, context: true, built: true } });
  if ((run.built as BuiltState | null)?.creativeIds?.length) return { ok: false, error: "Bilder lassen sich nur vor dem Anlegen bei Meta ändern." };
  const copies = (run.copies as unknown as AdCopy[]) ?? [];
  if (!copies[index]) return { ok: false, error: "Anzeige nicht gefunden." };
  const only = copies.map((_, i) => i === index);
  // Leitplanken (auch für Läufe im alten Format): bereinigter Kontext, nie ein Bild aus einem anderen Werbekonto
  const { ctx } = await laufKontext(run, deps);
  const images = await renderImages(deps, ctx, (run.angles as unknown as Angle[]) ?? [], copies, id, (run.creatives as unknown as CreativeImage[]) ?? [], only);
  await prisma.campaignRun.update({ where: { id }, data: { creatives: json(images) } });
  return { ok: true };
}

/** Bei Meta Angelegtes entfernen (z. B. nach Abbruch in der Mitte). */
export async function cleanupCampaignRun(id: string, deps: CampaignDeps = defaultDeps()): Promise<{ ok: boolean; done?: string[]; error?: string }> {
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { built: true, context: true, customerId: true } });
  const built = { ...emptyBuilt(), ...((run.built as unknown as BuiltState | null) ?? {}) };
  try {
    const done = await cleanupCampaign(deps.meta, run.context as unknown as CampaignContext, built);
    if (built.leadSourceId) await prisma.leadSource.update({ where: { id: built.leadSourceId }, data: { active: false } }).catch(() => undefined);
    await prisma.campaignRun.update({ where: { id }, data: { status: "cancelled", built: json({ ...built, cleanedAt: new Date().toISOString() }) } });
    await audit("kampagne.aufgeraeumt", { entity: "CampaignRun", entityId: id, customerId: run.customerId, details: { done } }).catch(() => undefined);
    return { ok: true, done };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Cron: liegengebliebene Läufe fortsetzen (z. B. nach Neustart). */
export async function resumeCampaignRuns(deps: CampaignDeps = defaultDeps()): Promise<number> {
  // Läufe im alten Format (ungefilterte Gewinner eines anderen Kunden im Kontext) vorsorglich bereinigen
  await bereinigeAlteFremdKontexte(deps).catch((err) => reportError(err, "kampagne-leitplanken"));
  const stale = new Date(Date.now() - 2 * 60_000);
  const runs = await prisma.campaignRun.findMany({
    where: {
      status: { in: ["queued", "running", "building"] },
      updatedAt: { lt: stale },
      // Ruhende Konten (lib/ruhend.ts): keine Kampagnen bauen
      customer: { dormantSince: null },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_MS) } }],
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, status: true, kind: true },
  });
  for (const r of runs) {
    if (r.kind === "auffrischung") await (await import("@/lib/kampagnen/refresh")).processRefreshRun(r.id, deps);
    else if (r.status === "building") await buildCampaignRun(r.id, deps);
    else await processCampaignRun(r.id, deps);
  }
  return runs.length;
}

export type RunView = NonNullable<Awaited<ReturnType<typeof getRunView>>>;
export async function getRunView(id: string) {
  const r = await prisma.campaignRun.findUnique({ where: { id } });
  if (!r) return null;
  const roh = r.context as unknown as CampaignContext | null;
  // Auch Läufe im alten Format zeigen nie Vorschaubilder, Namen oder Zahlen aus einem anderen Werbekonto
  const ctx = roh ? leitplankenKontext(roh) : null;
  const built = r.built as unknown as BuiltState | null;
  return {
    id: r.id,
    customerId: r.customerId,
    product: r.product,
    // Bei Mustern aus einem anderen Werbekonto nennt auch der Zusatzwunsch die Quelle nicht (alte Läufe: bereinigt lesen)
    wish: ctx?.fremdvorlagen ? ctx.wish : r.wish,
    status: r.status as RunStatus,
    autoBuild: r.autoBuild,
    steps: r.steps as unknown as RunStep[],
    plan: r.plan as unknown as CampaignPlan | null,
    angles: r.angles as unknown as Angle[] | null,
    copies: r.copies as unknown as AdCopy[] | null,
    creatives: r.creatives as unknown as CreativeImage[] | null,
    form: r.form as unknown as LeadFormDraft | null,
    review: r.review as unknown as ReviewResult | null,
    built,
    // Eigene Gewinner aus dem Werbekonto, die das Team als Vorlage hatte (nur Admin)
    eigeneGewinner: ctx?.eigeneGewinner ?? null,
    eigeneGewinnerHinweis: ctx?.eigeneGewinnerHinweis ?? null,
    // Muster aus einem anderen Werbekonto: nur Reihenfolge, „gleiches Produkt“ und ob eine Bildidee vorliegt.
    // Keine Texte, Vorschaubilder, Namen oder Zahlen der Quelle, und nie, wer die Quelle ist.
    fremdvorlagen: !!ctx?.fremdvorlagen,
    fremdMuster: musterAnzeige(roh, r.angles as unknown as Angle[] | null),
    error: r.error,
    costCents: r.costCents,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    links: {
      adsManager: built?.campaignId && ctx?.adAccountId ? adsManagerUrl(ctx.adAccountId, built.campaignId) : null,
      form: built?.formId && ctx?.pageId ? formUrl(ctx.pageId, built.formId) : null,
    },
  };
}

export type { RunRow };

// Für die Creative-Auffrischung (lib/kampagnen/refresh.ts)
export { lock as lockRun, unlock as unlockRun, saveStep as saveRunStep, renderImages as renderRunImages, fail as failRun, hatInhaltBeiMeta };
