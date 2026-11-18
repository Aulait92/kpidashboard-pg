"use server";

// Neue Terminvorbereitung (Ole, 15.11.2026): Autosave der Tarifauswahl, abgehakte Punkte, Gesellschaft, eigene
// Tarife, Preise aus dem Angebot. Ohne revalidatePath: die Seite hält ihren Stand selbst (Autosave beim Tippen).

import { getBuyerContext } from "@/lib/buyer-context";
import { neueTerminvorbereitung } from "@/lib/terminvorbereitung-neu";
import { ladeTarifkatalogAktuell } from "@/lib/tarif-vorschlaege-server";
import { gesellschaftAusText, tarifeFuer } from "@/lib/tarifkatalog";
import { katalogWerte } from "@/lib/bisheriger-vertrag";
import { cleanTarifauswahl, sparteNeu, type Tarifauswahl } from "@/lib/tarifauswahl";
import {
  eigenenTarifAnlegen,
  gesellschaftenSpeichern,
  klaerenSpeichern,
  meineAuswahl,
  preiseAuslesen,
  tarifauswahlSpeichern,
  vertriebFuer,
  type EigenerTarifZeile,
} from "@/lib/tarifauswahl-server";

type Fehler = { ok: false; error: string };

async function kontext() {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." } as const;
  if (ctx.preview) return { error: "In der Vorschau wird nichts gespeichert." } as const;
  if (!neueTerminvorbereitung(ctx)) return { error: "Nicht verfügbar." } as const;
  return { ctx } as const;
}

export async function tarifauswahlSpeichernAction(appointmentId: string, auswahl: unknown): Promise<{ ok: true } | Fehler> {
  const k = await kontext();
  if ("error" in k) return { ok: false, error: k.error! };
  const r = await tarifauswahlSpeichern(appointmentId, k.ctx, auswahl);
  return r.ok ? { ok: true } : r;
}

export async function klaerenAction(appointmentId: string, erledigt: string[]): Promise<{ ok: true } | Fehler> {
  const k = await kontext();
  if ("error" in k) return { ok: false, error: k.error! };
  return (await klaerenSpeichern(appointmentId, k.ctx, Array.isArray(erledigt) ? erledigt : [])) ? { ok: true } : { ok: false, error: "Termin nicht gefunden." };
}

export async function eigenerTarifAction(raw: { sparte: string; gesellschaft: string; name: string; werte?: Record<string, string | null> }): Promise<{ ok: true; tarif: EigenerTarifZeile } | Fehler> {
  const k = await kontext();
  if ("error" in k) return { ok: false, error: k.error! };
  const t = await eigenenTarifAnlegen(k.ctx, raw);
  return t ? { ok: true, tarif: t } : { ok: false, error: "Bitte Gesellschaft und Tarifname eintragen." };
}

/**
 * Gesellschaft(en) speichern (Vertreter einmalig, Makler bevorzugte). Mit Auswahl: Sparten ohne Tarife bekommen
 * gleich die Vorauswahl der neuen Gesellschaft, dann wird gespeichert.
 */
export async function gesellschaftAction(appointmentId: string | null, keys: string[], auswahl?: unknown): Promise<{ ok: true; auswahl?: Tarifauswahl } | Fehler> {
  const k = await kontext();
  if ("error" in k) return { ok: false, error: k.error! };
  await gesellschaftenSpeichern(k.ctx, Array.isArray(keys) ? keys : []);
  const a = auswahl ? cleanTarifauswahl(auswahl) : null;
  if (!appointmentId || !a) return { ok: true };
  const [{ vertrieb }, meine] = await Promise.all([vertriebFuer(k.ctx.customerId), meineAuswahl(k.ctx)]);
  const kat = await ladeTarifkatalogAktuell();
  a.sparten = a.sparten.map((sp) => (sp.tarife.length ? sp : (sparteNeu(kat, sp.key, vertrieb, meine) ?? sp)));
  const r = await tarifauswahlSpeichern(appointmentId, k.ctx, a);
  return r.ok ? { ok: true, auswahl: r.auswahl } : r;
}

export async function preiseAuslesenAction(appointmentId: string, auswahl: unknown): Promise<{ ok: true; auswahl: Tarifauswahl; anzahl: number; sparten: string[] } | Fehler> {
  const k = await kontext();
  if ("error" in k) return { ok: false, error: k.error! };
  return preiseAuslesen(appointmentId, k.ctx, auswahl);
}

export type BisherTarif = { id: string; name: string; kurz: string; gesellschaft: string; werte: Record<string, string> };

/**
 * Bisheriger Vertrag (Paket P3b): Tarife einer Gesellschaft in dieser Sparte aus dem ganzen Katalog (auch fremde
 * Gesellschaften, der bisherige Vertrag ist meist woanders). Nur lesen.
 */
export async function bisherTarifeAction(sparte: string, gesellschaft: string): Promise<{ ok: true; tarife: BisherTarif[] } | Fehler> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (!neueTerminvorbereitung(ctx)) return { ok: false, error: "Nicht verfügbar." };
  const g = gesellschaftAusText(String(gesellschaft ?? "").slice(0, 80)) ?? String(gesellschaft ?? "").trim().toLowerCase();
  const tarife = tarifeFuer(await ladeTarifkatalogAktuell(), String(sparte ?? "").slice(0, 80), [g]).slice(0, 30);
  return { ok: true, tarife: tarife.map((t) => ({ id: t.id, name: t.name, kurz: t.kurz, gesellschaft: t.gesellschaftName, werte: katalogWerte(t) })) };
}
