"use server";

import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { isNpsKind, isUnhappy, kindLabel, scaleOf } from "@/lib/nps";

export type FeedbackState = { ok?: boolean; error?: string; referralUrl?: string | null };

export async function submitFeedbackAction(token: string, _prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const fb = await prisma.customerFeedback.findUnique({
    where: { token },
    include: { customer: { select: { name: true, salesContact: { select: { id: true } } } } },
  });
  if (!fb) return { error: "Dieser Link ist ungültig." };
  const scale = scaleOf(fb.kind);
  const rawScore = String(fd.get("score") ?? "").trim();
  const score = rawScore === "" ? NaN : Number(rawScore);
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 2000) || null;
  if (!Number.isInteger(score) || score < scale.min || score > scale.max) return { error: isNpsKind(fb.kind) ? "Bitte eine Zahl von 0 bis 10 wählen." : "Bitte einen Smiley auswählen." };
  const first = !fb.answeredAt;
  await prisma.customerFeedback.update({ where: { id: fb.id }, data: { score, comment, answeredAt: new Date() } });

  const contactId = fb.customer.salesContact?.id ?? null;
  const label = kindLabel(fb.kind);
  const of = `${score}/${scale.max}`;
  try {
    if (contactId) {
      await prisma.salesActivity.create({
        data: { contactId, type: "NOTIZ", outcome: `Feedback ${label}: ${of}`, note: comment },
      });
    }
    // Unzufrieden → sofort reagieren: Push + Aufgabe „heute anrufen“ (einmalig).
    if (isUnhappy(fb.kind, score) && first) {
      await sendToAdmins({
        title: `⚠️ Unzufrieden: ${fb.customer.name} (${of})`,
        body: comment ?? `Feedback ${label}`,
        url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/kunden",
      });
      if (contactId) {
        await prisma.salesTask.create({
          data: { contactId, type: "ANRUF", title: `Kunden heute anrufen: Feedback ${of}`, note: comment, dueAt: new Date() },
        });
      }
    }
  } catch (err) {
    reportError(err, "feedback-followup");
  }
  // Gute Bewertung nach 30/90 Tagen → „Kollegen empfehlen“ im Danke-Bildschirm
  let referralUrl: string | null = null;
  try {
    const { referralLinkAfterFeedback } = await import("@/lib/kollegen");
    referralUrl = await referralLinkAfterFeedback(fb.customerId, fb.kind, score);
  } catch (err) {
    reportError(err, "feedback-referral");
  }
  return { ok: true, referralUrl };
}
