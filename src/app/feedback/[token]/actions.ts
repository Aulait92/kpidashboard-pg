"use server";

import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";

export type FeedbackState = { ok?: boolean; error?: string };

export async function submitFeedbackAction(token: string, _prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const score = Number(fd.get("score"));
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 2000) || null;
  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: "Bitte einen Smiley auswählen." };
  const fb = await prisma.customerFeedback.findUnique({
    where: { token },
    include: { customer: { select: { name: true, salesContact: { select: { id: true } } } } },
  });
  if (!fb) return { error: "Dieser Link ist ungültig." };
  const first = !fb.answeredAt;
  await prisma.customerFeedback.update({ where: { id: fb.id }, data: { score, comment, answeredAt: new Date() } });

  const contactId = fb.customer.salesContact?.id ?? null;
  const label = fb.kind === "day7" ? "Start (Tag 7)" : "erster Monat (Tag 30)";
  try {
    if (contactId) {
      await prisma.salesActivity.create({
        data: { contactId, type: "NOTIZ", outcome: `Feedback ${label}: ${score}/5`, note: comment },
      });
    }
    // Unzufrieden → sofort reagieren: Push + Aufgabe „heute anrufen“ (einmalig).
    if (score <= 2 && first) {
      await sendToAdmins({
        title: `⚠️ Unzufrieden: ${fb.customer.name} (${score}/5)`,
        body: comment ?? `Feedback ${label}`,
        url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/kunden",
      });
      if (contactId) {
        await prisma.salesTask.create({
          data: { contactId, type: "ANRUF", title: `Kunden heute anrufen – Feedback ${score}/5`, note: comment, dueAt: new Date() },
        });
      }
    }
  } catch (err) {
    reportError(err, "feedback-followup");
  }
  return { ok: true };
}
