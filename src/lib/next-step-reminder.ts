// Tägliche Erinnerung um 8 Uhr (Berliner Zeit) an den zuständigen Berater (Ole, 14.11.2026): Leads ohne
// nächsten Schritt bzw. mit fehlendem Termin-Ergebnis. Per Push und E-Mail, je Login in den Einstellungen
// abschaltbar (User.nextStepReminder). Läuft im zentralen Cron (alle 5 Minuten) zwischen 8 und 12 Uhr;
// die Sperre je Tag (User.nextStepReminderDay, bedingtes Update) verhindert doppelte Erinnerungen.
//
// Zuständig: Berater für ihre zugeteilten Leads. Inhaber: eigene und nicht zugeteilte Leads (ohne Team: alle).

import type { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendPlainMail } from "@/lib/email";
import { NEXT_STEP_TASK_NOTE, resultMissingWhere, withoutNextStepWhere } from "@/lib/lead-next-step";
import { prisma } from "@/lib/prisma";
import { sendToUser } from "@/lib/push";

const TZ = "Europe/Berlin";
export const REMINDER_FROM_HOUR = 8;
const REMINDER_UNTIL_HOUR = 12;

export function berlinDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

function berlinHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Text der Erinnerung (Vermittler-Oberfläche, Sie-Form, ohne Gedankenstriche). */
export function reminderText(missing: number, resultMissing: number): { title: string; body: string } {
  const without = missing - resultMissing;
  const parts: string[] = [];
  if (without > 0) parts.push(`${without} ${without === 1 ? "Lead hat" : "Leads haben"} keinen nächsten Schritt`);
  if (resultMissing > 0) parts.push(`bei ${resultMissing} ${resultMissing === 1 ? "Termin fehlt" : "Terminen fehlt"} das Ergebnis`);
  const sentence = parts.join(", ");
  return {
    title: missing === 1 ? "1 Lead braucht einen nächsten Schritt" : `${missing} Leads brauchen einen nächsten Schritt`,
    body: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Legen Sie fest, wie es weitergeht: Wiedervorlage, Termin, Gewonnen oder Verloren.`,
  };
}

export type ReminderRun = { due: boolean; users: number; sent: number };

export async function runNextStepReminders(now = new Date()): Promise<ReminderRun> {
  const hour = berlinHour(now);
  if (hour < REMINDER_FROM_HOUR || hour >= REMINDER_UNTIL_HOUR) return { due: false, users: 0, sent: 0 };
  const day = berlinDayKey(now);
  const users = await prisma.user.findMany({
    where: {
      role: "BUYER",
      customerId: { not: null },
      nextStepReminder: true,
      OR: [{ nextStepReminderDay: null }, { nextStepReminderDay: { not: day } }],
      customer: { archived: false },
    },
    select: { id: true, email: true, teamRole: true, customerId: true },
    take: 200,
  });
  const res: ReminderRun = { due: true, users: users.length, sent: 0 };
  const teamSize = new Map<string, number>();
  for (const u of users) {
    // Sperre je Tag: nur wer den Tag beansprucht, erinnert (parallele Läufe, Neustarts).
    const claimed = await prisma.user.updateMany({
      where: { id: u.id, OR: [{ nextStepReminderDay: null }, { nextStepReminderDay: { not: day } }] },
      data: { nextStepReminderDay: day },
    });
    if (claimed.count === 0 || !u.customerId) continue;
    if (!teamSize.has(u.customerId)) teamSize.set(u.customerId, await prisma.user.count({ where: { customerId: u.customerId, role: "BUYER" } }));
    const scope: Prisma.LeadWhereInput =
      u.teamRole === "advisor"
        ? { customerId: u.customerId, assignedUserId: u.id }
        : (teamSize.get(u.customerId) ?? 1) > 1
          ? { customerId: u.customerId, OR: [{ assignedUserId: u.id }, { assignedUserId: null }] }
          : { customerId: u.customerId };
    const [missing, resultMissing, tasks] = await Promise.all([
      prisma.lead.count({ where: { AND: [scope, withoutNextStepWhere(now)] } }),
      prisma.lead.count({ where: { AND: [scope, resultMissingWhere(now)] } }),
      // Aufgaben „Nächsten Schritt festlegen“ von gestern zählen ebenfalls (Dialog ohne Wahl geschlossen)
      prisma.lead.count({ where: { AND: [scope, { followUpNote: NEXT_STEP_TASK_NOTE, followUpAt: { lte: now } }] } }),
    ]);
    const total = missing + tasks;
    if (total === 0) continue;
    const t = reminderText(total, resultMissing);
    const url = "/buyer/kontakte?ansicht=ohne-schritt";
    await sendToUser(u.id, { title: t.title, body: t.body, url: "/buyer", tag: `next-step:${day}` }).catch((e) => console.error("[next-step reminder push]", e));
    await sendPlainMail({
      to: u.email,
      subject: t.title,
      text: `Guten Morgen,\n\n${t.body}\n\n${getAppUrl()}${url}\n\nDiese Erinnerung können Sie unter Einstellungen abschalten.\n\nIhr performancegrowth-Team`,
    }).catch((e) => console.error("[next-step reminder mail]", e));
    res.sent++;
  }
  return res;
}
