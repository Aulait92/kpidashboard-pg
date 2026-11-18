"use server";

// Angebot nach dem Termin senden (Paket P3, Ole 17.11.2026): Blatt „Angebot senden“ auf „Heute“, im Blatt „Wie lief der
// Termin?“, am Kontakt und in der Terminvorbereitung (Schritt 4). Logik: lib/angebot-senden-server.ts.
// Hat der Termin noch kein Ergebnis, setzt das Senden es auf „Angebot gesendet“ (wie bisher über appointmentOutcomeResult),
// das Nachfassen startet aber erst mit dem Versand bzw. „Habe ich selbst gesendet“.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { recordUsage } from "@/lib/usage";
import { angebotAblegen, angebotSelbst, angebotSenden, angebotWiedervorlageWeg, ladeAngebotInfo, type AngebotInfo } from "@/lib/angebot-senden-server";
import {
  zusammenfassungAblegen,
  zusammenfassungKi,
  zusammenfassungPdfDaten,
  zusammenfassungSelbstGesendet,
  zusammenfassungSenden,
  type ZusammenfassungText,
} from "@/lib/zusammenfassung-server";
import { appointmentOutcomeResult } from "@/app/buyer/inbox-actions";

type Ergebnis = { ok: true; message: string } | { ok: false; error: string };

async function zugriff(appointmentId: string) {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." } as const;
  const t = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    select: { id: true, leadId: true, status: true, startsAt: true, lead: { select: { status: true } } },
  });
  if (!t?.leadId) return { error: "Termin nicht gefunden." } as const;
  return { ctx, t, leadId: t.leadId } as const;
}

function aktualisieren(appointmentId: string, leadId: string) {
  revalidatePath("/buyer");
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath(`/buyer/kontakte/${leadId}`);
}

/** Termin ohne Ergebnis (vorbei): Ergebnis „Angebot gesendet“ setzen; danach die klassische Wiedervorlage wieder weg. */
async function ergebnisSetzen(t: { id: string; status: string; startsAt: Date }, leadId: string, nachfassen: boolean) {
  if (t.status !== "booked" || t.startsAt.getTime() > Date.now()) return;
  const r = await appointmentOutcomeResult(t.id, "offer", null);
  if (!r.ok) console.error("[angebot ergebnis]", r.error);
  if (nachfassen) await angebotWiedervorlageWeg(leadId);
}

export async function angebotInfoResult(appointmentId: string): Promise<{ ok: true; info: AngebotInfo } | { ok: false; error: string }> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const info = await ladeAngebotInfo(appointmentId, z.ctx);
  return info ? { ok: true, info } : { ok: false, error: "Termin nicht gefunden." };
}

/** „Über die App senden“: WhatsApp und E-Mail mit dem PDF der Gesellschaft. */
export async function angebotSendenResult(appointmentId: string, input: { dateiId: string; kundenlink: boolean; zusammenfassung?: ZusammenfassungText | null }): Promise<Ergebnis> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  if (!(await writableCustomerId(z.leadId))) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  if (typeof input?.dateiId !== "string" || !input.dateiId) return { ok: false, error: "Bitte zuerst das Angebot als PDF hochladen." };
  const r = await angebotSenden(appointmentId, z.ctx, { dateiId: input.dateiId, kundenlink: !!input.kundenlink, zusammenfassung: input.zusammenfassung ?? null });
  if (!r.ok) return r;
  await ergebnisSetzen(z.t, z.leadId, r.nachfassen);
  await recordUsage("action", "angebot.app");
  if (r.zusammenfassung) await recordUsage("action", `zusammenfassung.${r.zusammenfassung}`);
  aktualisieren(appointmentId, z.leadId);
  const wie = r.kanaele.length === 2 ? "per WhatsApp und E-Mail" : r.kanaele[0] === "whatsapp" ? "per WhatsApp" : "per E-Mail";
  const mit = r.zusammenfassung === "gesendet" ? " mit Zusammenfassung" : "";
  return { ok: true, message: `Angebot ${wie}${mit} gesendet${r.hinweise.length ? `. ${r.hinweise.join(". ")}` : ""}` };
}

/** „Habe ich selbst gesendet“: ein Tipp, Nachfassen nur per WhatsApp und Anruf. */
export async function angebotSelbstResult(appointmentId: string, dateiId?: string | null): Promise<Ergebnis> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  if (!(await writableCustomerId(z.leadId))) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const r = await angebotSelbst(appointmentId, z.ctx, { dateiId: typeof dateiId === "string" ? dateiId : null });
  if (!r.ok) return r;
  await ergebnisSetzen(z.t, z.leadId, r.nachfassen);
  await recordUsage("action", "angebot.selbst");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: r.nachfassen ? "Vermerkt. Die App fasst per WhatsApp nach." : "Vermerkt" };
}

/** PDF zum Termin vermerken („Angebot abgelegt am“). */
export async function angebotAblegenResult(appointmentId: string, dateiId: string): Promise<Ergebnis> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  if (!(await writableCustomerId(z.leadId))) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  if (typeof dateiId !== "string" || !(await angebotAblegen(appointmentId, z.ctx, dateiId))) return { ok: false, error: "Datei nicht gefunden." };
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: "Angebot abgelegt" };
}

// ─── Gesprächszusammenfassung (Paket M5) ──────────────────────────────────────────────────────

async function schreibZugriff(appointmentId: string) {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { error: z.error ?? "Termin nicht gefunden." } as const;
  if (!(await writableCustomerId(z.leadId))) return { error: "In der Vorschau nur mit Demo-Leads möglich." } as const;
  return z;
}

/** „Mit KI formulieren“ (nur EU-KI, ohne Gesundheitssparten). Ergebnis ist ein Entwurf zum Prüfen. */
export async function zusammenfassungKiResult(appointmentId: string, text: ZusammenfassungText): Promise<{ ok: true; wuensche: string; rat: string } | { ok: false; error: string }> {
  const z = await schreibZugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await zusammenfassungKi(appointmentId, z.ctx, text);
  if (r.ok) await recordUsage("action", "zusammenfassung.ki");
  return r;
}

/** PDF zum Ansehen, Teilen oder Herunterladen (nicht abgelegt), als Base64. */
export async function zusammenfassungPdfResult(appointmentId: string, text: ZusammenfassungText): Promise<{ ok: true; fileName: string; base64: string } | { ok: false; error: string }> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await zusammenfassungPdfDaten(appointmentId, z.ctx, text);
  return r.ok ? { ok: true, fileName: r.pdf.fileName, base64: Buffer.from(r.pdf.data).toString("base64") } : r;
}

type Ablage = { ok: true; message: string; dateiId: string } | { ok: false; error: string };

/** „Zusammenfassung ablegen“: PDF unter Dokumente (Beratungsdokumentation). */
export async function zusammenfassungAblegenResult(appointmentId: string, text: ZusammenfassungText): Promise<Ablage> {
  const z = await schreibZugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await zusammenfassungAblegen(appointmentId, z.ctx, text);
  if (!r.ok) return r;
  await recordUsage("action", "zusammenfassung.abgelegt");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: "Zusammenfassung abgelegt", dateiId: r.dateiId };
}

/** „Per App senden“: Vorlage „Gesprächszusammenfassung“ mit PDF, danach abgelegt. */
export async function zusammenfassungSendenResult(appointmentId: string, text: ZusammenfassungText): Promise<Ablage> {
  const z = await schreibZugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await zusammenfassungSenden(appointmentId, z.ctx, text);
  if (!r.ok) return r;
  await recordUsage("action", "zusammenfassung.gesendet");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: "Zusammenfassung gesendet und abgelegt", dateiId: r.dateiId };
}

/** „Gesendet?“ → Ja nach Mailprogramm oder Kopieren: Verlauf und Ablage. */
export async function zusammenfassungSelbstResult(
  appointmentId: string,
  input: ZusammenfassungText & { to: string; subject: string; text: string; dateiId?: string | null },
): Promise<Ablage> {
  const z = await schreibZugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const r = await zusammenfassungSelbstGesendet(appointmentId, z.ctx, input);
  if (!r.ok) return r;
  await recordUsage("action", "zusammenfassung.selbst");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: "Vermerkt: Zusammenfassung gesendet und abgelegt", dateiId: r.dateiId };
}
