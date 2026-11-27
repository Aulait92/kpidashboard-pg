"use server";

// E-Mails aus der Kontaktakte (Ole, 23.11.2026): Senden über das eigene Postfach, Postfach trennen, Vorlagen pflegen.
// Nur Admins (requireAuth in jeder Action, Server Functions sind per POST direkt erreichbar).

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { prisma } from "@/lib/prisma";
import { kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { sendeKontaktMail, type CrmMailErgebnis } from "@/lib/vertrieb/crm-mail-server";
import { crmPostfachTrennen } from "@/lib/vertrieb/crm-postfach";
import { pruefeVorlage } from "@/lib/vertrieb/crm-vorlagen";

export type VorschlagErgebnis = { ok: true; subject: string; body: string; du: boolean } | { ok: false; error: string };

/** Antwortmail aus dem Verlauf vorschlagen (Ole, 27.11.2026, lib/vertrieb/mail-vorschlag.ts). du = null: wie im Verlauf. */
export async function mailVorschlagAction(contactId: string, du: boolean | null): Promise<VorschlagErgebnis> {
  const session = await requireAuth();
  if (typeof contactId !== "string" || (du !== null && typeof du !== "boolean")) return { ok: false, error: "Ungültige Eingabe." };
  try {
    const { mailVorschlag } = await import("@/lib/vertrieb/mail-vorschlag");
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { displayName: true, email: true } });
    const v = await mailVorschlag(contactId, { du, absender: { displayName: user?.displayName ?? null, email: user?.email ?? session.email ?? "" } });
    return v ? { ok: true, ...v } : { ok: false, error: "Für diesen Kontakt gibt es keinen Vorschlag." };
  } catch {
    return { ok: false, error: "Vorschlag gerade nicht möglich. Bitte eine Vorlage wählen oder selbst schreiben." };
  }
}

const VORLAGEN_PFAD = "/admin/neu/einstellungen/nachrichten";

export async function sendKontaktMailAction(contactId: string, eingabe: { to: string; subject: string; body: string }): Promise<CrmMailErgebnis> {
  const session = await requireAuth();
  if (typeof contactId !== "string" || !eingabe || typeof eingabe.to !== "string" || typeof eingabe.subject !== "string" || typeof eingabe.body !== "string") {
    return { ok: false, error: "Ungültige Eingabe." };
  }
  const r = await sendeKontaktMail(session, contactId, eingabe);
  if (r.ok) revalidatePath(kontaktPfad(contactId));
  return r;
}

export async function crmPostfachTrennenAction(): Promise<void> {
  const session = await requireAuth();
  await crmPostfachTrennen(session.userId);
  revalidatePath("/admin/neu", "layout");
}

export type VorlageErgebnis = { ok: true } | { ok: false; error: string };

export async function crmVorlageSpeichernAction(input: { id?: string | null; name: string; subject: string; body: string; bodyDu?: string | null }): Promise<VorlageErgebnis> {
  await requireAuth();
  const p = pruefeVorlage({ name: String(input?.name ?? ""), subject: String(input?.subject ?? ""), body: String(input?.body ?? ""), bodyDu: input?.bodyDu == null ? null : String(input.bodyDu) });
  if (!p.ok) return p;
  if (input.id) {
    const r = await prisma.salesMailTemplate.updateMany({ where: { id: String(input.id) }, data: p.v });
    if (!r.count) return { ok: false, error: "Vorlage nicht gefunden." };
  } else {
    const letzte = await prisma.salesMailTemplate.findFirst({ orderBy: { sort: "desc" }, select: { sort: true } });
    await prisma.salesMailTemplate.create({ data: { ...p.v, sort: (letzte?.sort ?? 0) + 10 } });
  }
  revalidatePath(VORLAGEN_PFAD);
  return { ok: true };
}

export async function crmVorlageLoeschenAction(id: string): Promise<VorlageErgebnis> {
  await requireAuth();
  await prisma.salesMailTemplate.deleteMany({ where: { id: String(id) } });
  revalidatePath(VORLAGEN_PFAD);
  return { ok: true };
}
