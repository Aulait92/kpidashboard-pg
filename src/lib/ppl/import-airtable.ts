// Einmalige Übernahme der Pay-per-Lead-Bezüge aus Airtable („Kunden-Produkt-
// Bezug“ + Kunden/Produkte/Stornogründe). Wiederholbar (Abgleich über
// airtableId); mit dryRun nur Vorschau.

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
  action: "neu" | "aktualisieren" | "übersprungen";
  note?: string;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : Array.isArray(v) && typeof v[0] === "string" ? String(v[0]).trim() : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const pipe = (v: unknown) =>
  s(v)
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

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
    const bezugName = s(f["Bezug"]) || `${customerName} – ${productKey}`;
    if (!kunde || !produkt || !customerName || !productKey) {
      out.push({ airtableId: b.id, bezug: bezugName, customer: customerName, customerFound: false, productKey, active: false, period: "-", goal: null, price: 0, delivery: "-", filters: "", stornoDays: null, action: "übersprungen", note: "Kunde oder Produkt fehlt" });
      continue;
    }
    const customer = await prisma.customer.findUnique({ where: { name: customerName }, select: { id: true, users: { where: { role: "BUYER" }, select: { id: true }, take: 1 } } });
    const method = s(kunde["Liefermethode"]);
    const receiver = s(kunde["Empfaenger E-Mail"]);
    const webhookUrl = s(kunde["Webhook Url"]);
    const webhookSecret = s(kunde["Webhook Secret"]);
    const delivery = /^webhook/i.test(method) && webhookUrl ? "webhook" : /e-?mail/i.test(method) && receiver ? "email" : customer?.users.length ? "app" : receiver ? "email" : "app";
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
      deliveryEmail: delivery === "email" ? receiver : null,
      webhookUrl: delivery === "webhook" ? webhookUrl : null,
      webhookFormat: /convexa/i.test(method) || /api\.convexa\.app/.test(webhookUrl) ? "convexa" : "standard",
      airtableId: b.id,
    };
    const existing = await prisma.leadSubscription.findUnique({ where: { airtableId: b.id }, select: { id: true, period: true } });
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
      delivery: delivery === "email" ? `E-Mail (${receiver})` : delivery === "webhook" ? "Webhook" : "Kundenbereich",
      filters,
      stornoDays: row.stornoDays,
      action: !customer ? "übersprungen" : existing ? "aktualisieren" : "neu",
      note: !customer ? "Kunde fehlt in der App (erst anlegen)" : undefined,
    });
    if (opts.dryRun || !customer) continue;
    const data = { ...row, ...(webhookSecret && delivery === "webhook" ? { webhookSecretEnc: encryptSecret(webhookSecret) } : {}) };
    if (existing) {
      // Zeitraum (Wochenbestellung) und Lieferweg, die in der App gesetzt wurden, nicht überschreiben
      const { period: _p, ...rest } = data;
      void _p;
      await prisma.leadSubscription.update({ where: { id: existing.id }, data: rest });
    } else {
      await prisma.leadSubscription.create({ data });
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
