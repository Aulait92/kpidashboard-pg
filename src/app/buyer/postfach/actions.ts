"use server";

// Eigenes Postfach und Vorlagen (Kundenbereich) + E-Mail an einen Lead senden.

import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { leadScope } from "@/lib/team";
import { logLeadHistory, loadLeadHistory, type LeadHistoryEntry } from "@/lib/lead-history";
import { saveSmtp, sendViaPostfach } from "@/lib/mail/postfach";
import { fuehreNachfassenAus } from "@/lib/mail/termin-erinnerung";
import { nachfassenFuer } from "@/lib/mail/phasen";
import { asAnsprache } from "@/lib/ansprache";
import { datumKurz, musterKuendigung } from "@/lib/mail/platzhalter";
import { beratungsPdfInhalt, pdfDateiname } from "@/lib/mail/beratung";
import { textPdf } from "@/lib/mail/text-pdf";
import { saveLeadFile } from "@/lib/lead-files";

export type PostfachResult = { ok?: boolean; error?: string; info?: string };

async function ctxWrite() {
  const ctx = await getBuyerContext();
  if (!ctx) throw new Error("Bitte neu anmelden.");
  if (ctx.preview || !ctx.userId) throw new Error("In der Vorschau nicht möglich.");
  return ctx as typeof ctx & { userId: string };
}

export async function saveSmtpAction(_prev: PostfachResult, fd: FormData): Promise<PostfachResult> {
  try {
    const ctx = await ctxWrite();
    const res = await saveSmtp(ctx.userId, {
      email: String(fd.get("email") ?? ""),
      fromName: String(fd.get("fromName") ?? ""),
      host: String(fd.get("host") ?? ""),
      port: Number(fd.get("port") ?? 587),
      user: String(fd.get("user") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer/postfach");
    return { ok: true, info: "Postfach verbunden." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

export async function disconnectPostfachAction(): Promise<void> {
  const ctx = await ctxWrite().catch(() => null);
  if (!ctx) return;
  await prisma.mailConnection.deleteMany({ where: { userId: ctx.userId } });
  revalidatePath("/buyer/postfach");
}

/** Testmail an die eigene Adresse. */
export async function testPostfachAction(): Promise<PostfachResult> {
  try {
    const ctx = await ctxWrite();
    const c = await prisma.mailConnection.findUnique({ where: { userId: ctx.userId }, select: { email: true } });
    if (!c) return { error: "Noch kein Postfach verbunden." };
    const res = await sendViaPostfach(ctx.userId, {
      to: c.email,
      subject: "Test aus performancegrowth",
      text: "Diese Test-E-Mail wurde aus performancegrowth über Ihr Postfach gesendet. Alles funktioniert.",
    });
    return res.ok ? { ok: true, info: `Test-E-Mail an ${c.email} gesendet.` } : { error: res.error };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

export async function saveVorlageAction(_prev: PostfachResult, fd: FormData): Promise<PostfachResult> {
  try {
    const ctx = await ctxWrite();
    const id = String(fd.get("id") ?? "");
    const name = String(fd.get("name") ?? "").trim().slice(0, 80);
    // Keine Gedankenstriche in Mails an Leads: beim Speichern durch Komma ersetzen (Bis-Striche bleiben)
    const subject = ohneGedankenstriche(String(fd.get("subject") ?? "").trim().slice(0, 200));
    const body = ohneGedankenstriche(String(fd.get("body") ?? "").trim().slice(0, 8000));
    if (!name || !subject || !body) return { error: "Name, Betreff und Text ausfüllen." };
    if (id) {
      const r = await prisma.mailTemplate.updateMany({ where: { id, customerId: ctx.customerId }, data: { name, subject, body } });
      if (!r.count) return { error: "Vorlage nicht gefunden." };
    } else {
      await prisma.mailTemplate.create({ data: { customerId: ctx.customerId, name, subject, body } });
    }
    revalidatePath("/buyer/postfach");
    return { ok: true, info: "Vorlage gespeichert." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** E-Mail-Signatur speichern (je Login). */
export async function saveSignaturAction(_prev: PostfachResult, fd: FormData): Promise<PostfachResult> {
  try {
    const ctx = await ctxWrite();
    const sig = ohneGedankenstriche(String(fd.get("signatur") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000));
    await prisma.user.update({ where: { id: ctx.userId }, data: { mailSignature: sig || null } });
    revalidatePath("/buyer/postfach");
    return { ok: true, info: sig ? "Signatur gespeichert." : "Signatur entfernt." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

export async function deleteVorlageAction(id: string): Promise<void> {
  const ctx = await ctxWrite().catch(() => null);
  if (!ctx) return;
  await prisma.mailTemplate.deleteMany({ where: { id, customerId: ctx.customerId } });
  revalidatePath("/buyer/postfach");
}

/** PDF-Anhang aus dem Dialog (wird erzeugt, angehängt und nach dem Senden unter Dokumente abgelegt). */
export type MailPdf =
  | { art: "beratung"; wuensche: string; rat: string }
  | { art: "kuendigung"; versicherer: string; vertragsnummer: string; kuendigungstermin: string };

/** E-Mail an einen Lead über das eigene Postfach; steht danach im Verlauf. */
export async function sendLeadMailAction(input: {
  leadId: string;
  to: string;
  subject: string;
  text: string;
  fileIds: string[];
  /** Gewählte Standardvorlage (z. B. „unterlagen_fehlen“); bestimmt die Nachfass-Aufgabe */
  vorlageKey?: string | null;
  /** Nachfass-Aufgabe gewünscht (Terminlink, Nicht erschienen, Unterlagen) und in wie vielen Werktagen */
  erinnern?: boolean;
  erinnernTage?: number;
  /** Text enthält den Terminlink */
  mitLink?: boolean;
  /** „Wie besprochen“: vereinbarter Tag (YYYY-MM-DD) für die Wiedervorlage */
  meldeTag?: string | null;
  /** PDF erzeugen und anhängen */
  pdf?: MailPdf | null;
  /** Alt: Erinnern, falls kein Termin gebucht wird (Werktage) */
  remindDays?: number | null;
}): Promise<{ ok: true; history: LeadHistoryEntry[]; reminder?: string | null } | { ok: false; error: string }> {
  try {
    const ctx = await ctxWrite();
    const customerId = await writableCustomerId(input.leadId);
    if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, ...leadScope(ctx) }, select: { id: true, erasedAt: true, name: true, source: true } });
    if (!lead || lead.erasedAt) return { ok: false, error: "Lead nicht gefunden." };
    const to = input.to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
    const subject = input.subject.trim().slice(0, 200);
    const text = input.text.trim().slice(0, 20000);
    if (!subject || !text) return { ok: false, error: "Betreff und Text ausfüllen." };
    const files = input.fileIds.length
      ? await prisma.leadFile.findMany({
          where: { id: { in: input.fileIds.slice(0, 10) }, leadId: lead.id },
          select: { fileName: true, contentType: true, data: true, size: true },
        })
      : [];
    const pdf = input.pdf ? await mailPdf(input.pdf, { customerId, userId: ctx.userId, kunde: lead.name ?? "", produkt: lead.source }) : null;
    const attachments = files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, data: Buffer.from(f.data) }));
    if (pdf) attachments.push({ fileName: pdf.fileName, contentType: "application/pdf", data: Buffer.from(pdf.data) });
    if (attachments.reduce((s, f) => s + f.data.length, 0) > 20 * 1024 * 1024) return { ok: false, error: "Anhänge zusammen höchstens 20 MB." };
    const res = await sendViaPostfach(ctx.userId, { to, subject, text, attachments });
    if (!res.ok) return { ok: false, error: res.error };
    const anh = attachments.length ? `\n\nAnhang: ${attachments.map((f) => f.fileName).join(", ")}` : "";
    await logLeadHistory(lead.id, "email", `E-Mail an ${to}: ${subject}\n\n${text}${anh}`, { customerId, userId: ctx.userId });
    await recordUsage("action", "lead.email");
    const notes: string[] = [];
    // PDF im Kontakt unter Dokumente ablegen
    if (pdf) {
      const saved = await saveLeadFile({ leadId: lead.id, customerId, kind: "sonstiges", fileName: pdf.fileName, data: pdf.data, userId: ctx.userId }).catch(() => null);
      notes.push(saved?.ok ? "PDF unter Dokumente abgelegt." : "PDF gesendet, aber nicht unter Dokumente abgelegt.");
    }
    // Nachfass-Aufgabe je Vorlage, ohne Doppelungen (lib/mail/termin-erinnerung.ts)
    const plan =
      input.remindDays != null && input.erinnern === undefined
        ? nachfassenFuer(input.vorlageKey, { erinnern: input.remindDays > 0, tage: input.remindDays, mitLink: true })
        : nachfassenFuer(input.vorlageKey, { erinnern: !!input.erinnern, tage: input.erinnernTage ?? 2, mitLink: !!input.mitLink, meldeTag: input.meldeTag });
    const reminder = await fuehreNachfassenAus(lead.id, plan, { customerId, userId: ctx.userId }).catch(() => null);
    if (reminder) notes.push(reminder);
    revalidatePath(`/buyer/leads/${lead.id}`);
    return { ok: true, history: await loadLeadHistory(lead.id, ctx.userId), reminder: notes.join(" ") || null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** PDF für die Gesprächszusammenfassung bzw. Musterkündigung erzeugen. */
async function mailPdf(p: MailPdf, o: { customerId: string; userId: string; kunde: string; produkt: string | null }): Promise<{ fileName: string; data: Uint8Array }> {
  const kurz = (v: string, n: number) => String(v ?? "").trim().slice(0, n);
  if (p.art === "kuendigung") {
    const muster = musterKuendigung({ name: o.kunde, versicherer: kurz(p.versicherer, 120), vertragsnummer: kurz(p.vertragsnummer, 60), kuendigungstermin: datumKurz(kurz(p.kuendigungstermin, 10)) });
    const [titel, , ...rest] = muster.split("\n");
    return { fileName: pdfDateiname("Musterkuendigung", o.kunde), data: await textPdf({ titel, bloecke: [{ text: rest.join("\n") }] }) };
  }
  const [c, conn, me] = await Promise.all([
    prisma.customer.findUnique({ where: { id: o.customerId }, select: { leadAddress: true } }),
    prisma.mailConnection.findUnique({ where: { userId: o.userId }, select: { fromName: true } }),
    prisma.user.findUnique({ where: { id: o.userId }, select: { displayName: true } }),
  ]);
  const berater = conn?.fromName ?? me?.displayName ?? "";
  const inhalt = beratungsPdfInhalt({
    an: asAnsprache(c?.leadAddress),
    kunde: o.kunde,
    produkt: (o.produkt ?? "").trim() || "Versicherung",
    berater,
    wuensche: kurz(p.wuensche, 6000),
    rat: kurz(p.rat, 6000),
  });
  return { fileName: pdfDateiname("Beratungsdokumentation", o.kunde), data: await textPdf({ ...inhalt, autor: berater || undefined }) };
}


/**
 * „E-Mail-Funktionen nutzen“ (Ole, 15.11.2026): aus = „Meine Gesellschaft erlaubt das nicht“ (E-Mail-Knopf, E-Mail-Fenster,
 * Vorlagen und E-Mail-Kanal bei Bestandskampagnen ausgeblendet). Nur der Inhaber, nicht in der Vorschau.
 */
export async function setMailFeaturesAction(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { ok: false, error: "Nur der Inhaber kann das ändern." };
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { mailFeaturesOff: !on } });
  revalidatePath("/buyer", "layout");
  return { ok: true };
}
