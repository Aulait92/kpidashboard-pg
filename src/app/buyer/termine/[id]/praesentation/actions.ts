"use server";

// Bausteine im Termin an- bzw. abschalten (Ole, 15.11.2026): neuer Beitrag sofort auf den Folien.

import { getBuyerContext } from "@/lib/buyer-context";
import { bausteinUmschalten, kundenlinkBeenden, kundenlinkErstellen, sparteUmschalten, tarifUmschalten } from "@/lib/termin-vorbereitung-server";
import { publicUrlOr } from "@/lib/public-url";
import type { Folie } from "@/lib/praesentation";

export async function bausteinAction(appointmentId: string, item: number, baustein: number, aktiv: boolean): Promise<{ ok: true; folien: Folie[] } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (![item, baustein].every((n) => Number.isInteger(n) && n >= 0 && n < 20)) return { ok: false, error: "Ungültig." };
  const p = await bausteinUmschalten(appointmentId, ctx, item, baustein, !!aktiv);
  return p ? { ok: true, folien: p.folien } : { ok: false, error: "Baustein nicht gefunden. Sind die Angebote bestätigt?" };
}

export async function tarifAction(appointmentId: string, item: number, ganzeSparte = false): Promise<{ ok: true; folien: Folie[] } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!Number.isInteger(item) || item < 0 || item >= 20) return { ok: false, error: "Ungültig." };
  const p = ganzeSparte ? await sparteUmschalten(appointmentId, ctx, item) : await tarifUmschalten(appointmentId, ctx, item);
  return p ? { ok: true, folien: p.folien } : { ok: false, error: "Tarif nicht gefunden. Sind die Angebote bestätigt?" };
}

const linkDatum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);

/** Kundenlink erstellen bzw. verlängern (14 Tage). */
export async function kundenlinkAction(appointmentId: string): Promise<{ ok: true; url: string; bis: string } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const r = await kundenlinkErstellen(appointmentId, ctx);
  if (!r) return { ok: false, error: "Bitte zuerst die Angebote in der Terminvorbereitung bestätigen." };
  return { ok: true, url: publicUrlOr(`/beratung/${r.token}`), bis: linkDatum(r.bis) };
}

export async function kundenlinkBeendenAction(appointmentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  return { ok: await kundenlinkBeenden(appointmentId, ctx) };
}
