"use server";

// Eigenes Postfach und Vorlagen (Kundenbereich) + E-Mail an einen Lead senden.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { leadScope } from "@/lib/team";
import { logLeadHistory, loadLeadHistory, type LeadHistoryEntry } from "@/lib/lead-history";
import { saveSmtp, sendViaPostfach } from "@/lib/mail/postfach";

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
    const subject = String(fd.get("subject") ?? "").trim().slice(0, 200);
    const body = String(fd.get("body") ?? "").trim().slice(0, 8000);
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

export async function deleteVorlageAction(id: string): Promise<void> {
  const ctx = await ctxWrite().catch(() => null);
  if (!ctx) return;
  await prisma.mailTemplate.deleteMany({ where: { id, customerId: ctx.customerId } });
  revalidatePath("/buyer/postfach");
}

/** E-Mail an einen Lead über das eigene Postfach; steht danach im Verlauf. */
export async function sendLeadMailAction(input: {
  leadId: string;
  to: string;
  subject: string;
  text: string;
  fileIds: string[];
}): Promise<{ ok: true; history: LeadHistoryEntry[] } | { ok: false; error: string }> {
  try {
    const ctx = await ctxWrite();
    const customerId = await writableCustomerId(input.leadId);
    if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, ...leadScope(ctx) }, select: { id: true, erasedAt: true } });
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
    if (files.reduce((s, f) => s + f.size, 0) > 20 * 1024 * 1024) return { ok: false, error: "Anhänge zusammen höchstens 20 MB." };
    const res = await sendViaPostfach(ctx.userId, {
      to,
      subject,
      text,
      attachments: files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, data: Buffer.from(f.data) })),
    });
    if (!res.ok) return { ok: false, error: res.error };
    const anh = files.length ? `\n\nAnhang: ${files.map((f) => f.fileName).join(", ")}` : "";
    await logLeadHistory(lead.id, "email", `E-Mail an ${to}: ${subject}\n\n${text}${anh}`, { customerId, userId: ctx.userId });
    await recordUsage("action", "lead.email");
    revalidatePath(`/buyer/leads/${lead.id}`);
    return { ok: true, history: await loadLeadHistory(lead.id, ctx.userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}
