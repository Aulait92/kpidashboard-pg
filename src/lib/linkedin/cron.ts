// LinkedIn im zentralen Cron (alle 5 Minuten): fällige Posts veröffentlichen, Zahlen holen,
// abends Entwürfe für den nächsten Tag schreiben, rechtzeitig an das Neu-Verbinden erinnern.

import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { publishDue, refreshMetrics } from "@/lib/linkedin/posts";
import { maybeGenerateDrafts } from "@/lib/linkedin/drafts";

const DAY = 86_400_000;

export async function runLinkedIn(now = new Date()) {
  const published = await publishDue(now).catch((e: unknown) => {
    reportError(e, "linkedin-publish");
    return null;
  });
  if (published?.failed) {
    await sendToAdmins({ title: "LinkedIn: Post nicht veröffentlicht", body: "Bitte in Vertrieb → LinkedIn ansehen.", url: "/admin/vertrieb/linkedin", tag: "linkedin-error" }).catch(() => null);
  }
  const metrics = await refreshMetrics(now).catch((e: unknown) => {
    reportError(e, "linkedin-metrics");
    return 0;
  });
  // Zugang läuft nach 60 Tagen ab: 7 Tage vorher einmal erinnern
  const conn = await prisma.linkedInConnection.findFirst({ where: { remindedAt: null, expiresAt: { lt: new Date(now.getTime() + 7 * DAY) } } });
  if (conn) {
    await prisma.linkedInConnection.update({ where: { id: conn.id }, data: { remindedAt: now } });
    await sendToAdmins({ title: "LinkedIn bald neu verbinden", body: "Der Zugang läuft in wenigen Tagen ab – ein Klick genügt.", url: "/admin/vertrieb/linkedin", tag: "linkedin-reconnect" }).catch(() => null);
  }
  const drafts = await maybeGenerateDrafts(now).catch((e: unknown) => {
    reportError(e, "linkedin-drafts");
    return 0;
  });
  return { published, metrics, drafts };
}
