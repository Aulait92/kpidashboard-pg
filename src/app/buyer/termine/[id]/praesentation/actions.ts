"use server";

// Bausteine im Termin an- bzw. abschalten (Ole, 15.11.2026): neuer Beitrag sofort auf den Folien.

import { getBuyerContext } from "@/lib/buyer-context";
import { bausteinUmschalten, kundenlinkBeenden, kundenlinkErstellen, loadPraesentation, sparteUmschalten, tarifUmschalten, terminFuerMessung } from "@/lib/termin-vorbereitung-server";
import { ereignisSpeichern, FOLIE_ID } from "@/lib/praesentation-messung";
import { recordUsage } from "@/lib/usage";
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

/** Messung (19.11.2026): Folie im Termin erreicht (je Termin und Folie einmal). Vorschau und Demo zählen nicht. */
export async function folieAction(appointmentId: string, folie: string): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || ctx.demo || !FOLIE_ID.test(folie)) return;
  const t = await terminFuerMessung(appointmentId, ctx);
  if (t) await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie });
}

/** „Ja, so machen wir es“ im Termin: Zusage speichern, die Folie zeigt danach „Zugesagt“. */
export async function zusageAction(appointmentId: string): Promise<{ ok: true; folien: Folie[] } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const t = await terminFuerMessung(appointmentId, ctx);
  if (!t) return { ok: false, error: "Termin nicht gefunden." };
  await ereignisSpeichern({ ...t, quelle: "termin", art: "zusage" });
  await recordUsage("action", "praesentation.zusage");
  const p = await loadPraesentation(appointmentId, ctx);
  return p ? { ok: true, folien: p.folien } : { ok: false, error: "Termin nicht gefunden." };
}
