"use server";

// Beratungsdokumentation als Angebot (Paket B, Ole 18.11.2026): Blatt an der Terminkarte und Schalter in Einstellungen
// bzw. Einrichtung. Logik: lib/beratungsdoku-server.ts. Bei Schalter aus antworten alle Aktionen mit einem Hinweis.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { recordUsage } from "@/lib/usage";
import { gruendeVorschlag } from "@/lib/zusammenfassung-server";
import { bdAblegen, bdPdfVorschau, bdSenden, ladeBeratungsdoku, setzeBeratungsdoku, type BdInfo } from "@/lib/beratungsdoku-server";

async function zugriff(appointmentId: string, schreiben: boolean) {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." } as const;
  const t = await prisma.appointment.findFirst({ where: { id: String(appointmentId), ...appointmentScope(ctx) }, select: { id: true, leadId: true } });
  if (!t?.leadId) return { error: "Termin nicht gefunden." } as const;
  if (schreiben && !(await writableCustomerId(t.leadId))) return { error: "In der Vorschau nur mit Demo-Leads möglich." } as const;
  return { ctx, leadId: t.leadId } as const;
}

function aktualisieren(appointmentId: string, leadId: string) {
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath(`/buyer/kontakte/${leadId}`);
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
}

export async function beratungsdokuInfoResult(appointmentId: string): Promise<{ ok: true; info: BdInfo } | { ok: false; error: string }> {
  const z = await zugriff(appointmentId, false);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const info = await ladeBeratungsdoku(appointmentId, z.ctx);
  return info ? { ok: true, info } : { ok: false, error: "Die Beratungsdokumentation ist in Ihren Einstellungen aus." };
}

/** PDF zum Ansehen (nicht abgelegt), als Base64. */
export async function beratungsdokuPdfResult(appointmentId: string, inhalt: unknown): Promise<{ ok: true; fileName: string; base64: string } | { ok: false; error: string }> {
  const z = await zugriff(appointmentId, false);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await bdPdfVorschau(appointmentId, z.ctx, inhalt);
  return r.ok ? { ok: true, fileName: r.pdf.fileName, base64: Buffer.from(r.pdf.data).toString("base64") } : r;
}

type Ergebnis = { ok: true; message: string } | { ok: false; error: string };

export async function beratungsdokuSendenResult(appointmentId: string, inhalt: unknown): Promise<Ergebnis> {
  const z = await zugriff(appointmentId, true);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await bdSenden(appointmentId, z.ctx, inhalt);
  if (!r.ok) return r;
  if (!r.schon) await recordUsage("action", "beratungsdoku.gesendet");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: r.schon ? "Diese Fassung ist schon gesendet" : "Beratungsdokumentation gesendet und abgelegt" };
}

export async function beratungsdokuAblegenResult(appointmentId: string, inhalt: unknown): Promise<Ergebnis> {
  const z = await zugriff(appointmentId, true);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await bdAblegen(appointmentId, z.ctx, inhalt);
  if (!r.ok) return r;
  if (!r.schon) await recordUsage("action", "beratungsdoku.abgelegt");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: r.schon ? "Diese Fassung liegt schon unter Dokumente" : "Beratungsdokumentation abgelegt" };
}

/**
 * „Vorschlag erstellen“ für die Gründe (Beratungsdokumentation und Gesprächszusammenfassung, nur EU-KI). Speichert
 * nichts: der Vermittler übernimmt den Vorschlag ins Feld, gespeichert wird mit dem normalen Senden bzw. Ablegen.
 */
export async function gruendeVorschlagResult(appointmentId: string, wuensche: string): Promise<{ ok: true; gruende: string } | { ok: false; error: string }> {
  const z = await zugriff(appointmentId, true);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await gruendeVorschlag(appointmentId, z.ctx, typeof wuensche === "string" ? wuensche : "");
  if (!r.ok) return r;
  await recordUsage("action", r.strikt ? "gruende.vorschlag.strikt" : "gruende.vorschlag");
  return { ok: true, gruende: r.gruende };
}

/** Schalter (Einstellungen, Einrichtung): nur Inhaber. */
export async function beratungsdokuSchalterAction(an: boolean): Promise<{ ok: boolean }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false };
  const ok = await setzeBeratungsdoku(ctx, an === true);
  if (ok) await recordUsage("action", an ? "beratungsdoku.an" : "beratungsdoku.aus");
  revalidatePath("/buyer", "layout");
  return { ok };
}
