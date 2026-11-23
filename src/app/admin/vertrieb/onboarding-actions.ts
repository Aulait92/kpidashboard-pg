"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { endPauseNow, planPause } from "@/lib/pause";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ADMIN_ABGEHAKT, MANUAL_FIELDS, NICHT_ABHAKBAR, openSetupForExisting, vonUnsAbgehakt, restartSetup, sendGoLiveMail, sendWelcome, startOnboarding } from "@/lib/onboarding";
import { logOfferActivity, setContactCustomerStage } from "@/lib/offer-links";
import { audit } from "@/lib/audit";
import { issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl } from "@/lib/email";
import type { Prisma } from "@/generated/prisma/client";

function refresh(contactId?: string | null) {
  revalidatePath("/admin/neu/vertrieb", "layout");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte)
  if (contactId) revalidatePath(`/admin/neu/vertrieb/kontakte/${contactId}`);
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}

export async function startOnboardingAction(fd: FormData) {
  await requireAuth();
  const offerId = String(fd.get("offerId") ?? "");
  const customerId = String(fd.get("customerId") ?? "") || null;
  const res = await startOnboarding(offerId, { customerId });
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { salesContactId: true } });
  if (res.ok) await setContactCustomerStage({ dealId: null, salesContactId: offer?.salesContactId ?? null }, "ONBOARDING");
  refresh(offer?.salesContactId);
}

/** Kundenakte: Einrichtung für Bestandskunden ohne Onboarding freischalten. */
export async function openSetupAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  if (!customerId) return;
  await openSetupForExisting(customerId);
  revalidatePath(`/admin/neu/kunden/${customerId}`);
  revalidatePath("/buyer", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}

/** Kundenakte: Einrichtung neu starten (Fragebogen, Kalender, WhatsApp, Einwilligung wieder offen). */
export async function restartSetupAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  if (!customerId || fd.get("confirm") !== "on") return;
  await restartSetup(customerId);
  revalidatePath(`/admin/neu/kunden/${customerId}`);
  revalidatePath("/buyer", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}

export async function toggleOnboardingStepAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  const step = String(fd.get("step") ?? "") as keyof typeof MANUAL_FIELDS;
  const field = MANUAL_FIELDS[step];
  if (!field) return;
  const ob = await prisma.onboarding.findUnique({ where: { id } });
  if (!ob) return;
  const value = ob[field] ? null : new Date();
  await prisma.onboarding.update({ where: { id }, data: { [field]: value } });
  refresh(ob.salesContactId);
}

/**
 * Kundenakte (Ole, 20.11.2026): jeden Einrichtungsschritt für den Kunden abhaken bzw. zurücksetzen. Schritte mit
 * eigenem Datumsfeld (Meta, Einwilligung, Testlead …) setzen das Feld, die App den Überspringen-Zeitpunkt, alle
 * anderen einen Eintrag „admin“ in stepSkips. Zurücksetzen nimmt nur unseren Haken weg, nie echte Daten.
 */
export async function abhakenFuerKundeAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const step = String(fd.get("step") ?? "");
  if (!customerId || !step || (NICHT_ABHAKBAR as readonly string[]).includes(step)) return;
  const ob = await prisma.onboarding.findUnique({ where: { customerId }, select: { id: true, salesContactId: true, appSkippedAt: true, stepSkips: true } });
  if (!ob) return;
  const field = MANUAL_FIELDS[step as keyof typeof MANUAL_FIELDS];
  let erledigt: boolean;
  if (field) {
    const row = await prisma.onboarding.findUnique({ where: { id: ob.id }, select: { [field]: true } as Record<string, true> });
    erledigt = !(row as Record<string, unknown> | null)?.[field];
    await prisma.onboarding.update({ where: { id: ob.id }, data: { [field]: erledigt ? new Date() : null } });
  } else if (step === "app") {
    erledigt = !ob.appSkippedAt;
    await prisma.onboarding.update({ where: { id: ob.id }, data: { appSkippedAt: erledigt ? new Date() : null } });
  } else {
    const skips = { ...((ob.stepSkips && typeof ob.stepSkips === "object" ? ob.stepSkips : {}) as Record<string, unknown>) };
    erledigt = !vonUnsAbgehakt(skips, step);
    if (erledigt) skips[step] = { at: new Date().toISOString(), reason: ADMIN_ABGEHAKT };
    else delete skips[step];
    await prisma.onboarding.update({ where: { id: ob.id }, data: { stepSkips: skips as Prisma.InputJsonValue } });
  }
  await audit(erledigt ? "einrichtung.abgehakt" : "einrichtung.zurueckgesetzt", { entity: "Customer", entityId: customerId, customerId, details: { step } });
  revalidatePath(`/admin/neu/kunden/${customerId}`);
  revalidatePath("/buyer", "layout");
  refresh(ob.salesContactId);
}

export async function goLiveAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  const ob = await prisma.onboarding.findUnique({ where: { id } });
  if (!ob) return;
  const undo = !!ob.liveAt;
  await prisma.onboarding.update({
    where: { id },
    data: undo ? { liveAt: null, status: "running" } : { liveAt: new Date(), status: "live" },
  });
  const ref = { dealId: null, salesContactId: ob.salesContactId };
  if (!undo) {
    await setContactCustomerStage(ref, "TEST");
    await sendGoLiveMail(ob.id);
    await logOfferActivity(ref, "Onboarding abgeschlossen – Kunde ist live", "Kunden-Pipeline: Test · Go-live-Mail verschickt");
  }
  refresh(ob.salesContactId);
}

/** Selbst-Einrichtung: Erinnerung sofort an den Kunden (Mail + Push), unabhängig von Tag 1/3/7. */
export async function sendSetupReminderAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const { sendSetupReminderNow } = await import("@/lib/selbst-einrichtung");
  const res = await sendSetupReminderNow(customerId);
  refresh();
  redirect(await adminZiel(`/admin/neu/kunden/${customerId}?einrichtung=${res.ok ? "erinnert" : encodeURIComponent(res.error)}`));
}

/** Selbst-Einrichtung: Meta-Zugriff jetzt prüfen (mit den beim Kunden hinterlegten IDs). */
export async function adminCheckMetaAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const { checkMetaAccess } = await import("@/lib/selbst-einrichtung");
  const res = await checkMetaAccess(customerId, {}, { source: "admin" });
  refresh();
  redirect(await adminZiel(`/admin/neu/kunden/${customerId}?einrichtung=${res.ok ? (res.check.ok ? "meta-ok" : "meta-fehlt") : encodeURIComponent(res.error)}`));
}

export async function resendWelcomeAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  await sendWelcome(id);
  const ob = await prisma.onboarding.findUnique({ where: { id }, select: { salesContactId: true } });
  refresh(ob?.salesContactId);
}

/**
 * „Einladungslink kopieren“ (Ole, 20.11.2026): frischer Link zum Passwort festlegen, den Ole per WhatsApp schickt, wenn
 * die Mail im Firmenpostfach hängt. Ältere Links (z. B. aus der Willkommens-Mail) bleiben gültig, bis ein Passwort
 * gesetzt ist. Noch nie angemeldet: 7 Tage gültig, sonst 24 Stunden (Passwort ändern). Nur Admins.
 */
export async function einladungslinkAction(onboardingId: string): Promise<{ url?: string; email?: string; error?: string }> {
  await requireAuth();
  const ob = await prisma.onboarding.findUnique({
    where: { id: onboardingId },
    select: { offerId: true, customerId: true, customer: { select: { users: { where: { role: "BUYER" }, select: { id: true, email: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!ob) return { error: "Onboarding nicht gefunden." };
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { email: true } }) : null;
  const mail = (offer?.email ?? "").trim().toLowerCase();
  const user = ob.customer.users.find((u) => u.email.toLowerCase() === mail) ?? ob.customer.users[0];
  if (!user) return { error: "Für diesen Kunden gibt es noch keinen Login." };
  const token = await issuePasswordResetToken(user.email, user.lastLoginAt ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000, { keepOthers: true });
  if (!token) return { error: "Link konnte nicht erzeugt werden." };
  await audit("user.invite_link", { entity: "User", entityId: user.id, customerId: ob.customerId, details: { email: user.email, kopiert: true } });
  return { url: buildResetUrl(token.rawToken), email: user.email };
}

// ─── Pause / Urlaub (Admin) ────────────────────────────────────────────

export async function adminPlanPauseAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const contactId = String(fd.get("contactId") ?? "") || null;
  const until = String(fd.get("until") ?? "").trim();
  const res = await planPause(customerId, { from: String(fd.get("from") ?? ""), until: until || null, reason: String(fd.get("reason") ?? "") }, "admin");
  refresh(contactId);
  if (!res.ok) redirect(await adminZiel(`/admin/neu/kunden/${customerId}/abrechnung?pause=${encodeURIComponent(res.error)}`));
}

export async function adminEndPauseAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const contactId = String(fd.get("contactId") ?? "") || null;
  await endPauseNow(customerId, { admin: true });
  refresh(contactId);
}

/** „2026-11-25T10:00“ (deutsche Ortszeit) → Zeitpunkt. */
function berlinLokal(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const roh = new Date(`${s}:00Z`);
  const tz = (zone: string) => new Date(roh.toLocaleString("en-US", { timeZone: zone })).getTime();
  return new Date(roh.getTime() - (tz("Europe/Berlin") - tz("UTC")));
}

/**
 * Onboarding-Termin (60 Minuten) für den Kunden buchen (Ole, 23.11.2026): im Team-Kalender mit Video-Link, Einladung an
 * den Login des Kunden, gespeichert wie der Hilfetermin (Onboarding.helpCallAt, lib/help-call.ts).
 */
export async function onboardingTerminBuchenAction(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  const zurueck = String(fd.get("zurueck") ?? "/admin/neu");
  const ob = await prisma.onboarding.findUnique({ where: { id }, select: { customerId: true, salesContactId: true, customer: { select: { name: true } } } });
  if (!ob) redirect(zurueck);
  const andere = String(fd.get("andereZeit") ?? "").trim();
  const start = andere ? berlinLokal(andere) : new Date(String(fd.get("start") ?? ""));
  const ziel = (p: string) => `${zurueck}${zurueck.includes("?") ? "&" : "?"}${p}#onboarding`;
  if (!start || Number.isNaN(start.getTime())) redirect(ziel(`onboardingTermin=${encodeURIComponent("Bitte eine Zeit wählen.")}`));
  const { bookHelpCall } = await import("@/lib/help-call");
  const r = await bookHelpCall(ob.customerId, start.toISOString(), null, {
    minutes: 60,
    summary: `performancegrowth: Onboarding (${ob.customer.name})`,
    description: "60 Minuten per Video: Wir richten Ihr Konto gemeinsam ein und gehen alle Schritte bis zum Start durch. Bitte am Computer teilnehmen, damit Sie Ihren Bildschirm teilen können.",
  });
  await audit("onboarding.termin", { entity: "Onboarding", entityId: id, details: { start: start.toISOString(), ok: r.ok, ...(r.ok ? {} : { error: r.error }) }, actor: { email: session.email, role: "admin" } }).catch(() => null);
  refresh(ob.salesContactId);
  redirect(ziel(r.ok ? "onboardingTermin=ok" : `onboardingTermin=${encodeURIComponent(r.error)}`));
}
