// Pay-per-Lead: einzelnen Lead aus Airtable in den App-Eingang holen (Ole, 16.11.2026), z. B. wenn
// er in der Umstellungsphase über Zapier kam und dort keinem Bezug zugeordnet wurde. Der Lead läuft
// danach durch den normalen Eingang (Telefon-Prüfung, Dubletten, Filter, Verteilung, Auslieferung).
// Doppelt holen ist ausgeschlossen: externalId = Perspective-ID bzw. Airtable-Record.

import { prisma } from "@/lib/prisma";
import { ingestPoolLead, type PoolResult } from "@/lib/ppl/engine";
import { formatBirthday, parseEuro } from "@/lib/ppl/perspective";

type Fields = Record<string, unknown>;
const text = (v: unknown): string => (v == null ? "" : Array.isArray(v) ? v.map(text).filter(Boolean).join(", ") : typeof v === "object" ? text((v as { name?: unknown }).name) : String(v).trim());

/** Airtable-Felder (Tabelle „Leads“) → Formularfelder wie aus dem Perspective-Übersetzer (rein, getestet). */
export function airtableLeadToPool(recordId: string, f: Fields): { externalId: string; slug: string | null; smsVerified: boolean; fields: Record<string, string> } {
  const fields: Record<string, string> = {
    Vorname: text(f["Vorname"]),
    Nachname: text(f["Nachname"]),
    "E-Mail": text(f["E-Mail"]),
    Telefonnummer: text(f["Telefonnummer"]),
    Geburtsdatum: text(f["Geburtsdatum"]) ? formatBirthday(text(f["Geburtsdatum"])) : "",
    Postleitzahl: text(f["Postleitzahl"]).replace(/\D/g, "").slice(0, 5),
    Ort: text(f["Ort"]),
    Situation: text(f["Situation"]),
    "Gesetzlich oder privat?": text(f["Gesetzlich oder privat?"]),
    "Aktuelle Versicherung": text(f["Aktuelle Versicherung"]),
    "Wie lange in PKV?": text(f["Wie lange in PKV?"]),
    "Monatlicher Beitrag": text(f["Monatlicher Beitrag"]) ? parseEuro(text(f["Monatlicher Beitrag"])) : "",
  };
  for (const [k, v] of Object.entries(fields)) if (!v) delete fields[k];
  const pid = text(f["Perspective-ID"]);
  const slug = text(f["slug (from Produkt (Eingang))"]).split(",")[0]?.trim() || null;
  return { externalId: pid ? `perspective:${pid}` : `airtable:${recordId}`, slug, smsVerified: text(f["SMS-Verifizierung"]).toLowerCase() === "sms", fields };
}

export type NachholenResult = { ok: true; leadNr: number; result: PoolResult } | { ok: false; error: string };

/** Lead mit der Airtable-Lead-Nr. (Feld „Lead-ID“) holen und in den Eingang geben. */
export async function nachholenAusAirtable(leadNr: number): Promise<NachholenResult> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) return { ok: false, error: "Airtable ist nicht angebunden." };
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Leads")}`);
  url.searchParams.set("filterByFormula", `{Lead-ID}=${Math.trunc(leadNr)}`);
  url.searchParams.set("maxRecords", "1");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return { ok: false, error: `Airtable antwortet mit ${res.status}.` };
  const rec = ((await res.json()) as { records?: { id: string; fields: Fields }[] }).records?.[0];
  if (!rec) return { ok: false, error: `Lead ${leadNr} gibt es in Airtable nicht.` };
  const m = airtableLeadToPool(rec.id, rec.fields);
  const product = m.slug ? await prisma.product.findFirst({ where: { slug: { equals: m.slug, mode: "insensitive" } }, select: { name: true } }) : null;
  const result = await ingestPoolLead({ externalId: m.externalId, productKey: product?.name ?? "PKV-Tarifoptimierung", via: "airtable-nachgeholt", fields: m.fields, smsVerified: m.smsVerified });
  return { ok: true, leadNr, result };
}
