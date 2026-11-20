// Meta für die eigenen Funnels (Ole, 20.11.2026): Pixel im Browser (PageView, „Lead“ beim Absenden) und dieselbe
// event_id serverseitig über die Conversions API, damit Meta beide zusammenführt. Nutzerdaten nur gehasht (SHA-256),
// dazu fbc/fbp, IP und User-Agent (laut Meta ungehasht). Dataset = Pixel-ID.
//
// Vorbereitet: Qualitäts-Ereignis, sobald der Abnehmer einen Funnel-Lead erreicht hat (Ole, 20.11.2026: Erreichen,
// Termin und Abschluss zählen mehr als „verkauft“; lib/funnel/server.ts funnelReifePruefen), mit dem Verkaufspreis als
// Wert. Damit kann Meta auf gute Leads optimieren. Standard AUS, bis Ole freigibt: FUNNEL_META_QUALITAET=an.
// Ereignisname FUNNEL_META_QUALITAET_EVENT, Standard „LeadErreicht“ (eigenes Ereignis; für die Optimierung in Meta
// als benutzerdefinierte Conversion anlegen, oder z. B. „Purchase“ setzen).
//
// Einwilligung: Pixel und Conversions API nur mit Einwilligung in die Meta-Cookies (Hinweis auf der Funnel-Seite),
// wie die App es für Sitzungsaufnahmen hält (§ 25 TDDDG). OFFEN für den Rechts-Agenten: ob die Conversions API ohne
// Pixel-Einwilligung (berechtigtes Interesse) zulässig wäre; bis dahin nur mit Einwilligung.

import { createHash } from "node:crypto";

export const FUNNEL_PIXEL_ID_DEFAULT = "1314902680747476";

type Env = Record<string, string | undefined>;
const an = (v: string | undefined) => /^(1|an|on|true|ja)$/i.test((v ?? "").trim());

export function funnelPixelId(env: Env = process.env): string {
  const v = (env.FUNNEL_META_PIXEL_ID ?? "").trim();
  return /^\d{5,20}$/.test(v) ? v : FUNNEL_PIXEL_ID_DEFAULT;
}
/** Qualitäts-Ereignis senden? Standard aus (erst nach Oles Freigabe). */
export const qualitaetAn = (env: Env = process.env) => an(env.FUNNEL_META_QUALITAET);
export const qualitaetEventName = (env: Env = process.env) => (env.FUNNEL_META_QUALITAET_EVENT ?? "").trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "LeadErreicht";
/** Pixel nur nach Einwilligung (Standard). „aus“ nur nach Rechtsprüfung. */
export const pixelBrauchtEinwilligung = (env: Env = process.env) => !/^(0|aus|off|false|nein)$/i.test((env.FUNNEL_PIXEL_EINWILLIGUNG ?? "").trim());

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export type FunnelNutzer = {
  besuchId: string;
  email?: string | null;
  /** Ziffern mit Ländervorwahl (z. B. 4915112345678) oder mit + */
  telefon?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  /** TT.MM.JJJJ */
  geburtsdatum?: string | null;
  plz?: string | null;
  ort?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** user_data für die Conversions API: Personendaten nur als SHA-256 (Meta-Normalisierung), Kennungen ungehasht. */
export function userData(n: FunnelNutzer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: string) => {
    if (v) out[k] = [sha(v)];
  };
  put("em", norm(n.email));
  put("ph", (n.telefon ?? "").replace(/\D/g, ""));
  put("fn", norm(n.vorname).replace(/[\s.'-]/g, ""));
  put("ln", norm(n.nachname).replace(/[\s.'-]/g, ""));
  const db = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((n.geburtsdatum ?? "").trim());
  if (db) put("db", `${db[3]}${db[2]}${db[1]}`);
  put("zp", (n.plz ?? "").replace(/\D/g, "").slice(0, 5));
  put("ct", norm(n.ort).replace(/[^\p{L}]/gu, ""));
  put("country", "de");
  put("external_id", n.besuchId);
  if (n.fbc && /^fb\.\d\.\d+\.\S+$/.test(n.fbc)) out.fbc = n.fbc.slice(0, 500);
  if (n.fbp && /^fb\.\d\.\d+\.\d+$/.test(n.fbp)) out.fbp = n.fbp.slice(0, 200);
  if (n.ip && n.ip !== "unknown") out.client_ip_address = n.ip.slice(0, 64);
  if (n.userAgent) out.client_user_agent = n.userAgent.slice(0, 500);
  return out;
}

/** fbc aus fbclid (wenn der Pixel-Cookie _fbc fehlt): fb.1.<Zeit in ms>.<fbclid> */
export function fbcAusFbclid(fbclid: string | null | undefined, zeitMs: number): string | null {
  const f = (fbclid ?? "").trim();
  return /^[A-Za-z0-9_-]{10,500}$/.test(f) ? `fb.1.${zeitMs}.${f}` : null;
}

export type MetaEreignis = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

/** „Lead“ beim Absenden, gleiche event_id wie der Pixel im Browser. */
export function leadEreignis(p: { eventId: string; zeit: Date; url?: string | null; nutzer: FunnelNutzer; produkt: string }): MetaEreignis {
  return {
    event_name: "Lead",
    event_time: Math.floor(p.zeit.getTime() / 1000),
    event_id: p.eventId,
    action_source: "website",
    ...(p.url ? { event_source_url: p.url.slice(0, 500) } : {}),
    user_data: userData(p.nutzer),
    custom_data: { content_name: p.produkt },
  };
}

/** Qualitäts-Ereignis (Lead erreicht) mit dem Verkaufspreis; event_id je Besucher fest (nie doppelt). */
export function qualitaetsEreignis(p: { zeit: Date; wert: number; url?: string | null; nutzer: FunnelNutzer; produkt: string; name?: string }): MetaEreignis {
  return {
    event_name: p.name ?? "LeadErreicht",
    event_time: Math.floor(p.zeit.getTime() / 1000),
    event_id: `q-${p.nutzer.besuchId}`,
    action_source: "website",
    ...(p.url ? { event_source_url: p.url.slice(0, 500) } : {}),
    user_data: userData(p.nutzer),
    custom_data: { value: Math.round(p.wert * 100) / 100, currency: "EUR", content_name: p.produkt },
  };
}

/** Ereignisse an das Dataset (Pixel) senden. Ohne Token nichts (Ergebnis „ohne_token“). Wirft nie. */
export async function sendeMetaEreignisse(events: MetaEreignis[], env: Env = process.env): Promise<{ ok: boolean; grund?: string }> {
  if (!events.length) return { ok: true };
  try {
    const { cleanToken } = await import("@/lib/meta-leads");
    const token = cleanToken(env.FUNNEL_META_TOKEN) || cleanToken(env.META_ACCESS_TOKEN);
    if (!token) return { ok: false, grund: "ohne_token" };
    const { postEventsData } = await import("@/lib/capi/server");
    await postEventsData(funnelPixelId(env), JSON.stringify(events), token, events.length, (env.FUNNEL_META_TEST_CODE ?? "").trim() || null);
    return { ok: true };
  } catch (e) {
    const { reportError } = await import("@/lib/monitoring");
    reportError(e, "funnel-capi");
    return { ok: false, grund: e instanceof Error ? e.message.slice(0, 200) : "Fehler" };
  }
}
