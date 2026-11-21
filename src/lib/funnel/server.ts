// Eigene Funnels auf dem Server (Ole, 20.11.2026): Messung je Schritt, Absenden in den Pay-per-Lead-Eingang, Ergebnis
// der Leads beim Abnehmer und Meta-Ereignisse. Definition und Prüfregeln: lib/funnel/definition.ts.
//
// Ziel-Kennzahlen (Einheit Besucher-ID, lib/experimente.ts), gesetzt vom WhatsApp-Cron (funnelReifePruefen):
//   ppl_erreicht   Haupt-Kennzahl (Ole, 20.11.2026: gute Leadqualität hält die Abnehmer länger im Bezug, das treibt
//                  den Kundenwert): Abnehmer hat den Lead erreicht (Status über „Neuer Lead“/„Nicht erreicht“ hinaus,
//                  Termin oder Abschluss), nicht storniert bzw. reklamiert wegen Nichterreichbarkeit oder falscher Daten.
//   ppl_termin, ppl_abschluss  zusätzlich gemessen.
//   ppl_umsatz     Neben-Kennzahl: verkauft und 14 Tage nach Eingang nicht storniert bzw. reklamiert.
//   ppl_unbekannt  Lead ging an einen Abnehmer ohne Rückmeldung in der App (Versand per E-Mail oder Webhook, z. B. HvK):
//                  Ergebnis unbekannt, zählt in den Tests gar nicht (ExperimentDef.ohneEreignis), nicht als Misserfolg.
// Bewertet wird 14 Tage nach Eingang; erreicht, Termin und Abschluss werden bis 60 Tage nachgeprüft.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { variante, zielErreicht } from "@/lib/experimente";
import { adFromTracking } from "@/lib/anzeige";
import { ingestPoolLead, type PoolResult } from "@/lib/ppl/engine";
import { pruefeTelefon } from "@/lib/ppl/telefon-pruefung";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { isReachedStatus, isValidLeadStatus } from "@/lib/products";
import { resolvePplProduct } from "@/lib/ppl/produkt-key";
import { funnelDef, pplFelder, pruefeAlles, saubereAntworten, type AbbruchGrund, type Fehler } from "@/lib/funnel/definition";
import { EINWILLIGUNG_KANAELE, EINWILLIGUNG_VERSION, einwilligungText, PKV_TEXTE } from "@/lib/funnel/pkv-beitrag-texte";
import { experteMailAn, funnelDatenschutzEmail } from "@/lib/funnel/einstellungen";
import type { PoolEinwilligung } from "@/lib/ppl/einwilligung-nachweis";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { fbcAusFbclid, leadEreignis, qualitaetAn, qualitaetEventName, qualitaetsEreignis, sendeMetaEreignisse, type FunnelNutzer } from "@/lib/funnel/meta";

const DAY = 86_400_000;
/** Reife: Tage nach Eingang, bis das Ergebnis beim Abnehmer bewertet wird */
export const REIF_TAGE = 14;

export const EREIGNIS_ARTEN = ["angesehen", "beantwortet", "abbruch", "abgeschickt"] as const;
export type EreignisArt = (typeof EREIGNIS_ARTEN)[number];
const GRUENDE: AbbruchGrund[] = ["gesetzlich", "unter_650"];

// ─── Herkunft (nur Tracking-Schlüssel, keine Personendaten) ───────────────

const QUELLE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "campaign_id", "adset_id", "ad_id", "placement", "site_source_name"] as const;

/** Herkunft aus den URL-Parametern: nur bekannte Schlüssel, gekürzt, ohne Platzhalter; fbclid nur als „vorhanden“. */
export function saubereQuelle(raw: unknown): Record<string, string | boolean> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};
  for (const k of QUELLE_KEYS) {
    const v = r[k];
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, 200);
    if (s && !/^\{\{.*\}\}$/.test(s)) out[k] = s;
  }
  if (typeof r.fbclid === "string" && r.fbclid.trim()) out.fbclid = true;
  return Object.keys(out).length ? out : null;
}

async function besuchSicherstellen(funnel: string, besuchId: string, quelle: unknown) {
  const q = saubereQuelle(quelle);
  await prisma.funnelBesuch.createMany({ data: [{ id: besuchId, funnel, ...(q ? { quelle: q as Prisma.InputJsonValue } : {}) }], skipDuplicates: true });
}

// ─── Messung je Schritt ───────────────────────────────────────────────────

/**
 * Ereignis eines Besuchers merken (einmal je Schritt und Art). Beim ersten Ansehen eines Schritts mit A/B-Test wird
 * die Fassung zugeteilt (Einheit = Besucher-ID). Gibt die Fassung zurück. Wirft nie (Messung darf nichts stören).
 */
export async function ereignisMerken(p: { funnel: string; besuchId: string; schritt: string; art: string; grund?: string | null; quelle?: unknown }): Promise<{ ok: boolean; variante?: "a" | "b" }> {
  try {
    const f = funnelDef(p.funnel);
    const s = f?.schritte.find((x) => x.id === p.schritt);
    if (!f || !s || !EREIGNIS_ARTEN.includes(p.art as EreignisArt)) return { ok: false };
    await besuchSicherstellen(f.key, p.besuchId, p.quelle);
    const v = s.test && p.art === "angesehen" ? await variante(s.test.experiment, p.besuchId) : undefined;
    const grund = p.art === "abbruch" && GRUENDE.includes(p.grund as AbbruchGrund) ? p.grund! : null;
    await prisma.funnelEreignis.createMany({ data: [{ besuchId: p.besuchId, funnel: f.key, schritt: s.id, art: p.art, variante: v ?? null, grund }], skipDuplicates: true });
    return { ok: true, variante: v };
  } catch (err) {
    reportError(err, "funnel-ereignis");
    return { ok: false };
  }
}

// ─── Absenden ─────────────────────────────────────────────────────────────

export type AbsendenInput = {
  funnel: string;
  besuchId: string;
  antworten: unknown;
  quelle?: unknown;
  eventId?: string | null;
  /** Einwilligung in Meta-Cookies (Pixel); nur dann Conversions API und Speicherung von fbc/fbp */
  metaEinwilligung?: boolean;
  fbc?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  url?: string | null;
};

/** Abnehmer, der den Lead bekommen hat (Danke-Seite „Dein Experte“, L9); nur wenn Name, Firma und Telefon bekannt sind. */
export type Experte = { name: string; firma: string; telefon: string };

export type AbsendenErgebnis =
  | {
      ok: true;
      lead: boolean;
      status: PoolResult["status"];
      meta: (() => Promise<unknown>) | null;
      experte: Experte | null;
      /** E-Mail „Dein Experte“ an den Lead (L9), zum Ausführen nach der Antwort */
      mail: (() => Promise<unknown>) | null;
    }
  | { ok: false; fehler: Fehler; abbruch: AbbruchGrund | null; schritt: string | null };

const EVENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Angaben prüfen (wie im Browser, dazu die genaue Telefonprüfung), Lead in den Pay-per-Lead-Eingang (gleiche
 * Feldnamen wie die Perspective-Leads, Produkt wie heute), Besucher mit dem Lead verknüpfen, Ziel „funnel_lead“.
 * lead = neuer Lead (nicht Dublette, nicht schon abgeschickt): nur dann „Lead“ an Meta. meta = Conversions-API-Aufruf
 * zum Ausführen nach der Antwort (after), nur mit Einwilligung.
 */
export async function absenden(p: AbsendenInput, now = new Date()): Promise<AbsendenErgebnis> {
  const f = funnelDef(p.funnel);
  if (!f) return { ok: false, fehler: {}, abbruch: null, schritt: null };
  const a = saubereAntworten(p.antworten);
  const check = pruefeAlles(f, a, now);
  if (!check.ok) return { ok: false, fehler: check.fehler, abbruch: check.abbruch, schritt: check.schritt };
  const tel = pruefeTelefon(a.telefon);
  if (!tel.ok) return { ok: false, fehler: { telefon: PKV_TEXTE.kontakt.fehlerTelefon }, abbruch: null, schritt: "kontakt" };

  await besuchSicherstellen(f.key, p.besuchId, p.quelle);
  // Testanfrage (Ole, 21.11.2026): Nachname „Test“ geht nicht an einen Partner, sondern als Mail an den Admin; das
  // Meta-Ereignis „Lead“ läuft trotzdem (Pixel-Prüfung). Zählt nicht in Messung und A/B-Tests.
  if (istTestAnfrage(a)) return testAnfrage(f, a, p, now);
  const vorher = await prisma.funnelBesuch.findUnique({ where: { id: p.besuchId }, select: { poolLeadId: true, quelle: true } });
  const { productKey } = await resolvePplProduct(process.env.PKV_FUNNEL_PRODUKT?.trim() || f.produkt);
  const quelle = (saubereQuelle(p.quelle) ?? (vorher?.quelle as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const datenschutzEmail = funnelDatenschutzEmail();
  const r = await ingestPoolLead(
    {
      // Je Besucher genau ein Lead (doppeltes Absenden, Zurück und erneut Absenden)
      externalId: `funnel:${f.key}:${p.besuchId}`,
      productKey,
      via: "funnel",
      fields: pplFelder(f, a, now),
      ad: adFromTracking(quelle),
      // L3: Nachweis der Einwilligung je Lead, so wie angezeigt (geht an den Abnehmer statt des Texts am Bezug)
      consent: einwilligungNachweis(f.key, datenschutzEmail, now),
    },
    now,
  );
  const neu = !vorher?.poolLeadId && (r.status === "delivered" || r.status === "parked");
  const einw = !!p.metaEinwilligung;
  const fbc = einw ? (p.fbc && p.fbc.startsWith("fb.") ? p.fbc : fbcAusFbclid(p.fbclid, now.getTime())) : null;
  const fbp = einw && p.fbp && p.fbp.startsWith("fb.") ? p.fbp : null;
  const eventId = p.eventId && EVENT_ID_RE.test(p.eventId) ? p.eventId : null;
  if (!vorher?.poolLeadId) {
    await prisma.funnelBesuch.update({
      where: { id: p.besuchId },
      data: { poolLeadId: r.poolLeadId, leadAt: now, metaEventId: eventId, metaEinwilligung: einw, metaFbc: fbc?.slice(0, 500) ?? null, metaFbp: fbp?.slice(0, 200) ?? null },
    }).catch((err: unknown) => reportError(err, "funnel-verknuepfen"));
  }
  await ereignisMerken({ funnel: f.key, besuchId: p.besuchId, schritt: "kontakt", art: "abgeschickt" });
  await zielErreicht([p.besuchId], "funnel_lead");

  const nutzer: FunnelNutzer = {
    besuchId: p.besuchId,
    email: a.email,
    telefon: normalizePhone(a.telefon ?? ""),
    vorname: a.vorname,
    nachname: a.nachname,
    geburtsdatum: pplFelder(f, a, now).Geburtsdatum,
    plz: a.plz,
    ort: a.ort,
    fbc,
    fbp,
    ip: p.ip,
    userAgent: p.userAgent,
  };
  const meta = neu && einw && eventId ? () => sendeMetaEreignisse([leadEreignis({ eventId, zeit: now, url: p.url, nutzer, produkt: productKey })]) : null;
  // Abnehmer steht fest (sofort geliefert): „Dein Experte“ auf der Danke-Seite und per E-Mail (L9)
  const experte = r.status === "delivered" && r.leadId ? await experteFuer(r.leadId).catch(() => null) : null;
  const mailAn = experte && neu && a.email && experteMailAn() ? experteMail({ email: a.email, vorname: a.vorname ?? "", experte, datenschutzEmail }) : null;
  const mail = mailAn
    ? async () => {
        const { sendPlainMail } = await import("@/lib/email");
        return sendPlainMail({ to: mailAn.to, subject: mailAn.subject, text: mailAn.text }).catch((err: unknown) => reportError(err, "funnel-experte-mail"));
      }
    : null;
  return { ok: true, lead: neu, status: r.status, meta, experte, mail };
}

/** Testanfrage: Nachname „Test“ (Groß-/Kleinschreibung egal). (rein) */
export function istTestAnfrage(a: Record<string, string | undefined>): boolean {
  return (a.nachname ?? "").trim().toLowerCase() === "test";
}

/** Testanfrage nicht ausliefern: Mail mit den Angaben an den Admin, Meta-Ereignis wie bei einem echten Lead. */
async function testAnfrage(f: NonNullable<ReturnType<typeof funnelDef>>, a: Record<string, string | undefined>, p: AbsendenInput, now: Date): Promise<AbsendenErgebnis> {
  const felder = pplFelder(f, a, now);
  const text = ["Testanfrage aus dem Funnel (Nachname „Test“), nicht an einen Partner gegeben.", "", ...Object.entries(felder).map(([k, v]) => `${k}: ${v}`)].join("\n");
  const { sendPlainMail } = await import("@/lib/email");
  const { PROVIDER } = await import("@/lib/legal-texts");
  await sendPlainMail({ to: process.env.ADMIN_EMAIL?.trim() || PROVIDER.email, subject: `Testanfrage ${f.key}`, text }).catch((err: unknown) => reportError(err, "funnel-testanfrage"));
  const einw = !!p.metaEinwilligung;
  const eventId = p.eventId && EVENT_ID_RE.test(p.eventId) ? p.eventId : null;
  const fbc = einw ? (p.fbc && p.fbc.startsWith("fb.") ? p.fbc : fbcAusFbclid(p.fbclid, now.getTime())) : null;
  const fbp = einw && p.fbp && p.fbp.startsWith("fb.") ? p.fbp : null;
  const nutzer: FunnelNutzer = {
    besuchId: p.besuchId,
    email: a.email,
    telefon: normalizePhone(a.telefon ?? ""),
    vorname: a.vorname,
    nachname: a.nachname,
    geburtsdatum: felder.Geburtsdatum,
    plz: a.plz,
    ort: a.ort,
    fbc,
    fbp,
    ip: p.ip,
    userAgent: p.userAgent,
  };
  const { productKey } = await resolvePplProduct(process.env.PKV_FUNNEL_PRODUKT?.trim() || f.produkt);
  const meta = einw && eventId ? () => sendeMetaEreignisse([leadEreignis({ eventId, zeit: now, url: p.url, nutzer, produkt: productKey })]) : null;
  return { ok: true, lead: true, status: "delivered", meta, experte: null, mail: null };
}

/** Einwilligungsnachweis beim Absenden (L3): Wortlaut mit eingesetzter Adresse, Fassung, Zeitpunkt, Kanäle, Knopf, Funnel. */
export function einwilligungNachweis(funnel: string, datenschutzEmail: string, now: Date): PoolEinwilligung {
  return { at: now.toISOString(), funnel, version: EINWILLIGUNG_VERSION, text: einwilligungText(datenschutzEmail), kanaele: [...EINWILLIGUNG_KANAELE], knopf: PKV_TEXTE.kontakt.knopf };
}

/** Name, Firma und Telefon des Abnehmers aus seiner Erstinformation; fehlt etwas, null (dann kein Kasten, keine Mail). */
export async function experteFuer(leadId: string): Promise<Experte | null> {
  const l = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { customer: { select: { vermittlerRegisterStatus: true, erstinformation: { select: { name: true, firma: true, telefon: true } } } } },
  });
  // Nur bei Vermittlern, die selbst beraten (z. B. Novus). Leadbroker wie HvK geben den Lead weiter, der Experte steht
  // noch nicht fest (Ole, 21.11.2026)
  if (l?.customer.vermittlerRegisterStatus === "keiner") return null;
  const e = l?.customer.erstinformation;
  const t = (v: string | null | undefined) => (v ?? "").trim();
  if (!e || !t(e.name) || !t(e.firma) || !t(e.telefon)) return null;
  return { name: t(e.name), firma: t(e.firma), telefon: t(e.telefon) };
}

/** E-Mail „Dein Experte“ (Texte: docs/funnel/pkv-beitrag-texte-conversion.md, L9). Rein. */
export function experteMail(p: { email: string; vorname: string; experte: Experte; datenschutzEmail: string }): { to: string; subject: string; text: string } {
  const { name, firma, telefon } = p.experte;
  const hallo = p.vorname.trim() ? `Hallo ${p.vorname.trim()},` : "Hallo,";
  const text = [
    hallo,
    "",
    `${name} von ${firma} ruft dich in den nächsten Tagen wegen deiner PKV-Prüfung an, und zwar von dieser Nummer: ${telefon}. Speichere sie dir am besten gleich.`,
    "",
    `Widerruf jederzeit per E-Mail an ${p.datenschutzEmail}.`,
    "",
    "Viele Grüße",
    "pkv-tarife.com",
    "",
    "pkv-tarife.com ist ein Angebot der Ole Kannapinn UG (haftungsbeschränkt).",
  ].join("\n");
  return { to: p.email, subject: ohneGedankenstriche(`Dein Experte für die PKV-Prüfung: ${name}`), text: ohneGedankenstriche(text) };
}

// ─── Ergebnis beim Abnehmer (Cron) ────────────────────────────────────────

/** Bis zu so vielen Tagen nach Eingang werden erreicht, Termin und Abschluss nachgeprüft (Ereignisse kommen dazu). */
export const NACHPRUEFEN_TAGE = 60;

/** Status, die ein Beratungsgespräch bzw. einen Termin bedeuten (lib/products.ts, auch Alt-Status). */
const TERMIN_STATUS = new Set(["In Beratung", "Termin vereinbart", "Angebot gesendet", "Angebot/Beratung läuft", "Abschluss"]);
/** Storno bzw. Reklamation wegen Nichterreichbarkeit oder falscher Daten: zählt nie als erreicht */
const KONTAKT_STORNO = /erreich|kontakt|falsch|nummer|telefon|daten|ungültig|ungueltig|existiert|fake|spa(ss|ß)/i;

export type LeadFakten = {
  poolStatus: string | null;
  /** Auslieferung des Bezugs: app = Kundenbereich (Abnehmer kann zurückmelden) | email | webhook */
  lieferweg: string | null;
  lead: {
    isTest: boolean;
    kundeTest: boolean;
    status: string | null;
    reached: boolean;
    closedAt: Date | null;
    stornoState: string | null;
    stornoReason: string | null;
    termine: number;
  } | null;
  umsatz: number;
  reklamiert: boolean;
};

export type LeadBewertung = {
  geliefert: boolean;
  /** Geliefert an einen Abnehmer, der in der App zurückmelden kann; sonst Ergebnis „unbekannt“ */
  rueckmeldungMoeglich: boolean;
  /** Abnehmer hat etwas gemeldet (Status, Termin, Abschluss oder Storno) */
  rueckmeldung: boolean;
  erreicht: boolean;
  termin: boolean;
  abschluss: boolean;
  /** Neben-Kennzahl ppl_umsatz: verkauft, Umsatz > 0, nicht storniert bzw. reklamiert */
  umsatz: boolean;
};

/** Ergebnis eines Funnel-Leads beim Abnehmer (rein, getestet in tests/unit/funnel.test.ts). */
export function bewerteLead(x: LeadFakten): LeadBewertung {
  const nichts: LeadBewertung = { geliefert: false, rueckmeldungMoeglich: false, rueckmeldung: false, erreicht: false, termin: false, abschluss: false, umsatz: false };
  const l = x.lead;
  if (x.poolStatus !== "delivered" || !l || l.isTest || l.kundeTest) return nichts;
  const storniert = !!l.stornoState && l.stornoState !== "rejected";
  const kontaktStorno = (storniert && KONTAKT_STORNO.test(l.stornoReason ?? "")) || x.reklamiert;
  const status = l.status ?? "Neuer Lead";
  const abschluss = !kontaktStorno && (status === "Abschluss" || !!l.closedAt);
  const termin = !kontaktStorno && (l.termine > 0 || TERMIN_STATUS.has(status) || abschluss);
  const erreicht = !kontaktStorno && (l.reached || (isValidLeadStatus(status) && isReachedStatus(status)) || termin);
  return {
    geliefert: true,
    rueckmeldungMoeglich: x.lieferweg === "app",
    rueckmeldung: status !== "Neuer Lead" || l.termine > 0 || !!l.closedAt || !!l.stornoState,
    erreicht,
    termin,
    abschluss,
    umsatz: !storniert && !x.reklamiert && x.umsatz > 0,
  };
}

const POOL_SELECT = { id: true, status: true, leadId: true, productKey: true, name: true, phone: true, email: true, plz: true, answers: true } as const;
type PoolDaten = Prisma.PoolLeadGetPayload<{ select: typeof POOL_SELECT }>;
export type LeadErgebnis = { pool: PoolDaten | null; fakten: LeadFakten; umsatz: number };

/** Fakten zu mehreren Funnel-Leads auf einmal (Cron und Admin-Auswertung). Schlüssel = PoolLead-ID. */
export async function ladeLeadFakten(poolLeadIds: string[]): Promise<Map<string, LeadErgebnis>> {
  const out = new Map<string, LeadErgebnis>();
  if (!poolLeadIds.length) return out;
  const pools = await prisma.poolLead.findMany({ where: { id: { in: poolLeadIds } }, select: POOL_SELECT });
  const leadIds = pools.map((p) => p.leadId).filter((x): x is string => !!x);
  const leads = leadIds.length
    ? await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: {
          id: true,
          isTest: true,
          status: true,
          reached: true,
          closedAt: true,
          stornoState: true,
          stornoReason: true,
          customer: { select: { isTest: true } },
          subscription: { select: { delivery: true } },
          revenues: { where: { cancelled: false }, select: { amount: true } },
          _count: { select: { appointments: { where: { status: { not: "cancelled" } } } } },
        },
      })
    : [];
  const rekl = leadIds.length ? await prisma.hvkReklamation.findMany({ where: { leadId: { in: leadIds }, status: { not: "verworfen" } }, select: { leadId: true } }) : [];
  const reklamiert = new Set(rekl.map((r) => r.leadId));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  for (const id of poolLeadIds) {
    const pool = pools.find((p) => p.id === id) ?? null;
    const lead = pool?.leadId ? (leadById.get(pool.leadId) ?? null) : null;
    const umsatz = lead ? lead.revenues.reduce((n, r) => n + Number(r.amount), 0) : 0;
    out.set(id, {
      pool,
      umsatz,
      fakten: {
        poolStatus: pool?.status ?? null,
        lieferweg: lead?.subscription?.delivery ?? null,
        lead: lead
          ? { isTest: lead.isTest, kundeTest: lead.customer.isTest, status: lead.status, reached: lead.reached, closedAt: lead.closedAt, stornoState: lead.stornoState, stornoReason: lead.stornoReason, termine: lead._count.appointments }
          : null,
        umsatz,
        reklamiert: !!pool?.leadId && reklamiert.has(pool.leadId),
      },
    });
  }
  return out;
}

type Besuch = Prisma.FunnelBesuchGetPayload<object>;

/** Qualitäts-Ereignis an Meta (nur freigegeben, mit Einwilligung, einmal je Besucher). */
async function qualitaetSenden(b: Besuch, pool: PoolDaten, umsatz: number, now: Date): Promise<boolean> {
  if (!qualitaetAn() || !b.metaEinwilligung || b.qualitaetGesendetAt) return false;
  const antworten = Object.fromEntries(((pool.answers ?? []) as { label: string; value: string }[]).map((x) => [x.label, x.value]));
  const [vorname, ...rest] = (pool.name ?? "").split(" ");
  const r = await sendeMetaEreignisse([
    qualitaetsEreignis({
      zeit: now,
      wert: umsatz,
      name: qualitaetEventName(),
      produkt: pool.productKey,
      nutzer: { besuchId: b.id, email: pool.email, telefon: pool.phone, vorname, nachname: rest.join(" "), geburtsdatum: antworten["Geburtsdatum"], plz: pool.plz, ort: antworten["Ort"], fbc: b.metaFbc, fbp: b.metaFbp },
    }),
  ]);
  return r.ok;
}

/** Ziel-Ereignisse eines Besuchers aus der Bewertung (kommen nur dazu, nie weg). */
async function zieleSetzen(besuchId: string, w: LeadBewertung, erst: boolean) {
  if (erst && w.geliefert && !w.rueckmeldungMoeglich) await zielErreicht([besuchId], "ppl_unbekannt");
  if (w.erreicht) await zielErreicht([besuchId], "ppl_erreicht");
  if (w.termin) await zielErreicht([besuchId], "ppl_termin");
  if (w.abschluss) await zielErreicht([besuchId], "ppl_abschluss");
  if (erst && w.umsatz) await zielErreicht([besuchId], "ppl_umsatz");
}

export type ReifeErgebnis = { geprueft: number; erreicht: number; unbekannt: number; nachgeprueft: number; qualitaet: number };

/**
 * Stündlich im WhatsApp-Cron. 1. Funnel-Leads, deren Eingang mindestens 14 Tage zurückliegt, einmal bewerten und die
 * Ziele setzen (ppl_erreicht, ppl_termin, ppl_abschluss, ppl_umsatz; ohne Rückmeldung in der App ppl_unbekannt).
 * 2. Bis 60 Tage nach Eingang nachprüfen, ob erreicht, Termin oder Abschluss dazugekommen sind. Qualitäts-Ereignis an
 * Meta, sobald erreicht (nur mit FUNNEL_META_QUALITAET und Einwilligung). Meta-Kennungen danach bzw. nach 60 Tagen löschen.
 */
export async function funnelReifePruefen(now = new Date(), o: { limit?: number } = {}): Promise<ReifeErgebnis> {
  const out: ReifeErgebnis = { geprueft: 0, erreicht: 0, unbekannt: 0, nachgeprueft: 0, qualitaet: 0 };
  const limit = o.limit ?? 500;
  const reifAb = new Date(now.getTime() - REIF_TAGE * DAY);
  const bis = new Date(now.getTime() - NACHPRUEFEN_TAGE * DAY);
  const faellig = await prisma.funnelBesuch.findMany({ where: { poolLeadId: { not: null }, reifGeprueftAt: null, leadAt: { lte: reifAb } }, orderBy: { leadAt: "asc" }, take: limit });
  const nach = await prisma.funnelBesuch.findMany({
    where: { reifGeprueftAt: { not: null, lt: now }, rueckmeldungMoeglich: true, leadAt: { gt: bis }, OR: [{ erreicht: false }, { termin: false }, { abschluss: false }] },
    orderBy: { reifGeprueftAt: "asc" },
    take: limit,
  });
  // Früh (Ole, 21.11.2026): Qualitäts-Ereignis sofort, sobald erreicht, nicht erst nach 14 Tagen (Meta braucht das
  // Signal zeitnah). Nur Ereignis und Löschen der Meta-Kennungen, die Reife-Bewertung bleibt beim 14-Tage-Lauf.
  if (qualitaetAn()) {
    const frueh = await prisma.funnelBesuch.findMany({
      where: { poolLeadId: { not: null }, reifGeprueftAt: null, leadAt: { gt: reifAb }, metaEinwilligung: true, qualitaetGesendetAt: null },
      orderBy: { leadAt: "asc" },
      take: limit,
    });
    const fakten = await ladeLeadFakten([...new Set(frueh.map((b) => b.poolLeadId!))]);
    for (const b of frueh) {
      try {
        const e = fakten.get(b.poolLeadId!);
        if (!e?.pool) continue;
        const w = bewerteLead(e.fakten);
        if (!w.erreicht || !w.rueckmeldungMoeglich) continue;
        if (await qualitaetSenden(b, e.pool, e.umsatz, now)) {
          await prisma.funnelBesuch.update({ where: { id: b.id }, data: { qualitaetGesendetAt: now, metaFbc: null, metaFbp: null } });
          out.qualitaet++;
        }
      } catch (err) {
        reportError(err, "funnel-qualitaet-frueh");
      }
    }
  }
  const liste: [Besuch, boolean][] = [...faellig.map((x): [Besuch, boolean] => [x, true]), ...nach.map((x): [Besuch, boolean] => [x, false])];
  const alle = await ladeLeadFakten([...new Set(liste.map(([b]) => b.poolLeadId!))]);
  for (const [b, erst] of liste) {
    try {
      const e = alle.get(b.poolLeadId!);
      if (!e) continue;
      const { pool, fakten, umsatz } = e;
      const w = bewerteLead(fakten);
      const gesendet = w.erreicht && w.rueckmeldungMoeglich && pool ? await qualitaetSenden(b, pool, umsatz, now) : false;
      await prisma.funnelBesuch.update({
        where: { id: b.id },
        data: {
          ...(erst ? { reifGeprueftAt: now, reif: w.umsatz, reifUmsatzCent: w.umsatz ? Math.round(umsatz * 100) : 0, rueckmeldungMoeglich: w.rueckmeldungMoeglich } : {}),
          rueckmeldung: w.rueckmeldung || !!b.rueckmeldung,
          // Einmal erreicht bleibt erreicht (Ziel-Ereignisse werden nie zurückgenommen)
          erreicht: w.erreicht || !!b.erreicht,
          termin: w.termin || !!b.termin,
          abschluss: w.abschluss || !!b.abschluss,
          ...(gesendet ? { qualitaetGesendetAt: now } : {}),
          // Meta-Kennungen nur so lange wie für das Qualitäts-Ereignis nötig
          ...(gesendet || !w.rueckmeldungMoeglich || !qualitaetAn() ? { metaFbc: null, metaFbp: null } : {}),
        },
      });
      await zieleSetzen(b.id, w, erst);
      if (erst) out.geprueft++;
      else out.nachgeprueft++;
      if (erst && w.erreicht) out.erreicht++;
      if (erst && w.geliefert && !w.rueckmeldungMoeglich) out.unbekannt++;
      if (gesendet) out.qualitaet++;
    } catch (err) {
      reportError(err, "funnel-reife", { besuch: b.id });
    }
  }
  await prisma.funnelBesuch.updateMany({ where: { leadAt: { lte: bis }, OR: [{ metaFbc: { not: null } }, { metaFbp: { not: null } }] }, data: { metaFbc: null, metaFbp: null } });
  return out;
}
