// Diagnose-Abfrage „kampagnen“ (Ole, 23.11.2026: neue Kampagne eines Kunden mit der alten vergleichen). Nur lesend, live aus
// Meta: Kampagnen des Kunden-Werbekontos mit Einstellungen und Gesamtzahlen, darunter Anzeigengruppen (Ziel, Zielgruppe,
// Lernphase) und Anzeigen (Status, Prüfung, Text, Formular) mit Zahlen.
//   GET /api/ops/diagnose?q=kampagnen&kunde=<Kunden-ID>[&suche=<Teil des Kampagnennamens>]

import { prisma } from "@/lib/prisma";
import { cleanToken, redactTokens } from "@/lib/meta-leads";

const GRAPH = "https://graph.facebook.com/v22.0";
const INSIGHTS = "spend,impressions,reach,frequency,cpm,ctr,clicks,inline_link_clicks,actions,cost_per_action_type";

async function get(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const token = cleanToken(process.env.META_ACCESS_TOKEN);
  if (!token) throw new Error("META_ACCESS_TOKEN fehlt");
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || body.error) throw new Error(redactTokens(JSON.stringify(body.error ?? res.status)).slice(0, 400));
  return body;
}

type Ins = { spend?: string; impressions?: string; reach?: string; frequency?: string; cpm?: string; ctr?: string; clicks?: string; inline_link_clicks?: string; actions?: { action_type: string; value: string }[]; cost_per_action_type?: { action_type: string; value: string }[] };

function zahlen(i: Ins | undefined) {
  if (!i) return null;
  const act = Object.fromEntries((i.actions ?? []).map((a) => [a.action_type, Number(a.value)]));
  return {
    ausgaben: Number(i.spend ?? 0), impressionen: Number(i.impressions ?? 0), reichweite: Number(i.reach ?? 0), frequenz: Number(Number(i.frequency ?? 0).toFixed(2)),
    cpm: Number(Number(i.cpm ?? 0).toFixed(2)), ctr: Number(Number(i.ctr ?? 0).toFixed(2)), klicks: Number(i.clicks ?? 0), linkKlicks: Number(i.inline_link_clicks ?? 0),
    leads: act["lead"] ?? act["leadgen_grouped"] ?? act["onsite_conversion.lead_grouped"] ?? 0,
    aktionen: act,
  };
}

async function insights(id: string): Promise<Ins | undefined> {
  const r = await get(`${id}/insights`, { fields: INSIGHTS, date_preset: "maximum" }).catch(() => null);
  return (r?.data as Ins[] | undefined)?.[0];
}

function zielgruppe(t: Record<string, unknown> | undefined) {
  if (!t) return null;
  const geo = t.geo_locations as Record<string, unknown> | undefined;
  return {
    alter: [t.age_min, t.age_max],
    geschlecht: t.genders ?? "alle",
    orte: geo ? { staedte: (geo.cities as { name: string; radius?: number; distance_unit?: string }[] | undefined)?.map((c) => `${c.name} +${c.radius ?? ""}${c.distance_unit ?? ""}`), plz: (geo.zips as unknown[] | undefined)?.length, regionen: (geo.regions as { name: string }[] | undefined)?.map((r) => r.name), laender: geo.countries, eigene: (geo.custom_locations as unknown[] | undefined)?.length, typ: geo.location_types } : null,
    plattformen: t.publisher_platforms ?? "automatisch", positionen: t.facebook_positions ?? t.instagram_positions ?? null,
    interessen: (t.flexible_spec as unknown[] | undefined) ?? null, ausgeschlossen: t.exclusions ?? null,
    advantage: (t.targeting_automation as Record<string, unknown> | undefined) ?? null,
    customAudiences: (t.custom_audiences as { name?: string }[] | undefined)?.map((c) => c.name) ?? null,
  };
}

export async function kampagnenDiagnose(p: URLSearchParams) {
  const kundeId = p.get("kunde") ?? "";
  const suche = (p.get("suche") ?? "").toLowerCase();
  const k = await prisma.customer.findUnique({ where: { id: kundeId }, select: { name: true, metaAdAccountId: true } });
  if (!k) return { fehler: "kunde=<Kunden-ID> fehlt oder unbekannt" };
  if (!k.metaAdAccountId) return { fehler: "Kein Werbekonto hinterlegt", kunde: k.name };
  const acc = `act_${k.metaAdAccountId.replace(/^act_/, "")}`;
  try {
    const camps = (await get(`${acc}/campaigns`, { fields: "id,name,status,effective_status,objective,created_time,start_time,stop_time,daily_budget,lifetime_budget,bid_strategy,special_ad_categories,buying_type", limit: "50" })).data as Record<string, unknown>[];
    const gewaehlt = camps.filter((c) => !suche || String(c.name).toLowerCase().includes(suche)).slice(0, 8);
    const out = [];
    for (const c of gewaehlt) {
      const sets = ((await get(`${c.id}/adsets`, { fields: "id,name,status,effective_status,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,targeting,promoted_object,destination_type,learning_stage_info,created_time,start_time,end_time", limit: "25" })).data as Record<string, unknown>[]) ?? [];
      const gruppen = [];
      for (const s of sets) {
        const ads = ((await get(`${s.id}/ads`, { fields: "id,name,status,effective_status,created_time,issues_info,ad_review_feedback,creative{id,title,body,call_to_action_type,object_story_spec,asset_feed_spec,image_url,video_id}", limit: "25" })).data as Record<string, unknown>[]) ?? [];
        const anzeigen = [];
        for (const a of ads) {
          const cr = (a.creative ?? {}) as Record<string, unknown>;
          const story = (cr.object_story_spec ?? {}) as Record<string, unknown>;
          const link = (story.link_data ?? story.video_data ?? {}) as Record<string, unknown>;
          const cta = (link.call_to_action ?? {}) as { type?: string; value?: { lead_gen_form_id?: string; link?: string } };
          const feed = (cr.asset_feed_spec ?? null) as Record<string, unknown> | null;
          anzeigen.push({
            id: a.id, name: a.name, status: a.effective_status, erstellt: a.created_time, probleme: a.issues_info ?? null, pruefung: a.ad_review_feedback ?? null,
            text: String(cr.body ?? link.message ?? "").slice(0, 600), titel: cr.title ?? link.name ?? link.title ?? null, cta: cr.call_to_action_type ?? cta.type ?? null,
            formular: cta.value?.lead_gen_form_id ?? null, ziel: cta.value?.link ?? link.link ?? null, video: !!(cr.video_id || story.video_data), feed: feed ? { texte: (feed.bodies as { text: string }[] | undefined)?.map((b) => b.text.slice(0, 300)), titel: (feed.titles as { text: string }[] | undefined)?.map((b) => b.text), bilder: (feed.images as unknown[] | undefined)?.length, videos: (feed.videos as unknown[] | undefined)?.length } : null,
            zahlen: zahlen(await insights(String(a.id))),
          });
        }
        gruppen.push({
          id: s.id, name: s.name, status: s.effective_status, erstellt: s.created_time, start: s.start_time, ende: s.end_time ?? null, optimierung: s.optimization_goal, abrechnung: s.billing_event, gebot: s.bid_strategy, gebotBetrag: s.bid_amount ?? null,
          budgetTag: s.daily_budget ? Number(s.daily_budget) / 100 : null, ziel: s.destination_type ?? null, promoted: s.promoted_object ?? null, lernphase: s.learning_stage_info ?? null,
          zielgruppe: zielgruppe(s.targeting as Record<string, unknown> | undefined), zahlen: zahlen(await insights(String(s.id))), anzeigen,
        });
      }
      out.push({
        id: c.id, name: c.name, status: c.effective_status, ziel: c.objective, erstellt: c.created_time, start: c.start_time, ende: c.stop_time ?? null,
        budgetTag: c.daily_budget ? Number(c.daily_budget) / 100 : null, gebot: c.bid_strategy ?? null, sonderkategorie: c.special_ad_categories, zahlen: zahlen(await insights(String(c.id))), gruppen,
      });
    }
    // Formulare der gezeigten Anzeigen: Fragen, Typ (mehr Volumen / höhere Absicht), Intro, Datenschutz
    const formIds = [...new Set(out.flatMap((c) => c.gruppen.flatMap((g) => g.anzeigen.map((a) => a.formular).filter((f): f is string => !!f))))].slice(0, 12);
    const formulare = [];
    for (const f of formIds) {
      const r = await get(f, { fields: "id,name,status,locale,created_time,is_optimized_for_quality,questions,context_card,thank_you_page,leads_count,question_page_custom_headline,block_display_for_non_targeted_viewer" }).catch((e: unknown) => ({ id: f, fehler: e instanceof Error ? e.message : String(e) }));
      const q = (r as { questions?: { type: string; key?: string; label?: string; options?: { value: string }[] }[] }).questions;
      formulare.push({ ...r, questions: q?.map((x) => ({ typ: x.type, key: x.key, label: x.label, optionen: x.options?.map((o) => o.value) })) });
    }
    return { kunde: k.name, konto: acc, kampagnenGesamt: camps.length, alleNamen: camps.map((c) => `${c.name} (${c.effective_status})`), kampagnen: out, formulare };
  } catch (e) {
    return { kunde: k.name, fehler: e instanceof Error ? e.message : String(e) };
  }
}
