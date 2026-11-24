// Gemeinsames Anzeigenlernen mit Leitplanken (Ole, 24.11.2026), Ende zu Ende mit Datenbank, gemocktem Claude und
// gemockter Meta-API: Mit vorlagenVon dienen die Gewinner eines ANDEREN Kunden (Quelle „Lohmann“ in Musterstadt) als
// Muster für den Zielkunden („Schwarzkopf“ in Hamburg). Zugesagt: „ohne Namen, Personenfotos, Logos oder Zahlen
// einzelner Kunden“, die Quelle wird nie gezeigt, Kunden mit Widerspruch sind weder Quelle noch Ziel.
// Geprüft wird je Leitplanke (Punkte 1 bis 8 des Auftrags), dazu: der eigene Gewinner-Weg bleibt unverändert.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ALTLAST_BEI_META, LEITPLANKEN_ROT, bereinigeAlteFremdKontexte, buildCampaignRun, getRunView, processCampaignRun, regenerateRunImage, startCampaignRun, type CampaignDeps } from "@/lib/kampagnen/run";
import { createRefreshRun, processRefreshRun } from "@/lib/kampagnen/refresh";
import { MELDUNG_QUELLE_FEHLT, MELDUNG_QUELLE_OHNE_KONTO, VorlagenFehler, loadCampaignContext } from "@/lib/kampagnen/context";
import { HINWEIS_ENTFERNT, HINWEIS_GESPERRT, sichereKontext } from "@/lib/kampagnen/fremdvorlagen";
import type { MetaApi } from "@/lib/kampagnen/builder";
import type { LlmCall, LlmRequest } from "@/lib/kampagnen/llm";
import { emptyBuilt, initialSteps, type AdCopy, type Angle, type Bildidee, type CampaignContext, type EigenerGewinner, type ReviewResult, type RunStep } from "@/lib/kampagnen/types";
import { cleanupCustomer, requireTestDb } from "./db";

const PRODUCT = "Katzenversicherung (TKV)";
const usage = { tokensIn: 1000, tokensOut: 500, costCents: 2 };
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Die Quelle: Gewinner aus dem Werbekonto von „Lohmann“ ─────────────

const FREMD_BILD = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/lohmann-katze.jpg?oe=ABC123";
const fremdGewinner = (over: Partial<EigenerGewinner> = {}): EigenerGewinner => ({
  adId: "120001",
  name: "Lohmann | Katze | Tierarztrechnung",
  kampagne: "PG | Lohmann | Katze",
  ausgaben: 240.5,
  leads: 31,
  leadsQuelle: "app",
  termine: 7,
  cpl: 7.76,
  kostenJeTermin: 34.36,
  ctr: 1.83,
  primaryText:
    "Wie hoch war Ihre letzte Tierarztrechnung? Seit 2019 sind die Kosten um bis zu 30 % gestiegen, eine OP kostet schnell zweitausend Euro. Ihr Berater Max Lohmann von der Allianz in Musterstadt zeigt Ihnen in 5 Minuten, wie Sie Ihre Katze absichern. Mehr unter www.lohmann-versicherung.de oder 0711 123456.",
  headline: "Katze absichern in Musterstadt",
  description: "Ihr Team Lohmann",
  cta: "LEARN_MORE",
  bildUrl: FREMD_BILD,
  video: false,
  passtZumProdukt: true,
  ...over,
});
const FREMDE_GEWINNER = [fremdGewinner(), fremdGewinner({ adId: "120002", name: "Lohmann | Hund | OP", bildUrl: null, passtZumProdukt: false, video: true })];
const EIGENES_BILD = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/eigene-anzeige.jpg?oe=DEF456";
const EIGENE_GEWINNER: EigenerGewinner[] = [
  { adId: "770001", name: "Katze Rechnung", kampagne: "PG | Katze", ausgaben: 240, leads: 30, leadsQuelle: "app", termine: 6, cpl: 8, kostenJeTermin: 40, ctr: 1.8, primaryText: "Was kostet der Tierarzt heute?", headline: "Katze absichern", description: null, cta: "LEARN_MORE", bildUrl: EIGENES_BILD, video: false, passtZumProdukt: true },
];

/** Alles, was die Quelle erkennbar macht bzw. Zahl der Quelle ist: darf beim Zielkunden nirgends ankommen. */
const VERBOTEN = [/lohmann/i, /musterstadt/i, /70173/, /fbcdn/i, /scontent/i, /120001/, /120002/, /7[.,]76/, /34[.,]36/, /240[.,]5/, /1[.,]83/, /31 Leads/, /0711/, /2019/, /zweitausend/i, /999000111/];
const ohneVerbotenes = (wert: unknown, wo: string) => {
  const text = typeof wert === "string" ? wert : JSON.stringify(wert);
  for (const re of VERBOTEN) expect(text, `${wo} enthält ${re}`).not.toMatch(re);
};

// ─── Gemockter Claude ──────────────────────────────────────────────────

const BILDIDEE: Bildidee = { motivart: "tier", bildaufbau: "vollflaechig", bildausschnitt: "nah", farbwelt: "hell_warm", textplatzierung: "unten", textgestaltung: "band" };
const KEYS = ["kosten", "regional", "neugier"];
const winkel = (insight: string, keys = KEYS): Angle[] => keys.map((k) => ({ key: k, title: `Winkel ${k}`, hook: `Aufhänger ${k}`, insight }));
const anzeigen = (over: Partial<AdCopy> = {}, keys = KEYS): AdCopy[] =>
  keys.map((k) => ({
    angleKey: k,
    primaryText: `Tierarztbesuche werden teurer (${k}). Lassen Sie uns kurz darüber sprechen, wie Ihre Katze gut abgesichert ist. Tragen Sie Ihre Angaben ein, ich rufe Sie an.`,
    headline: "Katze gut abgesichert",
    description: "Persönliche Beratung",
    imageHeadline: "Tierarztrechnung?",
    imageSubline: "Ihr Berater in Hamburg",
    cta: "GET_QUOTE",
    ...over,
  }));
const FORM = {
  formName: "PG | Katze | Formular",
  introTitle: "Katze absichern",
  introParagraphs: ["Ich melde mich persönlich per WhatsApp oder Telefon."],
  questions: [
    { key: "katze_alter", label: "Wie alt ist die Katze?", options: ["unter 2", "2 bis 7", "älter"] },
    { key: "haltung", label: "Wohnung oder Freigang?", options: ["Wohnung", "Freigang"] },
  ],
  thankYouTitle: "Danke!",
  thankYouBody: "Ich melde mich in Kürze.",
  consentText: "Ich bin einverstanden, dass Peter Schwarzkopf mich per Telefon, E-Mail und WhatsApp zu meiner Anfrage kontaktiert. Widerruf jederzeit.",
};
const PLAN = { dailyBudgetEur: 30, adsPerAdSet: 3, zielgruppe: "Katzenhalter in Hamburg", begruendung: "Ein Set reicht.", adSets: [{ name: "Katzenhalter", ageMin: 25, ageMax: 65, radiusKm: 30, advantageAudience: true, note: "" }] };
const GRUEN: ReviewResult = { status: "gruen", summary: "Alles in Ordnung.", findings: [] };

type Antwort = unknown | ((n: number, req: LlmRequest) => unknown);
function fakeLlm(over: Record<string, Antwort> = {}): { llm: LlmCall; reqs: LlmRequest[]; von: (agent: string) => LlmRequest[] } {
  const standard: Record<string, Antwort> = {
    Stratege: PLAN,
    "Angle-Rechercheur": { angles: winkel("Lernmuster 1, weil die Frage nach der Rechnung stoppt") },
    Texter: { ads: anzeigen() },
    "Formular-Agent": FORM,
    Prüfer: GRUEN,
    Bildidee: BILDIDEE,
  };
  const reqs: LlmRequest[] = [];
  const llm: LlmCall = async (req) => {
    reqs.push(req);
    const key = req.agent.replace(/ \(Überarbeitung\)$/, "");
    const a = req.agent in over ? over[req.agent] : key in over ? over[key] : standard[key];
    const n = reqs.filter((r) => r.agent === req.agent).length;
    return { text: JSON.stringify(typeof a === "function" ? (a as (n: number, req: LlmRequest) => unknown)(n, req) : a), usage };
  };
  return { llm, reqs, von: (agent) => reqs.filter((r) => r.agent === agent) };
}
const anweisung = (r: LlmRequest) => `${r.system}\n${r.user}`;
/** Abschnitt mit den Lernmustern in einer Anweisung (das Wort „Lernmuster“ allein kann aus den Winkeln der Attrappe stammen). */
const KEIN_MUSTERBLOCK = /LERNMUSTER AUS DEM GEMEINSAMEN|Lernmuster \d \(|Winkel mit „Lernmuster N“|greifen die Art des Aufhängers und den Aufbau eines Lernmusters auf/;

// ─── Gemockte Meta-API ─────────────────────────────────────────────────

type Call = { method: "get" | "post" | "del"; path: string; body?: Record<string, unknown> };
function fakeMeta(): MetaApi & { calls: Call[]; posts: () => Call[] } {
  const calls: Call[] = [];
  let n = 0;
  return {
    calls,
    posts: () => calls.filter((c) => c.method === "post"),
    async get<T>(path: string) {
      calls.push({ method: "get", path });
      if (path === "search") return { data: [{ key: "2345", name: "Hamburg", country_code: "DE" }] } as T;
      return { access_token: "PAGE_TOKEN" } as T;
    },
    async post<T>(path: string, body: Record<string, unknown>) {
      calls.push({ method: "post", path, body });
      n++;
      if (path.endsWith("/adimages")) return { images: { x: { hash: `hash${n}` } } } as T;
      return { id: `id${n}` } as T;
    },
    async del(path: string) {
      calls.push({ method: "del", path });
    },
  };
}

type Bild = Parameters<CampaignDeps["renderCreative"]>[0];
type Aufbau = {
  deps: CampaignDeps;
  llm: ReturnType<typeof fakeLlm>;
  meta: ReturnType<typeof fakeMeta>;
  bilder: Bild[];
  geladen: { customerId: string; adAccountId: string | null }[];
  notes: string[];
};

describe("Gemeinsames Anzeigenlernen: Leitplanken (Ende zu Ende, gemockt)", () => {
  const ids: string[] = [];
  const kontakte: string[] = [];

  /** Zielkunde „Schwarzkopf“ in Hamburg (alle Voraussetzungen für einen Lauf erfüllt). */
  async function zielKunde(extra: { account?: string | null } = {}) {
    const u = uid();
    const c = await prisma.customer.create({ data: { name: `Agentur Schwarzkopf ${u}`, metaAdAccountId: extra.account === undefined ? "222000222" : extra.account, metaPageId: `55${Date.now() % 100000}${Math.floor(Math.random() * 1000)}` } });
    ids.push(c.id);
    const sc = await prisma.salesContact.create({ data: { name: "Agentur Schwarzkopf", email: `schwarzkopf-${u}@test.local`, firstName: "Peter", lastName: "Schwarzkopf", street: "Hafenweg 3", zip: "20095", city: "Hamburg", insurer: "LVM", customerId: c.id } });
    kontakte.push(sc.id);
    await prisma.customerBudget.create({ data: { customerId: c.id, product: PRODUCT, dailyBudget: 30, validFrom: new Date("2026-01-01") } });
    await prisma.onboarding.create({ data: { customerId: c.id, websiteInfo: { privacyUrl: "https://schwarzkopf.test/datenschutz" } } });
    await prisma.calendarConnection.create({ data: { customerId: c.id, status: "connected" } });
    return c;
  }
  /** Quellkunde „Lohmann“ in Musterstadt mit eigenem Werbekonto. */
  async function quellKunde(extra: { account?: string | null } = {}) {
    const u = uid();
    const c = await prisma.customer.create({ data: { name: `Allianz Generalvertretung Max Lohmann ${u}`, metaAdAccountId: extra.account === undefined ? "999000111" : extra.account, metaPageId: `90${Date.now() % 100000}${Math.floor(Math.random() * 1000)}`, region: "Musterstadt" } });
    ids.push(c.id);
    const sc = await prisma.salesContact.create({ data: { name: "Allianz Agentur Lohmann", email: `lohmann-${u}@test.local`, firstName: "Max", lastName: "Lohmann", zip: "70173", city: "Musterstadt", insurer: "Allianz", customerId: c.id } });
    kontakte.push(sc.id);
    return c;
  }

  function aufbau(o: { antworten?: Record<string, Antwort>; gesperrt?: () => string[] } = {}): Aufbau {
    const llm = fakeLlm(o.antworten);
    const meta = fakeMeta();
    const bilder: Bild[] = [];
    const geladen: Aufbau["geladen"] = [];
    const notes: string[] = [];
    const deps: CampaignDeps = {
      llm: llm.llm,
      meta,
      renderCreative: async (b) => {
        bilder.push(b);
        return { imageUrl: `https://r2.test/${b.requestId}/${b.index}-${bilder.length}.jpg` };
      },
      checkAdAccount: async () => ({ ok: true, name: "Konto" }),
      subscribePage: async () => undefined,
      notify: async (title) => void notes.push(title),
      env: () => ({ anthropic: true, r2: true, meta: true }),
      // Gewinner je Werbekonto: das der Quelle liefert die fremden, das des Zielkunden die eigenen
      eigeneGewinner: async (input) => {
        geladen.push({ customerId: input.customerId, adAccountId: input.adAccountId });
        if (input.adAccountId === "999000111") return { gewinner: FREMDE_GEWINNER, hinweis: null };
        if (input.adAccountId === "222000222") return { gewinner: EIGENE_GEWINNER, hinweis: null };
        return { gewinner: [], hinweis: `Eigene Gewinner: Im Werbekonto act_${input.adAccountId} gibt es in den letzten 90 Tagen keine Anzeige mit mindestens 50 € Ausgaben oder 5 Leads.` };
      },
      lernSperre: async (gefragt) => new Set(gefragt.filter((id) => (o.gesperrt?.() ?? []).includes(id))),
    };
    return { deps, llm, meta, bilder, geladen, notes };
  }

  const lauf = (id: string) => prisma.campaignRun.findUniqueOrThrow({ where: { id } });
  const kontext = async (id: string) => (await lauf(id)).context as unknown as CampaignContext;
  const schritte = async (id: string) => (await lauf(id)).steps as unknown as RunStep[];

  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL ??= "https://app.example.de";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.META_AD_LIBRARY_TOKEN;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.leadSource.deleteMany({ where: { customerId: { in: ids } } });
    for (const id of ids) await cleanupCustomer(id);
    await prisma.salesContact.deleteMany({ where: { id: { in: kontakte } } });
  });

  // ─── 1, 3, 5: Lauf mit vorlagenVon ───────────────────────────────────

  it("Lauf mit vorlagenVon: Bild der Quelle erreicht die Creative-Erzeugung nie, Anweisungen und Kontext ohne Namen und Kennzahlen, Quelle nur im Audit-Log", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const a = aufbau();
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id, wish: "stark an Lohmanns Gewinnern anlehnen" }, a.deps);
    expect(start).toMatchObject({ ok: true });
    if (!start.ok) return;

    // Geladen wurde aus dem Werbekonto der QUELLE (nicht stillschweigend aus dem eigenen)
    expect(a.geladen).toEqual([{ customerId: quelle.id, adAccountId: "999000111" }]);

    // Punkt 5: gespeicherter Kontext ist bereinigt
    const row = await lauf(start.runId);
    const ctx = row.context as unknown as CampaignContext;
    expect(ctx.fremdvorlagen).toBe(true);
    expect(ctx.eigeneGewinner).toBeNull();
    expect(ctx.eigeneGewinnerHinweis).toBe("Muster aus einem anderen Werbekonto: 2 Anzeigen als Muster (ohne Namen, Bilder und Zahlen).");
    expect(ctx.fremdMuster).toHaveLength(2);
    expect(Object.keys(ctx.fremdMuster![0]).sort()).toEqual(["bildidee", "cta", "description", "headline", "passtZumProdukt", "primaryText", "video"]);
    expect(ctx.fremdMuster![0]).toMatchObject({ bildidee: BILDIDEE, headline: "Katze absichern in [Ort]", description: "Ihr Team [Name]", passtZumProdukt: true });
    expect(ctx.fremdMuster![0].primaryText).toMatch(/^Wie hoch war Ihre letzte Tierarztrechnung\? Seit \[Zahl\] sind die Kosten/);
    expect(ctx.fremdMuster![1]).toMatchObject({ bildidee: null, video: true, passtZumProdukt: false });
    expect(ctx.wish).toBe("stark an [Name] Gewinnern anlehnen");
    expect(row.wish).toBe("stark an [Name] Gewinnern anlehnen");
    // die Kunden-ID der Quelle steht nur intern im Kontext; alles andere nennt die Quelle nicht
    expect(ctx.vorlagenQuelleId).toBe(quelle.id);
    ohneVerbotenes({ ...ctx, vorlagenQuelleId: null }, "gespeicherter Kontext");
    expect(JSON.stringify(ctx)).not.toContain(quelle.name);
    // der gespeicherte Stand ist stabil: erneutes Absichern ändert nichts (die Datenbank sortiert JSON-Schlüssel um)
    expect(await sichereKontext(ctx, { sperre: async () => new Set() })).toMatchObject({ fremd: true, geaendert: false, entfernt: false, altformat: false });

    // Audit-Log des Laufs hält die Quelle fest
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "kampagne.start", entityId: start.runId } });
    expect(audit.details).toEqual({ product: PRODUCT, vorlagenVon: quelle.id });
    expect(audit.customerId).toBe(ziel.id);

    // Punkt 1: Das Bild der Quelle sah nur der Bildidee-Aufruf (ein Bild, nur feste Kategorien als Antwort)
    expect(a.llm.von("Bildidee").map((r) => r.imageUrls)).toEqual([[FREMD_BILD]]);
    expect(row.costCents).toBe(2); // Kosten des Bildidee-Aufrufs zählen zum Lauf

    expect(await processCampaignRun(start.runId, a.deps)).toBe("built");

    // Kein weiterer Aufruf bekam ein Bild, keine Anweisung nennt Namen, Kennzahlen oder „eigene Anzeigen“
    const agenten = a.llm.reqs.filter((r) => r.agent !== "Bildidee");
    expect(agenten.map((r) => r.agent)).toEqual(["Stratege", "Angle-Rechercheur", "Texter", "Formular-Agent", "Prüfer"]);
    for (const r of agenten) {
      expect(r.imageUrls, r.agent).toBeUndefined();
      ohneVerbotenes(anweisung(r), `Anweisung ${r.agent}`);
      expect(anweisung(r), r.agent).not.toContain(quelle.name);
      expect(anweisung(r), r.agent).not.toMatch(/EIGENE GEWINNER|eigenen Anzeigen des Kunden|Eigener Gewinner|eng am genannten Gewinner|Klickrate|je Lead,/);
    }
    for (const agent of ["Angle-Rechercheur", "Texter", "Prüfer"]) {
      expect(anweisung(a.llm.von(agent)[0])).toContain("LERNMUSTER AUS DEM GEMEINSAMEN ANZEIGENLERNEN (gut laufende Anzeigen aus einem anderen Werbekonto");
      expect(anweisung(a.llm.von(agent)[0])).toContain("Lernmuster 1 (gleiches Produkt)");
    }
    expect(anweisung(a.llm.von("Stratege")[0])).not.toMatch(/Lernmuster/i);

    // Creative-Erzeugung: nie die Bild-Adresse der Quelle, kein Stilhinweis mit Namen und Zahlen, nur die Bildidee
    expect(a.bilder).toHaveLength(3);
    for (const b of a.bilder) {
      expect(b.referenceImageUrl ?? null).toBeNull();
      expect(b.styleHint ?? null).toBeNull();
      expect(b.bildidee).toEqual(BILDIDEE);
      ohneVerbotenes(b, "Creative-Erzeugung");
    }

    // Bei Meta: Anzeigennamen und Texte ohne die Quelle
    const posts = a.meta.posts();
    expect(posts.filter((p) => p.path.endsWith("/ads"))).toHaveLength(3);
    ohneVerbotenes(posts, "Meta");

    // Admin-Ansicht: keine Vorschaubilder, keine Zahlen, kein Name der Quelle
    const view = (await getRunView(start.runId))!;
    expect(view.fremdvorlagen).toBe(true);
    expect(view.eigeneGewinner).toBeNull();
    expect(view.fremdMuster).toEqual([
      { passtZumProdukt: true, video: false, bildidee: true, genutzt: true },
      { passtZumProdukt: false, video: true, bildidee: false, genutzt: false },
    ]);
    expect(view.eigeneGewinnerHinweis).toMatch(/^Muster aus einem anderen Werbekonto/);
    ohneVerbotenes(view, "Admin-Ansicht");
    expect(JSON.stringify(view)).not.toContain(quelle.id);
    expect(JSON.stringify(view)).not.toContain(quelle.name);
  });

  it("ohne Bildidee (Aufruf scheitert bzw. liefert freien Text): das Bild entfällt, Aufhänger und Textaufbau bleiben", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const a = aufbau({ antworten: { Bildidee: { ...BILDIDEE, motivart: "Max Lohmann mit Katze vor seinem Büro in Musterstadt" } } });
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    const ctx = await kontext(start.runId);
    expect(ctx.fremdMuster!.map((m) => m.bildidee)).toEqual([null, null]);
    ohneVerbotenes({ ...ctx, vorlagenQuelleId: null }, "gespeicherter Kontext");
    expect(await processCampaignRun(start.runId, a.deps)).toBe("built");
    for (const b of a.bilder) {
      expect(b.referenceImageUrl ?? null).toBeNull();
      expect(b.styleHint ?? null).toBeNull();
      expect(b.bildidee).toBeUndefined();
      ohneVerbotenes(b, "Creative-Erzeugung");
    }
  });

  // ─── 4: Ausgabeprüfung im Ablauf ─────────────────────────────────────

  it("Ausgabeprüfung: Name der Quelle im Text → Texter überarbeitet mit dem Befund, danach läuft der Lauf weiter", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const mitName = { ads: anzeigen().map((x, i) => (i === 1 ? { ...x, imageSubline: "Ihr Berater Max Lohmann" } : x)) };
    const a = aufbau({ antworten: { Texter: mitName, "Texter (Überarbeitung)": { ads: anzeigen() } } });
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    expect(await processCampaignRun(start.runId, a.deps)).toBe("built");
    const ueber = a.llm.von("Texter (Überarbeitung)");
    expect(ueber).toHaveLength(1);
    expect(ueber[0].user).toMatch(/\[rot\] bild #2: Kleine Zeile im Bild enthält „Max“, „Lohmann“: Name bzw\. Ort aus einem anderen Werbekonto\./);
    expect((await schritte(start.runId)).find((s) => s.key === "texter")).toMatchObject({ status: "fertig", note: "nach den Leitplanken für Lernmuster überarbeitet" });
    // Bilder entstehen erst nach der Prüfung: kein Bild mit dem Namen
    expect(a.bilder).toHaveLength(3);
    ohneVerbotenes(a.bilder, "Creative-Erzeugung");
    ohneVerbotenes(a.meta.posts(), "Meta");
    ohneVerbotenes((await lauf(start.runId)).copies, "gespeicherte Texte");
  });

  it("Ausgabeprüfung: wörtliche Übernahme bleibt auch nach der Überarbeitung → Prüfung rot, kein Bild, nichts bei Meta", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const kopiert = { ads: anzeigen({ primaryText: "Seit 2024 sind die Kosten um bis zu 40 % gestiegen, eine OP kostet schnell 1.500 Euro. Tragen Sie Ihre Angaben ein, ich rufe Sie an." }) };
    const a = aufbau({ antworten: { Texter: kopiert } });
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    expect(await processCampaignRun(start.runId, a.deps)).toBe("blocked");
    const row = await lauf(start.runId);
    expect(row.status).toBe("blocked");
    expect(row.error).toBe(`Prüfung rot: ${LEITPLANKEN_ROT}`);
    const review = row.review as unknown as ReviewResult;
    expect(review.status).toBe("rot");
    expect(review.findings).toHaveLength(3);
    expect(review.findings[0]).toMatchObject({ severity: "rot", area: "text", index: 0 });
    expect(review.findings[0].issue).toMatch(/^Primärtext übernimmt ein Lernmuster wörtlich/);
    expect(a.llm.von("Texter (Überarbeitung)")).toHaveLength(1);
    expect(a.bilder).toHaveLength(0);
    expect(a.meta.posts()).toHaveLength(0);
    expect(a.notes).toEqual([expect.stringMatching(/Prüfung rot$/)]);
    const s = await schritte(start.runId);
    expect(s.find((x) => x.key === "texter")).toMatchObject({ status: "fehler" });
    expect(s.find((x) => x.key === "anlegen")).toMatchObject({ status: "uebersprungen" });
    // und ein rot geprüfter Lauf lässt sich nicht anlegen
    expect(await buildCampaignRun(start.runId, a.deps)).toBe("blocked");
    expect(a.meta.posts()).toHaveLength(0);
  });

  it("Schlüssel des Winkels mit Namensteil der Quelle wird neutral: der Anzeigenname bei Meta nennt die Quelle nicht", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const keys = ["kosten", "lohmann-regional", "musterstadt-neugier"];
    const mitSchluessel = winkel("Lernmuster 1, weil").map((w, i) => ({ ...w, key: keys[i] }));
    const a = aufbau({ antworten: { "Angle-Rechercheur": { angles: mitSchluessel }, Texter: (_n: number, req: LlmRequest) => ({ ads: anzeigen({}, [...req.user.matchAll(/^- ([a-z0-9-]+): Winkel/gm)].map((m) => m[1])) }) } });
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    expect(await processCampaignRun(start.runId, a.deps)).toBe("built");
    const row = await lauf(start.runId);
    expect((row.angles as unknown as Angle[]).map((x) => x.key)).toEqual(["kosten", "winkel-2", "winkel-3"]);
    const namen = a.meta.posts().filter((p) => /\/(ads|adcreatives)$/.test(p.path)).map((p) => String(p.body!.name));
    expect(namen).toHaveLength(6);
    expect(namen.filter((n) => / \| winkel-2$/.test(n))).toHaveLength(2);
    ohneVerbotenes(namen, "Anzeigennamen");
  });

  it("von Hand geänderter Text mit Namen der Quelle: letzte Sperre vor dem Anlegen, nichts geht zu Meta", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const a = aufbau();
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id, autoBuild: false }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    expect(await processCampaignRun(start.runId, a.deps)).toBe("review");
    const copies = (await lauf(start.runId)).copies as unknown as AdCopy[];
    copies[0] = { ...copies[0], headline: "Wie bei Lohmann" };
    await prisma.campaignRun.update({ where: { id: start.runId }, data: { copies: copies as unknown as Prisma.InputJsonValue } });
    expect(await buildCampaignRun(start.runId, a.deps)).toBe("blocked");
    expect(a.meta.posts()).toHaveLength(0);
    const row = await lauf(start.runId);
    expect((row.review as unknown as ReviewResult).findings.at(-1)!.issue).toMatch(/^Überschrift enthält „Lohmann“/);
    expect((await schritte(start.runId)).find((x) => x.key === "anlegen")).toMatchObject({ status: "fehler" });
  });

  // ─── 7, 8: Sperre und unbekannte Quelle ──────────────────────────────

  it("Widerspruch: vorlagenVon wird abgelehnt, wenn Quelle ODER Ziel ausgenommen ist; es entsteht kein Lauf", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    for (const [gesperrt, meldung] of [
      [[quelle.id], /Der Kunde, dessen Anzeigen als Muster dienen sollen, ist vom gemeinsamen Anzeigenlernen ausgenommen/],
      [[ziel.id], /Dieser Kunde ist vom gemeinsamen Anzeigenlernen ausgenommen/],
    ] as const) {
      const a = aufbau({ gesperrt: () => [...gesperrt] });
      const r = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id }, a.deps);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.problems).toEqual([{ key: "lernSperre", message: expect.stringMatching(meldung) }]);
      expect(a.geladen).toEqual([]);
      expect(a.llm.reqs).toEqual([]);
    }
    expect(await prisma.campaignRun.count({ where: { customerId: ziel.id } })).toBe(0);

    // loadCampaignContext lädt dann keine Fremdvorlagen (und weicht nicht stillschweigend auf eigene aus)
    const a = aufbau({ gesperrt: () => [quelle.id] });
    const ctx = await loadCampaignContext(ziel.id, PRODUCT, { vorlagenVon: quelle.id, lernSperre: a.deps.lernSperre, eigeneGewinner: a.deps.eigeneGewinner });
    expect(ctx).toMatchObject({ fremdvorlagen: false, fremdMuster: null, eigeneGewinner: null, eigeneGewinnerHinweis: HINWEIS_GESPERRT, vorlagenQuelleId: null });
    expect(a.geladen).toEqual([]);
    ohneVerbotenes(ctx, "Kontext bei Widerspruch");

    // Ein ausgenommener Kunde nutzt seine EIGENEN Gewinner weiter wie bisher
    const eigen = aufbau({ gesperrt: () => [ziel.id] });
    const ohne = await startCampaignRun({ customerId: ziel.id, product: PRODUCT }, eigen.deps);
    expect(ohne.ok).toBe(true);
    if (ohne.ok) expect((await kontext(ohne.runId)).eigeneGewinner).toEqual(EIGENE_GEWINNER);
  });

  it("unbekannter Quellkunde bzw. Quelle ohne Werbekonto: klare Meldung statt stillschweigend eigener Vorlagen", async () => {
    const ziel = await zielKunde();
    const ohneKonto = await quellKunde({ account: null });
    const a = aufbau();
    const fehlt = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: "gibt-es-nicht" }, a.deps);
    expect(fehlt).toEqual({ ok: false, problems: [{ key: "vorlagenVon", message: MELDUNG_QUELLE_FEHLT }] });
    const konto = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: ohneKonto.id }, a.deps);
    expect(konto).toEqual({ ok: false, problems: [{ key: "vorlagenVon", message: MELDUNG_QUELLE_OHNE_KONTO }] });
    // weder eigene noch fremde Gewinner wurden geladen, kein Lauf entstand
    expect(a.geladen).toEqual([]);
    expect(await prisma.campaignRun.count({ where: { customerId: ziel.id } })).toBe(0);
    await expect(loadCampaignContext(ziel.id, PRODUCT, { vorlagenVon: "gibt-es-nicht", eigeneGewinner: a.deps.eigeneGewinner })).rejects.toBeInstanceOf(VorlagenFehler);
    await expect(loadCampaignContext(ziel.id, PRODUCT, { vorlagenVon: ohneKonto.id, eigeneGewinner: a.deps.eigeneGewinner })).rejects.toThrow(MELDUNG_QUELLE_OHNE_KONTO);
    expect(a.geladen).toEqual([]);
  });

  it("Werbebibliothek: Seiten ausgenommener eigener Kunden und die Quelle des Laufs sind ausgeschlossen", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const andere = await quellKunde({ account: "333000333" });
    process.env.META_AD_LIBRARY_TOKEN = "tok";
    const start = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const data = [
      { page_id: andere.metaPageId, page_name: "Katzen gut versichert", ad_creative_bodies: ["Anzeige eines eigenen Kunden (über die Seiten-ID)"], ad_delivery_start_time: start },
      { page_id: "1", page_name: andere.name, ad_creative_bodies: ["Anzeige eines eigenen Kunden (über den Namen)"], ad_delivery_start_time: start },
      { page_id: quelle.metaPageId, page_name: "Seite der Quelle", ad_creative_bodies: ["Anzeige der Quelle dieses Laufs"], ad_delivery_start_time: start },
      { page_id: "500", page_name: "Tierversicherer A", ad_creative_bodies: ["Die letzte Tierarztrechnung war zu hoch?"], ad_delivery_start_time: start },
    ];
    vi.stubGlobal("fetch", async (url: string) => {
      expect(String(url)).toContain("ads_archive");
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const a = aufbau();
    const lade = (o: { gesperrt: string[]; vorlagenVon?: string }) =>
      loadCampaignContext(ziel.id, PRODUCT, { vorlagenVon: o.vorlagenVon, eigeneGewinner: a.deps.eigeneGewinner, lernSperre: async (gefragt) => new Set(gefragt.filter((id) => o.gesperrt.includes(id))) });

    // niemand ausgenommen: Anzeigen eigener Kunden bleiben (öffentliche Bibliothek), nur die eigene Seite fehlt
    const offen = (await lade({ gesperrt: [] })).libraryWinners!;
    expect(offen).toContain("Katzen gut versichert");
    expect(offen).toContain("Seite der Quelle");
    // ein eigener Kunde ist ausgenommen: seine Seiten fehlen (über Seiten-ID und Namen)
    const gesperrt = (await lade({ gesperrt: [andere.id] })).libraryWinners!;
    expect(gesperrt).not.toMatch(/Katzen gut versichert|eigenen Kunden/);
    expect(gesperrt).toContain("Seite der Quelle");
    expect(gesperrt).toContain("Tierversicherer A");
    // der Zielkunde selbst ist ausgenommen: keine Seite eines eigenen Kunden
    const zielGesperrt = (await lade({ gesperrt: [ziel.id] })).libraryWinners!;
    expect(zielGesperrt).not.toMatch(/Katzen gut versichert|eigenen Kunden|Seite der Quelle/);
    expect(zielGesperrt).toContain("Tierversicherer A");
    // Lauf mit vorlagenVon: die Seite der Quelle erscheint nie, auch nicht über die Bibliothek
    const mitQuelle = await lade({ gesperrt: [], vorlagenVon: quelle.id });
    expect(mitQuelle.libraryWinners).not.toMatch(/Seite der Quelle|Anzeige der Quelle/);
    expect(mitQuelle.libraryWinners).toContain("Katzen gut versichert");
    expect(mitQuelle.fremdvorlagen).toBe(true);
  });

  // ─── 6: Alte Läufe (Kontext im Format vom 24.11.2026) ────────────────

  const ALT_ANGLES = winkel("Eigener Gewinner 1, weil der Hook dort am besten lief");
  const ALT_COPIES = anzeigen({ primaryText: "ALTTEXT Wie hoch war Ihre letzte Tierarztrechnung? Seit 2019 sind die Kosten um bis zu 30 % gestiegen, eine OP kostet schnell zweitausend Euro. Angaben eintragen." });
  const ALT_BILDER = KEYS.map((k) => ({ angleKey: k, imageUrl: `https://r2.test/alt/${k}.jpg` }));

  /** Lauf, wie ihn der Stand vom 24.11.2026 gespeichert hat: Gewinner der Quelle ungefiltert, Hinweis nennt die Quelle. */
  async function altLauf(zielId: string, quelleName: string, data: Partial<Prisma.CampaignRunUncheckedCreateInput> = {}) {
    const basis = await loadCampaignContext(zielId, PRODUCT, { vorlagen: false });
    const context = { ...basis, wish: "stark an Lohmanns Gewinnern anlehnen", eigeneGewinner: FREMDE_GEWINNER, eigeneGewinnerHinweis: `Vorlagen aus dem Werbekonto von ${quelleName}` };
    return prisma.campaignRun.create({
      data: {
        customerId: zielId,
        product: PRODUCT,
        wish: context.wish,
        autoBuild: true,
        status: "review",
        steps: initialSteps().map((s) => ({ ...s, status: s.key === "anlegen" ? "offen" : "fertig" })) as unknown as Prisma.InputJsonValue,
        context: context as unknown as Prisma.InputJsonValue,
        plan: { ...PLAN, campaignName: "PG | Katzenversicherung (TKV) | 2026-11-24", objective: "OUTCOME_LEADS", specialAdCategories: [] } as unknown as Prisma.InputJsonValue,
        angles: ALT_ANGLES as unknown as Prisma.InputJsonValue,
        copies: ALT_COPIES as unknown as Prisma.InputJsonValue,
        creatives: ALT_BILDER as unknown as Prisma.InputJsonValue,
        form: { ...FORM, consentText: basis.consentText ?? FORM.consentText } as unknown as Prisma.InputJsonValue,
        review: GRUEN as unknown as Prisma.InputJsonValue,
        ...data,
      },
    });
  }

  it("alter Lauf, „Bild neu“: nie das Bild der Quelle, der gespeicherte Kontext wird bereinigt", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const alt = await altLauf(ziel.id, quelle.name);
    expect(JSON.stringify(alt.context)).toMatch(/fbcdn/); // Ausgangslage: Bild-Adresse, Namen und Zahlen der Quelle liegen im Kontext
    const a = aufbau();
    expect(await regenerateRunImage(alt.id, 1, a.deps)).toEqual({ ok: true });
    expect(a.bilder).toHaveLength(1);
    expect(a.bilder[0].referenceImageUrl ?? null).toBeNull();
    expect(a.bilder[0].styleHint ?? null).toBeNull();
    expect(a.bilder[0].bildidee).toBeUndefined(); // für alte Läufe gibt es keine Bildidee: das alte Bild wird nie mehr angefasst
    ohneVerbotenes({ ...a.bilder[0], headline: "", subline: "" }, "Creative-Erzeugung");
    expect(a.llm.reqs).toEqual([]);
    const row = await lauf(alt.id);
    const ctx = row.context as unknown as CampaignContext;
    expect(ctx).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null, vorlagenQuelleId: quelle.id, fremdAltlast: "altformat", wish: "stark an [Name] Gewinnern anlehnen" });
    expect(ctx.fremdMuster).toHaveLength(2);
    expect(ctx.eigeneGewinnerHinweis).toMatch(/^Muster aus einem anderen Werbekonto: 2 Anzeigen/);
    ohneVerbotenes({ ...ctx, vorlagenQuelleId: null }, "gespeicherter Kontext");
    expect(JSON.stringify(ctx)).not.toContain(quelle.name);
    expect(row.wish).toBe("stark an [Name] Gewinnern anlehnen");
    // Admin-Ansicht des alten Laufs: keine Vorschaubilder und Zahlen der Quelle
    const view = (await getRunView(alt.id))!;
    expect(view).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null });
    expect(view.fremdMuster!.map((m) => m.genutzt)).toEqual([true, false]);
    ohneVerbotenes({ ...view, copies: null }, "Admin-Ansicht");
    // die Quelle bleibt intern nachvollziehbar
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "kampagne.leitplanken", entityId: alt.id } });
    expect(audit.details).toMatchObject({ vorlagenVon: quelle.id });
  });

  it("alter Lauf ohne Bereinigung in der Ansicht: getRunView zeigt schon beim Lesen nichts von der Quelle", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const alt = await altLauf(ziel.id, quelle.name, { copies: anzeigen() as unknown as Prisma.InputJsonValue });
    const view = (await getRunView(alt.id))!;
    expect(view).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null, eigeneGewinnerHinweis: "Muster aus einem anderen Werbekonto: 2 Anzeigen als Muster (ohne Namen, Bilder und Zahlen)." });
    ohneVerbotenes(view, "Admin-Ansicht");
    expect(JSON.stringify(view)).not.toContain(quelle.name);
  });

  it("alter Lauf, Fortsetzen (Anlegen): Texte und Bilder aus der Zeit vor den Leitplanken werden neu erzeugt, erst dann wird angelegt", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const alt = await altLauf(ziel.id, quelle.name);
    const a = aufbau();
    expect(await buildCampaignRun(alt.id, a.deps)).toBe("built");
    // alles neu mit den Leitplanken, auch Plan und Formular: damals sahen alle Agenten die ungefilterten Gewinner
    expect(a.llm.reqs.map((r) => r.agent)).toEqual(["Stratege", "Angle-Rechercheur", "Texter", "Formular-Agent", "Prüfer"]);
    for (const r of a.llm.reqs) {
      expect(r.imageUrls).toBeUndefined();
      ohneVerbotenes(anweisung(r), `Anweisung ${r.agent}`);
      expect(anweisung(r)).not.toMatch(/EIGENE GEWINNER|eigenen Anzeigen des Kunden|Klickrate/);
    }
    for (const agent of ["Angle-Rechercheur", "Texter", "Prüfer"]) expect(anweisung(a.llm.von(agent)[0])).toContain("Lernmuster 1 (gleiches Produkt)");
    expect(a.bilder).toHaveLength(3);
    for (const b of a.bilder) {
      expect(b.referenceImageUrl ?? null).toBeNull();
      expect(b.styleHint ?? null).toBeNull();
      ohneVerbotenes(b, "Creative-Erzeugung");
    }
    const posts = a.meta.posts();
    expect(posts.filter((p) => p.path.endsWith("/ads"))).toHaveLength(3);
    expect(JSON.stringify(posts)).not.toMatch(/ALTTEXT|r2\.test\/alt\//);
    ohneVerbotenes(posts, "Meta");
    const row = await lauf(alt.id);
    const ctx = row.context as unknown as CampaignContext;
    expect(ctx).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null, vorlagenQuelleId: quelle.id });
    expect(ctx.fremdAltlast).toBeUndefined();
    ohneVerbotenes({ ...ctx, vorlagenQuelleId: null }, "gespeicherter Kontext");
    ohneVerbotenes([row.plan, row.angles, row.copies, row.creatives, row.form, row.review], "gespeicherte Ergebnisse");
    expect((row.steps as unknown as RunStep[]).find((s) => s.key === "winkel")).toMatchObject({ status: "fertig", note: "neu erzeugt: Leitplanken für Muster aus einem anderen Werbekonto" });
    expect((row.steps as unknown as RunStep[]).every((s) => s.status === "fertig")).toBe(true);
  });

  it("alter Lauf, schon teilweise bei Meta angelegt (auch nur die Kampagne): wird nicht fortgesetzt, klare Meldung", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    for (const built of [
      { ...emptyBuilt(), campaignId: "c1", adSetIds: ["as1"], formId: "f1", imageHashes: ["h1"], creativeIds: ["cr1"] },
      { ...emptyBuilt(), campaignId: "c1", adSetIds: ["as1"] }, // Plan des alten Laufs steckt schon in Kampagne und Anzeigengruppe
    ]) {
      const alt = await altLauf(ziel.id, quelle.name, { status: "failed", built: built as unknown as Prisma.InputJsonValue });
      const a = aufbau();
      expect(await buildCampaignRun(alt.id, a.deps)).toBe("blocked");
      expect(a.meta.posts()).toHaveLength(0);
      expect(a.llm.reqs).toEqual([]);
      const row = await lauf(alt.id);
      expect(row.error).toBe(`Prüfung rot: ${ALTLAST_BEI_META}`);
      expect((row.steps as unknown as RunStep[]).find((s) => s.key === "anlegen")).toMatchObject({ status: "fehler", error: ALTLAST_BEI_META });
      ohneVerbotenes({ ...(row.context as object), vorlagenQuelleId: null }, "gespeicherter Kontext");
    }
  });

  it("alte Läufe werden vorsorglich bereinigt (Cron), ohne dass ein abgeschlossener Lauf als neu bearbeitet zählt", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const fertig = await altLauf(ziel.id, quelle.name, { status: "built", built: { ...emptyBuilt(), campaignId: "c1", adSetIds: ["as1"], formId: "f1", imageHashes: ["h"], creativeIds: ["c"], adIds: ["a"] } as unknown as Prisma.InputJsonValue });
    const offen = await altLauf(ziel.id, quelle.name, { status: "review" });
    const gesperrt = await altLauf(ziel.id, quelle.name, { status: "running", lockedAt: new Date() }); // wird gerade bearbeitet
    const a = aufbau();
    expect(await bereinigeAlteFremdKontexte(a.deps, 200)).toBeGreaterThanOrEqual(2);
    for (const id of [fertig.id, offen.id]) {
      const ctx = await kontext(id);
      expect(ctx).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null, vorlagenQuelleId: quelle.id });
      ohneVerbotenes({ ...ctx, vorlagenQuelleId: null }, "gespeicherter Kontext");
      expect((await lauf(id)).updatedAt).toEqual(id === fertig.id ? fertig.updatedAt : offen.updatedAt);
      expect((await lauf(id)).wish).toBe("stark an [Name] Gewinnern anlehnen");
    }
    // der offene Lauf wird beim Fortsetzen neu erzeugt, der abgeschlossene bleibt, wie er ist
    expect((await kontext(offen.id)).fremdAltlast).toBe("altformat");
    expect((await kontext(fertig.id)).fremdAltlast).toBeUndefined();
    expect((await lauf(fertig.id)).status).toBe("built");
    // der gerade bearbeitete Lauf bleibt aus (er sichert seinen Kontext selbst ab)
    expect(JSON.stringify(await kontext(gesperrt.id))).toMatch(/fbcdn/);
    // danach liegt für diese Läufe nichts mehr im alten Format vor
    await prisma.campaignRun.delete({ where: { id: gesperrt.id } });
    expect(await prisma.campaignRun.count({ where: { customerId: ziel.id, context: { path: ["eigeneGewinnerHinweis"], string_starts_with: "Vorlagen aus dem Werbekonto von " } } })).toBe(0);
    expect(a.llm.reqs).toEqual([]);
    expect(a.bilder).toEqual([]);
  });

  const mueder = (adSetId: string) => [{ adId: "o1", adName: "Alt o1", adSetId, reasons: ["Frequenz 4.2 (über 3)"] }];
  const angelegt = (kampagne: string) => ({ ...emptyBuilt(), campaignId: kampagne, adSetIds: ["as1"], formId: "form1", imageHashes: ["h1", "h2", "h3"], creativeIds: ["c1", "c2", "c3"], adIds: ["a1", "a2", "a3"] }) as unknown as Prisma.InputJsonValue;

  it("alter Lauf, Auffrischung: der kopierte Kontext ist bereinigt, die neuen Anzeigen entstehen mit den Leitplanken", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    const kampagne = `camp-${uid()}`;
    // Plan und Texte des alten Laufs nennen die Quelle (damals sahen alle Agenten ihre Anzeigennamen)
    const alt = await altLauf(ziel.id, quelle.name, {
      status: "built",
      built: angelegt(kampagne),
      plan: { ...PLAN, zielgruppe: "Katzenhalter wie bei Lohmann in Musterstadt", campaignName: "PG | Katzenversicherung (TKV) | 2026-11-24", objective: "OUTCOME_LEADS", specialAdCategories: [] } as unknown as Prisma.InputJsonValue,
      copies: anzeigen({ headline: "Wie bei Lohmann" }) as unknown as Prisma.InputJsonValue,
    });
    const a = aufbau();
    const runId = await createRefreshRun({ sourceRunId: alt.id, customerId: ziel.id, campaignId: kampagne, adSetId: "as1", fatigued: mueder("as1"), createdBy: "test", lernSperre: a.deps.lernSperre });
    expect(runId).toBeTruthy();
    // der angelegte Ursprungslauf wird nur bereinigt, nicht „bearbeitet“ (Zeitstempel bleibt, Monatsbericht zählt danach)
    expect((await lauf(alt.id)).updatedAt).toEqual(alt.updatedAt);
    // kopierter Kontext: bereinigt, mit Kennzeichen; auch am Ursprungslauf bleibt nichts von der Quelle liegen
    for (const id of [runId!, alt.id]) {
      const ctx = await kontext(id);
      expect(ctx).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null, vorlagenQuelleId: quelle.id });
      expect(ctx.fremdAltlast).toBeUndefined();
      ohneVerbotenes({ ...ctx, vorlagenQuelleId: null }, `Kontext ${id === alt.id ? "Ursprungslauf" : "Auffrischung"}`);
      expect(JSON.stringify(ctx)).not.toContain(quelle.name);
    }
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "kampagne.start", entityId: runId! } })).details).toMatchObject({ kind: "auffrischung", vorlagenVon: quelle.id });

    expect(await processRefreshRun(runId!, { ...a.deps, task: async () => undefined })).toBe("built");
    expect(a.llm.reqs.map((r) => r.agent)).toEqual(["Angle-Rechercheur", "Texter", "Prüfer"]);
    for (const r of a.llm.reqs) {
      expect(r.imageUrls).toBeUndefined();
      ohneVerbotenes(anweisung(r), `Anweisung ${r.agent}`);
      expect(anweisung(r)).not.toMatch(/EIGENE GEWINNER|eigenen Anzeigen des Kunden|Klickrate/);
      expect(anweisung(r)).toContain("LERNMUSTER AUS DEM GEMEINSAMEN ANZEIGENLERNEN");
    }
    // Plan und bisherige Anzeigen des alten Laufs stehen ohne den Namen der Quelle in den Anweisungen
    expect(a.llm.von("Angle-Rechercheur")[0].user).toContain("ZIELGRUPPE LAUT PLAN: Katzenhalter wie bei [Name] in [Ort]");
    expect(a.llm.von("Angle-Rechercheur")[0].user).toContain("Bisherige Anzeigen: „Wie bei [Name]“ / „Tierarztrechnung?“");
    expect(a.llm.von("Prüfer")[0].user).toContain("Katzenhalter wie bei [Name] in [Ort]");
    expect(a.bilder).toHaveLength(3);
    for (const b of a.bilder) {
      expect(b.referenceImageUrl ?? null).toBeNull();
      expect(b.styleHint ?? null).toBeNull();
      ohneVerbotenes(b, "Creative-Erzeugung");
    }
    const posts = a.meta.posts();
    expect(posts.filter((p) => p.path.endsWith("/ads"))).toHaveLength(3);
    ohneVerbotenes(posts, "Meta");
  });

  it("Widerspruch nach dem Lauf: bei der Auffrischung werden die gespeicherten Muster entfernt (auch im alten Format)", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    for (const [name, gesperrt] of [
      ["Quelle", quelle.id],
      ["Ziel", ziel.id],
    ]) {
      const kampagne = `camp-${uid()}`;
      // einmal ein Lauf im neuen Format (über startCampaignRun), einmal im alten
      let ursprung: string;
      if (name === "Quelle") {
        const s = aufbau();
        const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id }, s.deps);
        if (!start.ok) throw new Error(JSON.stringify(start.problems));
        expect(await processCampaignRun(start.runId, s.deps)).toBe("built");
        await prisma.campaignRun.update({ where: { id: start.runId }, data: { built: angelegt(kampagne) } });
        ursprung = start.runId;
      } else {
        ursprung = (await altLauf(ziel.id, quelle.name, { status: "built", built: angelegt(kampagne) })).id;
      }
      const a = aufbau({ gesperrt: () => [gesperrt] });
      const runId = await createRefreshRun({ sourceRunId: ursprung, customerId: ziel.id, campaignId: kampagne, adSetId: "as1", fatigued: mueder("as1"), createdBy: "test", lernSperre: a.deps.lernSperre });
      for (const id of [runId!, ursprung]) {
        const ctx = await kontext(id);
        expect(ctx, name).toMatchObject({ fremdvorlagen: false, fremdMuster: null, eigeneGewinner: null, vorlagenQuelleId: null, eigeneGewinnerHinweis: HINWEIS_ENTFERNT });
        ohneVerbotenes(ctx, `Kontext nach Widerspruch (${name})`);
      }
      expect(await processRefreshRun(runId!, { ...a.deps, task: async () => undefined })).toBe("built");
      for (const r of a.llm.reqs) {
        expect(anweisung(r)).not.toMatch(KEIN_MUSTERBLOCK);
        ohneVerbotenes(anweisung(r), `Anweisung ${r.agent}`);
      }
      for (const b of a.bilder) {
        expect(b.bildidee).toBeUndefined();
        expect(b.referenceImageUrl ?? null).toBeNull();
      }
      expect(await prisma.auditLog.count({ where: { action: "kampagne.leitplanken", entityId: ursprung } })).toBe(1);
    }
  });

  it("Widerspruch während eines Laufs: beim Fortsetzen werden die Muster entfernt und Winkel, Texte, Bilder ohne sie neu erzeugt", async () => {
    const ziel = await zielKunde();
    const quelle = await quellKunde();
    let gesperrt: string[] = [];
    const a = aufbau({ gesperrt: () => gesperrt });
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT, vorlagenVon: quelle.id, autoBuild: false }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    expect(await processCampaignRun(start.runId, a.deps)).toBe("review");
    const vorher = a.llm.reqs.length;
    const bilderVorher = a.bilder.length;
    expect((await kontext(start.runId)).fremdMuster).toHaveLength(2);

    gesperrt = [quelle.id]; // die Quelle widerspricht, bevor angelegt wurde
    // „Bild neu“: die gespeicherten Muster sind sofort weg, das Bild entsteht ohne Bildidee
    expect(await regenerateRunImage(start.runId, 0, a.deps)).toEqual({ ok: true });
    expect(a.bilder[bilderVorher].bildidee).toBeUndefined();
    expect(await kontext(start.runId)).toMatchObject({ fremdvorlagen: false, fremdMuster: null, vorlagenQuelleId: null, eigeneGewinnerHinweis: HINWEIS_ENTFERNT, fremdAltlast: "entfernt" });

    // „Bei Meta anlegen“: nicht mit den Texten aus den entfernten Mustern, sondern neu ohne Muster, dann zur Freigabe
    expect(await buildCampaignRun(start.runId, a.deps)).toBe("review");
    expect(a.meta.posts()).toHaveLength(0);
    const neu = a.llm.reqs.slice(vorher);
    expect(neu.map((r) => r.agent)).toEqual(["Angle-Rechercheur", "Texter", "Prüfer"]);
    for (const r of neu) expect(anweisung(r)).not.toMatch(KEIN_MUSTERBLOCK);
    for (const b of a.bilder.slice(bilderVorher)) expect(b.bildidee).toBeUndefined();
    const ctx = await kontext(start.runId);
    expect(ctx).toMatchObject({ fremdvorlagen: false, fremdMuster: null });
    expect(ctx.fremdAltlast).toBeUndefined();
    // jetzt lässt sich der Lauf wie gewohnt anlegen
    expect(await buildCampaignRun(start.runId, a.deps)).toBe("built");
    expect(a.meta.posts().filter((p) => p.path.endsWith("/ads"))).toHaveLength(3);
  });

  // ─── Eigener Gewinner-Weg ────────────────────────────────────────────

  it("eigener Gewinner-Weg unverändert: eigene Zahlen und Namen in den Anweisungen, eigenes Bild als Vorlage, Kontext wie bisher", async () => {
    const ziel = await zielKunde();
    const a = aufbau({ antworten: { "Angle-Rechercheur": { angles: winkel("Eigener Gewinner 1, weil der Hook dort am besten lief") } } });
    const start = await startCampaignRun({ customerId: ziel.id, product: PRODUCT }, a.deps);
    if (!start.ok) throw new Error(JSON.stringify(start.problems));
    expect(a.geladen).toEqual([{ customerId: ziel.id, adAccountId: "222000222" }]);
    const row = await lauf(start.runId);
    const ctx = row.context as unknown as CampaignContext;
    expect(ctx.eigeneGewinner).toEqual(EIGENE_GEWINNER);
    expect(ctx.eigeneGewinnerHinweis).toBeNull();
    for (const feld of ["fremdvorlagen", "fremdMuster", "vorlagenQuelleId", "fremdAltlast"]) expect(ctx, feld).not.toHaveProperty(feld);
    expect(row.costCents).toBe(0);
    expect(a.llm.von("Bildidee")).toEqual([]);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "kampagne.start", entityId: start.runId } })).details).toEqual({ product: PRODUCT });

    expect(await processCampaignRun(start.runId, a.deps)).toBe("built");
    for (const agent of ["Stratege", "Angle-Rechercheur", "Texter", "Formular-Agent", "Prüfer"]) {
      const text = anweisung(a.llm.von(agent)[0]);
      expect(text, agent).toContain("EIGENE GEWINNER AUS IHREM WERBEKONTO (echte Zahlen der letzten 90 Tage, bestlaufende Anzeigen dieses Kunden, beste zuerst):");
      expect(text, agent).toContain("Eigener Gewinner 1: „Katze Rechnung“ (gleiches Produkt); 8,00 € je Lead, 30 Leads, 6 Termine (40,00 € je Termin), Klickrate 1,8 %, 240 € Ausgaben");
      expect(text, agent).toContain("Es sind die eigenen Anzeigen des Kunden");
      expect(text, agent).not.toMatch(/Lernmuster|LERNMUSTER/);
    }
    expect(a.llm.von("Texter (Überarbeitung)")).toEqual([]);
    expect(a.bilder).toHaveLength(3);
    for (const b of a.bilder) {
      expect(b.referenceImageUrl).toBe(EIGENES_BILD);
      expect(b.styleHint).toBe(
        "Eigene Gewinner-Anzeige des Kunden „Katze Rechnung“ (8 € je Lead, 30 Leads, Überschrift „Katze absichern“). Bildaufbau, Motivart, Farbwelt, Bildausschnitt und Platzierung der Texte als Vorlage nehmen und für das neue Produkt abwandeln. Keine Texte, Logos oder Preise aus dem Vorlagenbild übernehmen.",
      );
      expect(b).not.toHaveProperty("bildidee");
    }
    const view = (await getRunView(start.runId))!;
    expect(view.fremdvorlagen).toBe(false);
    expect(view.fremdMuster).toBeNull();
    expect(view.eigeneGewinner).toEqual(EIGENE_GEWINNER);
    // „Bild neu“ und die Auffrischung nutzen die eigenen Gewinner weiter
    await prisma.campaignRun.update({ where: { id: start.runId }, data: { built: emptyBuilt() as unknown as Prisma.InputJsonValue } });
    expect(await regenerateRunImage(start.runId, 0, a.deps)).toEqual({ ok: true });
    expect(a.bilder.at(-1)!.referenceImageUrl).toBe(EIGENES_BILD);
    expect((await kontext(start.runId)).eigeneGewinner).toEqual(EIGENE_GEWINNER);
    expect(await prisma.auditLog.count({ where: { action: "kampagne.leitplanken", customerId: ziel.id } })).toBe(0);
  });
});
