// Einmalige Übernahme der Pay-per-Lead-Bezüge aus Airtable („Kunden-Produkt-
// Bezug“ + Kunden/Produkte/Stornogründe). Wiederholbar (Abgleich über
// airtableId, sonst ein noch nicht verknüpfter Bezug desselben Kunden und
// Produkts); mit dryRun nur Vorschau inkl. der Feldänderungen.
//
// Erneutes Übernehmen aktualisiert Ziel, Preis, Filter, Storno-Fenster/-Gründe,
// Test und aktiv aus Airtable. Was in der App eingestellt wird, bleibt
// (KEEP_ON_REIMPORT): Zeitraum (Wochenbestellung), Bezeichnung, Lieferweg mit
// Adresse/Vorlage/Webhook, „Storno immer anerkennen“. Gebiete
// (SubscriptionArea) fasst der Import nie an.

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { fetchAllRecords, type AirtableRecord } from "@/lib/airtable";

export type ImportRow = {
  airtableId: string;
  bezug: string;
  customer: string;
  customerFound: boolean;
  productKey: string;
  active: boolean;
  period: string;
  goal: number | null;
  price: number;
  delivery: string;
  filters: string;
  stornoDays: number | null;
  action: "neu" | "aktualisieren" | "verknüpfen" | "unverändert" | "übersprungen";
  note?: string;
  /** Felder, die das Übernehmen ändern würde („Preis: 40 € → 45 €“) */
  changes: string[];
  /** Felder, bei denen Airtable abweicht, die App-Einstellung aber bleibt */
  kept: string[];
};

/** In der App gepflegt, beim erneuten Übernehmen nicht überschreiben. */
export const KEEP_ON_REIMPORT = [
  "period",
  "label",
  "delivery",
  "deliveryEmail",
  "emailSubject",
  "emailTemplate",
  "webhookUrl",
  "webhookFormat",
  "webhookSecretEnc",
  "stornoAutoApprove",
] as const;

const FIELD_LABEL: Record<string, string> = {
  customerId: "Kunde",
  productKey: "Produkt",
  active: "aktiv",
  status: "Status",
  testQuantity: "Testmenge",
  testDays: "Testdauer",
  period: "Zeitraum",
  goal: "Ziel",
  startDate: "Start",
  price: "Preis",
  plzRanges: "PLZ",
  acceptWeak: "schwache",
  weakThreshold: "Grenze schwach",
  acceptCivilServants: "Beamte",
  onlyWeak: "nur schwache",
  scoreFloor: "Score",
  insurerInclude: "nur Gesellschaften",
  insurerExclude: "ohne Gesellschaften",
  excludeRules: "Regeln",
  stornoDays: "Storno-Fenster",
  stornoReasons: "Stornogründe",
  delivery: "Lieferung",
  deliveryEmail: "Liefer-Adresse",
  webhookUrl: "Webhook",
  webhookFormat: "Webhook-Format",
};

const show = (v: unknown): string => {
  if (v == null || v === "") return "leer";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "leer";
  if (typeof v === "object" && "toNumber" in (v as object)) return String((v as { toNumber(): number }).toNumber());
  return String(v);
};
const same = (a: unknown, b: unknown) => show(a) === show(b);

/**
 * Was ein erneutes Übernehmen an einem bestehenden Bezug ändert: data enthält
 * nur die Felder aus Airtable ohne KEEP_ON_REIMPORT; changes/kept für die Vorschau.
 */
export function planReimport(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const keep = new Set<string>(KEEP_ON_REIMPORT);
  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  const kept: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (k === "airtableId") continue;
    if (keep.has(k)) {
      if (k in existing && !same(existing[k], v) && FIELD_LABEL[k]) kept.push(`${FIELD_LABEL[k]}: bleibt ${show(existing[k])} (Airtable: ${show(v)})`);
      continue;
    }
    data[k] = v;
    if (!same(existing[k], v)) changes.push(`${FIELD_LABEL[k] ?? k}: ${show(existing[k])} → ${show(v)}`);
  }
  return { data, changes, kept };
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : Array.isArray(v) && typeof v[0] === "string" ? String(v[0]).trim() : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const pipe = (v: unknown) =>
  s(v)
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

const deliveryLabel = (d: string, email: string | null) =>
  d === "email" ? `E-Mail (${email ?? "?"})` : d === "app_pdf" ? `Kundenbereich + PDF per Mail (${email ?? "?"})` : d === "webhook" ? "Webhook" : "Kundenbereich";

/**
 * Lieferweg aus „Liefermethode“ des Airtable-Kunden (rein, getestet):
 * Webhook (mit Adresse) → webhook; E-Mail (mit Empfänger) → email; PDF mit Login und Empfänger →
 * app_pdf (Kundenbereich + PDF per Mail an „Empfaenger E-Mail“); sonst mit Login → app,
 * ohne Login mit Empfänger → email.
 */
export function importDelivery(i: { method: string; receiver: string; webhookUrl: string; hasLogin: boolean }): "app" | "app_pdf" | "email" | "webhook" {
  if (/^webhook/i.test(i.method) && i.webhookUrl) return "webhook";
  if (/e-?mail/i.test(i.method) && i.receiver) return "email";
  if (/pdf/i.test(i.method) && i.hasLogin && i.receiver) return "app_pdf";
  if (i.hasLogin) return "app";
  return i.receiver ? "email" : "app";
}

export async function importSubscriptions(opts: { dryRun: boolean }): Promise<ImportRow[]> {
  const [bezuege, kunden, produkte, gruende] = await Promise.all([
    fetchAllRecords("Kunden-Produkt-Bezug"),
    fetchAllRecords("Kunden"),
    fetchAllRecords("Produkte"),
    fetchAllRecords("Stornogründe"),
  ]);
  const byId = (rows: AirtableRecord[]) => new Map(rows.map((r) => [r.id, r.fields]));
  const K = byId(kunden);
  const P = byId(produkte);
  const G = byId(gruende);

  const out: ImportRow[] = [];
  for (const b of bezuege) {
    const f = b.fields;
    const kunde = K.get(ids(f["Kunde"])[0] ?? "");
    const produkt = P.get(ids(f["Produkt"])[0] ?? "");
    const customerName = s(kunde?.["Name"]);
    const productKey = s(produkt?.["Name"]);
    const bezugName = s(f["Bezug"]) || `${customerName}, ${productKey}`;
    if (!kunde || !produkt || !customerName || !productKey) {
      out.push({ airtableId: b.id, bezug: bezugName, customer: customerName, customerFound: false, productKey, active: false, period: "-", goal: null, price: 0, delivery: "-", filters: "", stornoDays: null, action: "übersprungen", note: "Kunde oder Produkt fehlt", changes: [], kept: [] });
      continue;
    }
    const customer = await prisma.customer.findUnique({ where: { name: customerName }, select: { id: true, users: { where: { role: "BUYER" }, select: { id: true }, take: 1 } } });
    const method = s(kunde["Liefermethode"]);
    const receiver = s(kunde["Empfaenger E-Mail"]);
    const webhookUrl = s(kunde["Webhook Url"]);
    const webhookSecret = s(kunde["Webhook Secret"]);
    const delivery = importDelivery({ method, receiver, webhookUrl, hasLogin: !!customer?.users.length });
    const price = n(f["Preis netto"]) ?? n(produkt["Standardpreis netto"]) ?? 0;
    const row = {
      customerId: customer?.id ?? "",
      productKey,
      label: null,
      active: f["aktiv"] === true,
      status: s(f["status"]) === "test" ? "test" : "live",
      testQuantity: n(f["test_menge"]),
      testDays: n(f["test_dauer_tage"]) || null,
      period: s(f["Abrechnungsmodus"]) === "einmalig" ? "once" : "month",
      goal: n(f["Leadziel"]),
      startDate: s(f["Startdatum"]) ? new Date(`${s(f["Startdatum"])}T00:00:00`) : null,
      price,
      plzRanges: s(f["plz_bereiche"]) || null,
      acceptWeak: s(f["akzeptiert_schwach"]).toLowerCase() !== "nein",
      weakThreshold: n(f["schwach_grenze"]),
      acceptCivilServants: s(f["akzeptiert_beamte"]).toLowerCase() !== "nein",
      onlyWeak: s(f["nur_schwach"]).toLowerCase() === "ja",
      scoreFloor: n(f["score_floor"]) || null,
      insurerInclude: pipe(f["einschluss"]),
      insurerExclude: pipe(f["ausschluss"]),
      excludeRules: s(f["ausschluss_regeln"]) || null,
      stornoDays: n(f["Storno-Fenster (Tage)"]),
      stornoReasons: ids(f["Erlaubte Stornogründe"])
        .map((id) => s(G.get(id)?.["Grund"]))
        .filter((g) => g && g !== "0"),
      delivery,
      deliveryEmail: delivery === "email" || delivery === "app_pdf" ? receiver : null,
      webhookUrl: delivery === "webhook" ? webhookUrl : null,
      webhookFormat: /convexa/i.test(method) || /api\.convexa\.app/.test(webhookUrl) ? "convexa" : "standard",
      airtableId: b.id,
    };
    // Schon übernommen (airtableId) oder in der App angelegt (gleicher Kunde + Produkt, noch ohne Airtable-Verknüpfung, genau einer)
    const linked = await prisma.leadSubscription.findUnique({ where: { airtableId: b.id } });
    const unlinked = linked || !customer ? [] : await prisma.leadSubscription.findMany({ where: { customerId: customer.id, productKey, airtableId: null }, take: 2 });
    const existing = linked ?? (unlinked.length === 1 ? unlinked[0] : null);
    const ambiguous = !existing && unlinked.length > 1;
    const plan = existing ? planReimport(existing as unknown as Record<string, unknown>, row) : null;
    const filters = [
      row.plzRanges ? "PLZ" : null,
      !row.acceptWeak ? `keine schwachen${row.weakThreshold ? ` (<${row.weakThreshold})` : ""}` : null,
      !row.acceptCivilServants ? "keine Beamten" : null,
      row.onlyWeak ? "nur schwache" : null,
      row.insurerInclude.length ? `nur ${row.insurerInclude.length} Ges.` : null,
      row.insurerExclude.length ? `ohne ${row.insurerExclude.length} Ges.` : null,
      row.scoreFloor ? `Score ≥ ${row.scoreFloor}` : null,
      row.excludeRules ? "Regeln" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    out.push({
      airtableId: b.id,
      bezug: bezugName,
      customer: customerName,
      customerFound: !!customer,
      productKey,
      active: row.active,
      period: existing?.period ?? row.period,
      goal: row.goal,
      price,
      // bei bestehendem Bezug gilt der Lieferweg aus der App (bleibt)
      delivery: deliveryLabel(existing?.delivery ?? delivery, existing ? existing.deliveryEmail : receiver),
      filters,
      stornoDays: row.stornoDays,
      action: !customer || ambiguous ? "übersprungen" : !existing ? "neu" : !linked ? "verknüpfen" : plan?.changes.length ? "aktualisieren" : "unverändert",
      note: !customer
        ? "Kunde fehlt in der App (erst anlegen)"
        : ambiguous
          ? "mehrere Bezüge für Kunde und Produkt in der App: erst einen löschen oder von Hand zuordnen"
          : existing && !linked
            ? "vorhandenen Bezug aus der App verknüpfen"
            : (existing?.period ?? row.period) !== "week" && customer.users.length
              ? "Kunde mit Login: für die Abrechnung auf Wochenbestellung stellen"
              : undefined,
      changes: plan?.changes ?? [],
      kept: plan?.kept ?? [],
    });
    if (opts.dryRun || !customer || ambiguous) continue;
    if (existing && plan) {
      // Nur Airtable-Felder; Zeitraum, Lieferweg, Vorlage usw. aus der App bleiben (KEEP_ON_REIMPORT)
      await prisma.leadSubscription.update({ where: { id: existing.id }, data: { ...plan.data, airtableId: b.id } as Parameters<typeof prisma.leadSubscription.update>[0]["data"] });
    } else {
      await prisma.leadSubscription.create({ data: { ...row, ...(webhookSecret && delivery === "webhook" ? { webhookSecretEnc: encryptSecret(webhookSecret) } : {}) } });
    }
  }
  return out;
}

/**
 * Dubletten-Historie der letzten 30 Tage aus Airtable übernehmen (nur
 * Telefon/E-Mail/Produkt/Datum), damit der Abgleich ab Tag 1 greift.
 */
export async function importDuplicateHistory(days = 30): Promise<number> {
  const [leads, produkte] = await Promise.all([fetchAllRecords("Leads"), fetchAllRecords("Produkte")]);
  const P = new Map(produkte.map((p) => [p.id, s(p.fields["Name"])]));
  const since = Date.now() - days * 86_400_000;
  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  let n2 = 0;
  for (const l of leads) {
    const created = new Date(l.createdTime).getTime();
    if (created < since || l.fields["Dublette"] === true) continue;
    const productKey = P.get(ids(l.fields["Produkt (Eingang)"])[0] ?? "");
    if (!productKey) continue;
    const phone = normalizePhone(s(l.fields["Telefonnummer"])) || null;
    const email = s(l.fields["E-Mail"]).toLowerCase() || null;
    if (!phone && !email) continue;
    await prisma.poolLead.upsert({
      where: { externalId: `airtable:${l.id}` },
      create: { externalId: `airtable:${l.id}`, productKey, via: "airtable", phone, email, status: "delivered", reason: "aus Airtable (Dubletten-Abgleich)", createdAt: new Date(created) },
      update: {},
    });
    n2++;
  }
  return n2;
}
