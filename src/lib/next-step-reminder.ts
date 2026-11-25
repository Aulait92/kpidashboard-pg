// Tägliche Erinnerung um 8 Uhr (Berliner Zeit) an den zuständigen Berater (Ole, 14.11.2026): Leads ohne
// nächsten Schritt bzw. mit fehlendem Termin-Ergebnis. Per Push und E-Mail, je Login in den Einstellungen
// abschaltbar (User.nextStepReminder). Läuft im zentralen Cron (alle 5 Minuten) zwischen 8 und 12 Uhr;
// die Sperre je Tag (User.nextStepReminderDay, bedingtes Update) verhindert doppelte Erinnerungen.
//
// Termine, zu denen der Push „Wie lief der Termin?“ schon angekommen ist, zählen hier nicht mit (Ole, 25.11.2026).
//
// Nicht an reine Pay-per-Lead-Kunden (ohne Software/Betreuung, customer-package.ts), Ole 18.11.2026.
//
// „Heute fällig“ (Ole, 25.11.2026, Usability-Check: Wiedervorlagen werden überfällig): werktags nennt dieselbe Erinnerung
// zuerst die fälligen und überfälligen Wiedervorlagen (statt eines zweiten Pushs um 8 Uhr). Reine Pay-per-Lead-Kunden
// bekommen nur diesen Teil, denn ihre Wiedervorlagen haben sie selbst angelegt („Nicht erreicht“ in Mail oder Leadliste).
//
// Zuständig: Berater für ihre zugeteilten Leads. Inhaber: eigene und nicht zugeteilte Leads (ohne Team: alle).

import type { Prisma } from "@/generated/prisma/client";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { offeneWiedervorlageWhere } from "@/lib/inbox";
import { sendCustomerMail } from "@/lib/email";
import { appUrl } from "@/lib/whatsapp/event-text";
import { NEXT_STEP_TASK_NOTE, pastOpenAppointmentWhere, resultMissingWhere, withoutNextStepWhere } from "@/lib/lead-next-step";
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
    title: missing === 1 ? "Wichtig: 1 Lead braucht einen nächsten Schritt" : `Wichtig: ${missing} Leads brauchen einen nächsten Schritt`,
    body: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Legen Sie fest, wie es weitergeht: Wiedervorlage, Termin, Abschluss oder Verloren.`,
  };
}

/**
 * Morgen-Erinnerung mit fälligen Wiedervorlagen (werktags). Ohne fällige Wiedervorlage wie reminderText.
 * ohneSchritt = Leads ohne nächsten Schritt inkl. Aufgaben, resultMissing = davon Termine ohne Ergebnis.
 */
export function morgenText(z: { ohneSchritt: number; resultMissing: number; faellig: number; ueberfaellig: number }): { title: string; body: string } {
  if (z.faellig <= 0) return reminderText(z.ohneSchritt, z.resultMissing);
  const saetze: string[] = [];
  if (z.ueberfaellig > 0) saetze.push(z.ueberfaellig === z.faellig ? (z.faellig === 1 ? "Sie ist überfällig." : "Alle sind überfällig.") : `Davon ${z.ueberfaellig} überfällig.`);
  if (z.ohneSchritt > 0) saetze.push(`Dazu ${z.ohneSchritt === 1 ? "braucht 1 Lead" : `brauchen ${z.ohneSchritt} Leads`} einen nächsten Schritt.`);
  else saetze.push("Auf „Heute“ mit einem Tipp erledigen oder auf morgen schieben.");
  return { title: `Heute fällig: ${z.faellig} ${z.faellig === 1 ? "Wiedervorlage" : "Wiedervorlagen"}`, body: saetze.join(" ") };
}

/** Werktag (Mo bis Fr) in Berlin? */
function berlinWerktag(now: Date): boolean {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(now);
  return wd !== "Sat" && wd !== "Sun";
}

/** Beginn des Berliner Tages von now als Zeitpunkt. */
function berlinTagesbeginn(now: Date): Date {
  const ymd = berlinDayKey(now);
  const guess = new Date(`${ymd}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess));
  return new Date(guess.getTime() - h * 3_600_000);
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
  // Reine Pay-per-Lead-Kunden nutzen das CRM nicht (Ole, 18.11.2026): bei ihnen nur fällige Wiedervorlagen (werktags)
  const werktag = berlinWerktag(now);
  const nurPpl = new Set(
    (await prisma.customer.findMany({ where: { AND: [{ id: { in: [...new Set(users.map((u) => u.customerId!))] } }, NUR_PPL_WHERE] }, select: { id: true } })).map((c) => c.id),
  );
  const res: ReminderRun = { due: true, users: users.length, sent: 0 };
  const teamSize = new Map<string, number>();
  const base = appUrl();
  for (const u of users) {
    // Sperre je Tag: nur wer den Tag beansprucht, erinnert (parallele Läufe, Neustarts).
    // Reine Pay-per-Lead-Kunden am Wochenende: nichts zu sagen, Tag nicht beanspruchen
    if (u.customerId && nurPpl.has(u.customerId) && !werktag) continue;
    const claimed = await prisma.user.updateMany({
      where: { id: u.id, OR: [{ nextStepReminderDay: null }, { nextStepReminderDay: { not: day } }] },
      data: { nextStepReminderDay: day },
    });
    if (claimed.count === 0 || !u.customerId) continue;
    // Fehler bei einem Login halten die anderen nicht auf
    if (await remindUser(u as { id: string; email: string; teamRole: string; customerId: string }, now, day, teamSize, base, { nurPpl: nurPpl.has(u.customerId), werktag }).catch((e) => {
      console.error("[next-step reminder]", u.id, e);
      return false;
    })) res.sent++;
  }
  return res;
}

async function remindUser(
  u: { id: string; email: string; teamRole: string; customerId: string },
  now: Date,
  day: string,
  teamSize: Map<string, number>,
  base: string | null,
  art: { nurPpl: boolean; werktag: boolean } = { nurPpl: false, werktag: true },
): Promise<boolean> {
  if (!teamSize.has(u.customerId)) teamSize.set(u.customerId, await prisma.user.count({ where: { customerId: u.customerId, role: "BUYER" } }));
  const scope: Prisma.LeadWhereInput =
    u.teamRole === "advisor"
      ? { customerId: u.customerId, assignedUserId: u.id }
      : (teamSize.get(u.customerId) ?? 1) > 1
        ? { customerId: u.customerId, OR: [{ assignedUserId: u.id }, { assignedUserId: null }] }
        : { customerId: u.customerId };
  // Leads, deren offene Termine alle schon per Push „Wie lief der Termin?“ angekommen sind (lib/termin-ergebnis-push.ts):
  // nicht noch einmal in der Sammel-Erinnerung (Ole, 25.11.2026). Kam ein Push nicht an, bleibt der Lead hier.
  const perPush = { appointments: { none: { ...pastOpenAppointmentWhere(now), ergebnisPushOkAt: null } } };
  const crm = !art.nurPpl;
  // Fällige und überfällige Wiedervorlagen (bis Ende des Tages, wie „Heute fällig“), ohne die Aufgaben
  // „Nächsten Schritt festlegen“ (zählen unten)
  const tagesbeginn = berlinTagesbeginn(now);
  const tagesende = new Date(tagesbeginn.getTime() + 24 * 3_600_000);
  const faelligWhere: Prisma.LeadWhereInput = {
    AND: [scope, { followUpAt: { lt: tagesende }, erasedAt: null, NOT: { followUpNote: NEXT_STEP_TASK_NOTE } }, offeneWiedervorlageWhere()],
  };
  const [missingAlle, resultMissingAlle, tasks, erledigtPerPush, faellig, ueberfaellig] = await Promise.all([
    crm ? prisma.lead.count({ where: { AND: [scope, withoutNextStepWhere(now)] } }) : 0,
    crm ? prisma.lead.count({ where: { AND: [scope, resultMissingWhere(now)] } }) : 0,
    // Aufgaben „Nächsten Schritt festlegen“ von gestern zählen ebenfalls (Dialog ohne Wahl geschlossen)
    crm ? prisma.lead.count({ where: { AND: [scope, { followUpNote: NEXT_STEP_TASK_NOTE, followUpAt: { lte: now } }] } }) : 0,
    crm ? prisma.lead.count({ where: { AND: [scope, resultMissingWhere(now), perPush] } }) : 0,
    art.werktag ? prisma.lead.count({ where: faelligWhere }) : 0,
    art.werktag ? prisma.lead.count({ where: { AND: [faelligWhere, { followUpAt: { lt: tagesbeginn } }] } }) : 0,
  ]);
  const missing = missingAlle - erledigtPerPush;
  const resultMissing = resultMissingAlle - erledigtPerPush;
  const total = missing + tasks;
  if (total === 0 && faellig === 0) return false;
  const t = morgenText({ ohneSchritt: total, resultMissing, faellig, ueberfaellig });
  const url = faellig > 0 ? "/buyer#faellig" : "/buyer/kontakte?ansicht=ohne-schritt";
  await sendToUser(u.id, { title: t.title, body: t.body, url: faellig > 0 ? "/buyer#faellig" : "/buyer", tag: `next-step:${day}` }).catch((e) => console.error("[next-step reminder push]", e));
  // Gestaltete Mail mit Knopf und unserer Signatur (Ole, 15.11.2026; vorher reiner Text ohne Signatur).
  // Knopf vor dem Abschalt-Hinweis, deshalb beides als eigener HTML-Block.
  const leadsUrl = base ? `${base}${url}` : null;
  const knopf = faellig > 0 ? "Heute öffnen" : "Leads ansehen";
  const settingsUrl = base ? `${base}/buyer/einstellungen/erinnerungen` : null;
  await sendCustomerMail({
    to: u.email,
    subject: t.title,
    greeting: "Guten Morgen,",
    paragraphs: [t.body],
    html: [
      leadsUrl
        ? `<p style="margin:8px 0 24px"><a href="${leadsUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${knopf}</a></p>`
        : "",
      `<p style="margin:0;font-size:13px;line-height:1.6;color:#66758f">Diese Erinnerung können Sie unter ${
        settingsUrl ? `<a href="${settingsUrl}" style="color:#66758f">Einstellungen → Erinnerungen &amp; Aufgaben</a>` : "Einstellungen → Erinnerungen &amp; Aufgaben"
      } abschalten.</p>`,
    ].join(""),
    textBlocks: [
      ...(leadsUrl ? [`${knopf}: ${leadsUrl}`, ""] : []),
      `Diese Erinnerung können Sie unter Einstellungen → Erinnerungen & Aufgaben abschalten${settingsUrl ? `: ${settingsUrl}` : "."}`,
    ],
  }).catch((e) => console.error("[next-step reminder mail]", e));
  return true;
}
