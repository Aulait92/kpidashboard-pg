import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SOURCE_LABEL, STAGES, shortName } from "@/lib/vertrieb/crm";
import { addDays, fmtDateTime } from "@/lib/vertrieb/dates";
import { dayBounds } from "@/lib/vertrieb/queries";
import { cn } from "@/lib/utils";

/**
 * Vertrieb auf einen Blick (früher Vertrieb → Übersicht, seit 16.11.2026 auf Heute):
 * Kennzahlen, nächste Termine, neue Anfragen und Pipeline. Die fälligen Aufgaben stehen in „Braucht Sie“
 * bzw. im Reiter „Aufgaben“. Pipeline und Anfragen zugeklappt (seltener gebraucht).
 */
export async function VertriebBlick({ highlight }: { highlight?: boolean }) {
  const { start, tomorrow } = dayBounds();
  const [due, overdue, stageCounts, sent, replies, mailNoCall, total, liConnected, liReplies, meetings, leads] = await Promise.all([
    prisma.salesTask.count({ where: { doneAt: null, dueAt: { gte: start, lt: tomorrow } } }),
    prisma.salesTask.count({ where: { doneAt: null, dueAt: { lt: start } } }),
    prisma.salesContact.groupBy({ by: ["stage"], _count: true }),
    prisma.salesContact.count({ where: { campaigns: { some: { sentAt: { not: null } } } } }),
    prisma.salesContact.count({ where: { campaigns: { some: { replyCount: { gt: 0 } } } } }),
    prisma.salesContact.count({ where: { stage: "NEU", campaigns: { some: { sentAt: { not: null } } } } }),
    prisma.salesContact.count(),
    prisma.salesContact.count({ where: { linkedinStatus: { in: ["VERNETZT", "NACHRICHT_GESENDET", "GEANTWORTET"] } } }),
    prisma.salesContact.count({ where: { linkedinStatus: "GEANTWORTET" } }),
    prisma.salesMeeting.findMany({
      where: { status: "GEPLANT", startAt: { gte: start } },
      orderBy: { startAt: "asc" },
      take: 5,
      include: { contact: { select: { id: true, name: true, city: true } } },
    }),
    prisma.salesInboundLead.findMany({
      where: { createdAt: { gte: addDays(start, -7) }, contactId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { contact: { select: { id: true, name: true, city: true } } },
    }),
  ]);
  const count = (id: string) => stageCounts.find((s) => s.stage === id)?._count ?? 0;
  const answers = replies + liReplies;
  const stats: { label: string; value: number; href: string; tone?: string }[] = [
    { label: "Heute fällig", value: due, href: "/admin/heute/aufgaben", tone: due ? "text-amber-700" : undefined },
    { label: "Überfällig", value: overdue, href: "/admin/heute/aufgaben", tone: overdue ? "text-rose-600" : undefined },
    { label: "Antworten", value: answers, href: "/admin/vertrieb/kontakte?mail=replied", tone: answers ? "text-emerald-700" : undefined },
    { label: "Mail, nie angerufen", value: mailNoCall, href: "/admin/vertrieb/kontakte?mail=sent&stage=NEU" },
  ];

  return (
    <section aria-label="Vertrieb" data-vertrieb-blick className={cn("rounded-[var(--radius-lg)]", highlight && "ring-2 ring-[color:var(--brand)] ring-offset-4 ring-offset-[color:var(--background)]")}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Vertrieb</h2>
        <Link href="/admin/vertrieb/kontakte" className="-my-2 inline-flex min-h-10 items-center text-sm text-[color:var(--brand)] hover:underline">
          Kontakte →
        </Link>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-2 gap-px border-b border-[color:var(--border)] bg-[color:var(--border)]">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="block bg-white px-4 py-3 hover:bg-[color:var(--surface-sunken)]">
              <span className="block text-xs text-[color:var(--muted)]">{s.label}</span>
              <span className={cn("block text-xl font-semibold tabular-nums", s.tone)}>{s.value.toLocaleString("de-DE")}</span>
            </Link>
          ))}
        </div>
        <div className="px-4 py-3">
          <h3 className="mb-1 text-sm font-medium">Nächste Termine</h3>
          {meetings.length ? (
            <ul className="-mx-2 text-sm">
              {meetings.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/vertrieb/kontakte/${m.contact.id}`} className="block rounded-lg px-2 py-2 hover:bg-[color:var(--surface-sunken)]">
                    <span className="font-medium">{fmtDateTime(m.startAt)}</span> · {shortName(m.contact.name)}
                    <span className="block text-xs text-[color:var(--muted)]">
                      {m.title}
                      {m.contact.city ? ` · ${m.contact.city}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">Keine anstehenden Termine. Buchungen über Calendly erscheinen hier automatisch.</p>
          )}
        </div>
        {leads.length ? (
          <details className="group border-t border-[color:var(--border)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Neue Anfragen (7 Tage) <span className="flex items-center gap-1 text-[color:var(--muted)]">{leads.length}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></span>
            </summary>
            <ul className="px-2 pb-2 text-sm">
              {leads.map((l) => (
                <li key={l.id}>
                  <Link href={l.contact ? `/admin/vertrieb/kontakte/${l.contact.id}` : "/admin/vertrieb/import"} className="block rounded-lg px-2 py-2 hover:bg-[color:var(--surface-sunken)]">
                    <span className="font-medium">{l.contact ? shortName(l.contact.name) : (l.name ?? l.email)}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {fmtDateTime(l.createdAt)} · {SOURCE_LABEL[l.source] ?? l.source}
                      {l.campaign ? ` · ${l.campaign}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <details className="group border-t border-[color:var(--border)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Pipeline <span className="flex items-center gap-1 text-[color:var(--muted)]">{total.toLocaleString("de-DE")} Kontakte<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></span>
          </summary>
          <ul className="px-2 pb-2">
            {STAGES.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/vertrieb/kontakte?stage=${s.id}`} className="flex min-h-10 items-center justify-between rounded-lg px-2 hover:bg-[color:var(--surface-sunken)]">
                  <span className={`badge ${s.color}`}>{s.label}</span>
                  <span className="text-sm tabular-nums">{count(s.id).toLocaleString("de-DE")}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-xs text-[color:var(--muted)]">
            {sent.toLocaleString("de-DE")} Cold Mails · {liConnected.toLocaleString("de-DE")} auf LinkedIn vernetzt
          </p>
        </details>
      </div>
    </section>
  );
}
