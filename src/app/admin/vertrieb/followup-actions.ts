"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { fromDayKey } from "@/lib/vertrieb/dates";
import { approveFollowups, draftFollowup, loadFollowupSettings, planExistingFollowups, planFollowup, sendFollowupStep, stopFollowup, updateFollowup } from "@/lib/vertrieb/followup";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function refresh(contactId?: string | null) {
  revalidatePath("/admin/neu/vertrieb", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte)
  if (contactId) revalidatePath(`/admin/neu/vertrieb/kontakte/${contactId}`);
}

/** Text und Datum im Kontakt ändern */
export async function saveFollowupAction(fd: FormData) {
  await requireAuth();
  const f = await updateFollowup(s(fd, "id")!, { date: s(fd, "date"), body1: s(fd, "body1"), body2: s(fd, "body2") });
  refresh(f.contactId);
}

export type FollowupState = { ok: boolean; message: string } | null;

/** „Jetzt senden“: nächste Mail sofort (ohne Versandfenster) */
export async function sendFollowupNowAction(_p: FollowupState, fd: FormData): Promise<FollowupState> {
  await requireAuth();
  const id = s(fd, "id")!;
  const r = await sendFollowupStep(id, { manual: true });
  const f = await prisma.salesFollowup.findUnique({ where: { id }, select: { contactId: true } });
  refresh(f?.contactId);
  if (r.sent) return { ok: true, message: `Mail ${r.sent} gesendet.` };
  if (r.finished) return { ok: true, message: "Follow-up beendet, Aufgabe „Wieder melden“ angelegt." };
  if (r.stopped) return { ok: false, message: `Nicht gesendet, Follow-up gestoppt: ${r.stopped}` };
  return { ok: false, message: r.error ? `Fehler: ${r.error}` : `Nicht gesendet (${r.skipped ?? "?"})` };
}

export async function stopFollowupAction(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  await stopFollowup(contactId, "Manuell gestoppt", { manual: true });
  refresh(contactId);
}

/** Einzeln oder „Alle freigeben“ */
export async function approveFollowupAction(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id");
  await approveFollowups(id ? [id] : "all");
  const f = id ? await prisma.salesFollowup.findUnique({ where: { id }, select: { contactId: true } }) : null;
  refresh(f?.contactId);
}

/** Im Kontakt von Hand einplanen (Datum wählbar) */
export async function planFollowupAction(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const date = s(fd, "date");
  await planFollowup(contactId, { source: "AUSGANG", dueAt: date ? fromDayKey(date, "09:30") : undefined });
  refresh(contactId);
}

/** Texte neu schreiben lassen (KI bzw. Vorlage) */
export async function redraftFollowupAction(fd: FormData) {
  await requireAuth();
  const f = await draftFollowup(s(fd, "id")!, { force: true });
  refresh(f.contactId);
}

/** „Texte neu schreiben“ mit Rückmeldung (KI braucht ein paar Sekunden) */
export async function redraftFollowupNowAction(_p: FollowupState, fd: FormData): Promise<FollowupState> {
  await requireAuth();
  try {
    const f = await draftFollowup(s(fd, "id")!, { force: true });
    refresh(f.contactId);
    const settings = await loadFollowupSettings();
    const { vertriebsLinkFuerKontakt } = await import("@/lib/vertrieb/buchung");
    const url = await vertriebsLinkFuerKontakt(settings.bookingUrl, f.contactId);
    const link = url && f.body1?.includes(url) ? " mit Buchungslink" : url ? "" : " (kein Buchungslink eingestellt)";
    return { ok: true, message: `Texte neu geschrieben (${f.textSource === "KI" ? "per KI" : "Vorlage"})${link}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Texte konnten nicht neu geschrieben werden." };
  }
}

export async function saveFollowupSettingsAction(fd: FormData) {
  await requireAuth();
  const perDay = Math.min(100, Math.max(1, Math.round(Number(s(fd, "perDay") ?? 15)) || 15));
  const url = s(fd, "bookingUrl");
  const data = {
    enabled: fd.get("enabled") === "on",
    useAi: fd.get("useAi") === "on",
    perDay,
    bookingUrl: url && /^https?:\/\//i.test(url) ? url : null,
    pitch: (s(fd, "pitch") ?? "").replace(/\s*[–—]\s*/g, ", ") || undefined,
    signature: (typeof fd.get("signature") === "string" ? String(fd.get("signature")).replace(/\r/g, "").trim() : "") || null,
  };
  await prisma.salesFollowupSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  refresh();
}

/** Bestand erneut prüfen (neue Kontakte mit Stufe „Später“ ohne Follow-up, wartet auf Freigabe) */
export async function planExistingAction() {
  await requireAuth();
  await planExistingFollowups();
  refresh();
}
