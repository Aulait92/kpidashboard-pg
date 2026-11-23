import { describe, expect, it } from "vitest";
import {
  creativeInhalt,
  eigeneGewinnerBlock,
  gewinnerFehlerHinweis,
  gewinnerFuerWinkel,
  kandidatAusInsight,
  ladeEigeneGewinner,
  produktPruefer,
  waehleBestperformer,
  winkelMitEigenemGewinner,
  type Kandidat,
} from "@/lib/kampagnen/eigene-gewinner";
import { eigeneGewinnerAbschnitt, staticChecks } from "@/lib/kampagnen/agents";
import type { MetaApi } from "@/lib/kampagnen/builder";
import type { CampaignContext, CampaignPlan, EigenerGewinner, LeadFormDraft } from "@/lib/kampagnen/types";

// Eigene Gewinner (Ole, 21.11.2026): bestlaufende Anzeigen aus dem eigenen Werbekonto als Vorlage für Texte und Bilder.

const k = (adId: string, ausgaben: number, metaLeads: number, name = `Anzeige ${adId}`, kampagne: string | null = null): Kandidat => ({
  adId,
  name,
  kampagne,
  anzeigengruppe: null,
  ausgaben,
  impressionen: 1000,
  ctr: 1.2,
  metaLeads,
});

const gewinner = (over: Partial<EigenerGewinner> = {}): EigenerGewinner => ({
  adId: "1",
  name: "Katze Tierarztrechnung",
  kampagne: "Katze",
  ausgaben: 240,
  leads: 30,
  leadsQuelle: "app",
  termine: 6,
  cpl: 8,
  kostenJeTermin: 40,
  ctr: 1.8,
  primaryText: "Wie hoch war Ihre letzte Tierarztrechnung?",
  headline: "Katze absichern",
  description: null,
  cta: "LEARN_MORE",
  bildUrl: "https://scontent.example/bild.jpg",
  video: false,
  passtZumProdukt: true,
  ...over,
});

describe("Eigene Gewinner: Insights übersetzen", () => {
  it("Leads aus den Lead-Aktionen (höchster Wert), Ausgaben und CTR", () => {
    const r = kandidatAusInsight({
      ad_id: "42",
      ad_name: "Katze A",
      campaign_name: "PG | Katze",
      spend: "123.456",
      impressions: "10000",
      clicks: "150",
      ctr: "1.5",
      actions: [
        { action_type: "lead", value: "12" },
        { action_type: "onsite_conversion.lead_grouped", value: "12" },
        { action_type: "link_click", value: "150" },
      ],
    });
    expect(r).toEqual({ adId: "42", name: "Katze A", kampagne: "PG | Katze", anzeigengruppe: null, ausgaben: 123.46, impressionen: 10000, ctr: 1.5, metaLeads: 12 });
  });

  it("CTR ohne Feld aus Klicks und Impressionen; ohne Anzeigen-ID null", () => {
    expect(kandidatAusInsight({ ad_id: "1", impressions: "2000", clicks: "30" })?.ctr).toBe(1.5);
    expect(kandidatAusInsight({ ad_name: "x" })).toBeNull();
  });
});

describe("Eigene Gewinner: Auswahl und Rangfolge", () => {
  it("Schwellen: mind. 50 € oder mind. 5 Leads, mindestens ein Lead; nach Kosten je Lead", () => {
    const r = waehleBestperformer([k("a", 40, 2), k("b", 60, 0), k("c", 30, 6), k("d", 100, 5), k("e", 200, 10)]);
    expect(r.map((x) => x.adId)).toEqual(["c", "e", "d"]);
    expect(r[0].cpl).toBe(5);
  });

  it("Leads aus unserer Datenbank haben Vorrang, bei genug Terminen zählt Kosten je Termin", () => {
    const leadZahlen = new Map([
      ["a", { leads: 10, termine: 1 }],
      ["b", { leads: 8, termine: 4 }],
      ["c", { leads: 20, termine: 2 }],
    ]);
    const r = waehleBestperformer([k("a", 100, 3), k("b", 100, 3), k("c", 100, 3)], { leadZahlen });
    expect(r.map((x) => x.adId)).toEqual(["b", "c", "a"]);
    expect(r[0]).toMatchObject({ leads: 8, leadsQuelle: "app", termine: 4, kostenJeTermin: 25, cpl: 12.5 });
  });

  it("Passendes Produkt zuerst, aufgefüllt mit anderen, höchstens 5", () => {
    const passt = produktPruefer("Katzenversicherung (TKV)");
    const liste = [k("h1", 100, 50, "Hund OP", "Hund"), k("k1", 100, 10, "Katze Tierarzt", "PG | Katze"), ...["x1", "x2", "x3", "x4"].map((id) => k(id, 100, 20))];
    const r = waehleBestperformer(liste, { passtZumProdukt: passt });
    expect(r).toHaveLength(5);
    expect(r[0]).toMatchObject({ adId: "k1", passtZumProdukt: true });
    expect(r[1].adId).toBe("h1");
  });

  it("Produkt-Matcher als zweites Signal", () => {
    const matcher = (n: string) => (/sterbegeld|vorsorge plus/i.test(n) ? "Sterbegeld" : null);
    const passt = produktPruefer("Sterbegeld", matcher);
    expect(passt(k("1", 1, 1, "Anzeige", "Vorsorge Plus Herbst"))).toBe(true);
    expect(passt(k("2", 1, 1, "Anzeige", "Kfz"))).toBe(false);
  });
});

describe("Eigene Gewinner: Creative-Inhalte", () => {
  it("klassische Link-Anzeige", () => {
    const c = creativeInhalt({
      creative: { object_story_spec: { link_data: { message: "Text", name: "Titel", description: "Beschreibung", picture: "https://x/bild.jpg", call_to_action: { type: "LEARN_MORE" } } }, thumbnail_url: "https://x/thumb.jpg" },
    });
    expect(c).toEqual({ primaryText: "Text", headline: "Titel", description: "Beschreibung", cta: "LEARN_MORE", bildUrl: "https://x/bild.jpg", video: false });
  });

  it("Video: Vorschaubild und Hinweis; dynamisches Creative über asset_feed_spec", () => {
    const v = creativeInhalt({ creative: { video_id: "9", thumbnail_url: "https://x/t.jpg", object_story_spec: { video_data: { message: "Video-Text", title: "V" } } } });
    expect(v).toMatchObject({ primaryText: "Video-Text", headline: "V", bildUrl: "https://x/t.jpg", video: true });
    const d = creativeInhalt({ creative: { asset_feed_spec: { bodies: [{ text: "B" }], titles: [{ text: "T" }], call_to_action_types: ["SIGN_UP"], images: [{ url: "https://x/i.jpg" }] } } });
    expect(d).toMatchObject({ primaryText: "B", headline: "T", cta: "SIGN_UP", bildUrl: "https://x/i.jpg", video: false });
    expect(creativeInhalt(undefined)).toMatchObject({ primaryText: null, bildUrl: null, video: false });
  });
});

const fakeMeta = (impl: (path: string, params: Record<string, string>) => unknown): MetaApi & { calls: { path: string; params: Record<string, string> }[] } => {
  const calls: { path: string; params: Record<string, string> }[] = [];
  return {
    calls,
    async get<T>(path: string, params: Record<string, string> = {}) {
      calls.push({ path, params });
      const r = impl(path, params);
      if (r instanceof Error) throw r;
      return r as T;
    },
    async post() {
      throw new Error("nicht erwartet");
    },
    async del() {
      throw new Error("nicht erwartet");
    },
  };
};

describe("Eigene Gewinner: Laden", () => {
  const now = new Date("2026-11-21T10:00:00Z");

  it("ohne Werbekonto: leer ohne Hinweis, kein Abruf", async () => {
    const meta = fakeMeta(() => ({}));
    const r = await ladeEigeneGewinner({ customerId: "c", adAccountId: null, product: "Katze" }, { meta, leadZahlen: async () => new Map() });
    expect(r).toEqual({ gewinner: [], hinweis: null });
    expect(meta.calls).toHaveLength(0);
  });

  it("keine Berechtigung: leer mit Hinweis, Token wird nicht ausgegeben", async () => {
    const meta = fakeMeta(() => new Error('Meta GET act_1/insights 400: {"error":{"message":"(#200) Ad account owner has NOT grant ads_management or ads_read permission"}} access_token=EAABBBBBBBBBBBBBBBB'));
    const r = await ladeEigeneGewinner({ customerId: "c", adAccountId: "act_1", product: "Katze" }, { meta, leadZahlen: async () => new Map(), now });
    expect(r.gewinner).toEqual([]);
    expect(r.hinweis).toMatch(/kein Lesezugriff/);
    expect(gewinnerFehlerHinweis(new Error("boom access_token=EAAgeheimgeheimgeheim"), "1")).not.toMatch(/geheim/);
  });

  it("keine Anzeige über der Schwelle: leer mit Hinweis", async () => {
    const meta = fakeMeta(() => ({ data: [{ ad_id: "1", spend: "10", actions: [{ action_type: "lead", value: "1" }] }] }));
    const r = await ladeEigeneGewinner({ customerId: "c", adAccountId: "1", product: "Katze" }, { meta, leadZahlen: async () => new Map(), now });
    expect(r.gewinner).toEqual([]);
    expect(r.hinweis).toMatch(/keine Anzeige mit mindestens 50 €/);
  });

  it("Insights der letzten 90 Tage, Leads aus der App, Creatives je Gewinner", async () => {
    const meta = fakeMeta((path, params) => {
      if (path === "act_123/insights") {
        expect(params.level).toBe("ad");
        expect(JSON.parse(params.time_range)).toEqual({ since: "2026-08-24", until: "2026-11-21" });
        return {
          data: [
            { ad_id: "a", ad_name: "Katze Rechnung", campaign_name: "PG | Katze", spend: "120", impressions: "8000", clicks: "120", actions: [{ action_type: "lead", value: "10" }] },
            { ad_id: "b", ad_name: "Hund", campaign_name: "Hund", spend: "80", impressions: "5000", clicks: "40", actions: [{ action_type: "lead", value: "4" }] },
          ],
        };
      }
      expect(params.ids).toBe("a,b");
      return { a: { creative: { body: "Wie hoch war Ihre letzte Tierarztrechnung?", title: "Katze absichern", image_url: "https://x/a.jpg" } } };
    });
    const r = await ladeEigeneGewinner(
      { customerId: "c", adAccountId: "123", product: "Katzenversicherung" },
      { meta, now, leadZahlen: async (_c, ids) => new Map(ids.includes("a") ? [["a", { leads: 12, termine: 3 }]] : []) },
    );
    expect(r.hinweis).toBeNull();
    expect(r.gewinner.map((g) => g.adId)).toEqual(["a", "b"]);
    expect(r.gewinner[0]).toMatchObject({ leads: 12, leadsQuelle: "app", termine: 3, cpl: 10, passtZumProdukt: true, primaryText: "Wie hoch war Ihre letzte Tierarztrechnung?", bildUrl: "https://x/a.jpg" });
    expect(r.gewinner[1]).toMatchObject({ leads: 4, leadsQuelle: "meta", termine: null, cpl: 20, passtZumProdukt: false, primaryText: null });
  });
});

describe("Eigene Gewinner: Agenten", () => {
  it("Abschnitt im Prompt mit Zahlen, Texten und Regeln; ohne Gewinner leer", () => {
    const a = eigeneGewinnerAbschnitt({ anrede: "Sie", eigeneGewinner: [gewinner()] });
    expect(a).toContain("EIGENE GEWINNER AUS IHREM WERBEKONTO (echte Zahlen");
    expect(a).toContain("Eigener Gewinner 1: „Katze Tierarztrechnung“");
    expect(a).toContain("8,00 € je Lead");
    expect(a).toContain("Wie hoch war Ihre letzte Tierarztrechnung?");
    expect(a).toMatch(/Vorrang/);
    expect(a).toMatch(/keine Gedankenstriche/);
    expect(eigeneGewinnerAbschnitt({ anrede: "Sie", eigeneGewinner: null })).toBe("");
    expect(eigeneGewinnerBlock([])).toBeNull();
  });

  it("Winkel → Gewinner (genannt oder bester mit Bild) und Zählung", () => {
    const g = [gewinner({ adId: "1", bildUrl: null }), gewinner({ adId: "2" })];
    expect(gewinnerFuerWinkel(g, "baut auf Eigener Gewinner 1 auf")?.adId).toBe("1");
    expect(gewinnerFuerWinkel(g, "frei")?.adId).toBe("2");
    expect(gewinnerFuerWinkel(null, "x")).toBeNull();
    expect(winkelMitEigenemGewinner([{ insight: "Eigener Gewinner 2" }, { insight: "eigenen Gewinner 1 abgewandelt" }, { insight: "neu" }])).toBe(2);
  });

  it("Feste Prüfung: weniger als zwei Winkel an eigenen Gewinnern → gelb", () => {
    const ctx = {
      customerId: "c",
      customerName: "A",
      advisorName: "M",
      vermittlerTyp: "vertreter",
      insurer: null,
      product: "Katze",
      wish: null,
      anrede: "Sie",
      city: "X",
      zip: "1",
      region: null,
      website: null,
      privacyUrl: "https://x/ds",
      pageId: "1",
      adAccountId: "1",
      dailyBudgetEur: 20,
      cplEur: null,
      special: null,
      assistantKnowledge: null,
      patterns: "",
      eigeneGewinner: [gewinner(), gewinner({ adId: "2" })],
    } satisfies CampaignContext;
    const plan = { dailyBudgetEur: 20 } as CampaignPlan;
    const base = { plan, copies: [], form: {} as LeadFormDraft, images: [] };
    const angle = (insight: string) => ({ key: insight, title: "T", hook: "H", insight });
    const zuWenig = staticChecks(ctx, { ...base, angles: [angle("Eigener Gewinner 1"), angle("neu"), angle("neu2")] });
    expect(zuWenig.some((f) => /eigenen Gewinnern/.test(f.issue))).toBe(true);
    const genug = staticChecks(ctx, { ...base, angles: [angle("Eigener Gewinner 1"), angle("Eigener Gewinner 2"), angle("neu")] });
    expect(genug.some((f) => /eigenen Gewinnern/.test(f.issue))).toBe(false);
    expect(staticChecks({ ...ctx, eigeneGewinner: null }, { ...base, angles: [angle("neu")] }).some((f) => /eigenen Gewinnern/.test(f.issue))).toBe(false);
  });
});
