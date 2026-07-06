import Link from "next/link";
import { redirect } from "next/navigation";
import { endOfDay, startOfDay } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  CalendarPlus,
  CheckCircle2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Video,
} from "lucide-react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActivitiesFilterBar } from "@/components/activities-filter-bar";
import { ActivityDoneToggle } from "@/components/activity-done-toggle";
import { ActivityDateEdit } from "@/components/activity-date-edit";
import { getCurrentSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const BERLIN = tz("Europe/Berlin");

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aktivitäten | KPI-Dashboard",
};

type SearchParams = Promise<{
  kind?: string;
  q?: string;
}>;

const KIND_LABEL: Record<string, string> = {
  note: "Notiz",
  call: "Anruf",
  settercall: "Settercall ausmachen",
  videosalescall: "Videosalescall ausmachen",
  whatsapp: "WhatsApp",
  email: "Mail",
  meeting: "Termin",
  status_change: "Status",
};
const KIND_TONE: Record<string, string> = {
  note: "bg-zinc-100 text-zinc-700",
  call: "bg-blue-100 text-blue-800",
  settercall: "bg-blue-100 text-blue-800",
  videosalescall: "bg-indigo-100 text-indigo-800",
  whatsapp: "bg-green-100 text-green-800",
  email: "bg-violet-100 text-violet-800",
  meeting: "bg-amber-100 text-amber-800",
  status_change: "bg-emerald-100 text-emerald-800",
};

function kindIcon(kind: string) {
  switch (kind) {
    case "call":
    case "settercall":
      return Phone;
    case "videosalescall":
      return Video;
    case "whatsapp":
      return MessageCircle;
    case "email":
      return Mail;
    case "meeting":
      return CalendarPlus;
    case "status_change":
      return CheckCircle2;
    default:
      return MessageSquare;
  }
}

export default async function AdminActivitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const sp = await searchParams;
  const kindFilter = sp.kind?.trim() || null;
  const queryRaw = sp.q?.trim() ?? "";

  const baseWhere = {
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(queryRaw
      ? {
          OR: [
            { title: { contains: queryRaw, mode: "insensitive" as const } },
            { body: { contains: queryRaw, mode: "insensitive" as const } },
            { deal: { name: { contains: queryRaw, mode: "insensitive" as const } } },
            {
              deal: {
                company: { contains: queryRaw, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const now = new Date();
  const todayStart = startOfDay(now, { in: BERLIN });
  const todayEnd = endOfDay(now, { in: BERLIN });
  const include = {
    deal: { select: { id: true, name: true, company: true, status: true } },
    createdBy: { select: { email: true } },
  } as const;
  const [heute, kommende, history] = await Promise.all([
    // Heute: für heute (Berlin-Zeit) geplant UND noch nicht abgehakt.
    prisma.dealActivity.findMany({
      where: {
        ...baseWhere,
        completedAt: null,
        scheduledFor: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { scheduledFor: "asc" },
      take: 200,
      include,
    }),
    // Kommende: ab morgen geplant UND noch nicht abgehakt.
    prisma.dealActivity.findMany({
      where: {
        ...baseWhere,
        completedAt: null,
        scheduledFor: { gt: todayEnd },
      },
      orderBy: { scheduledFor: "asc" },
      take: 200,
      include,
    }),
    // Historie: abgehakt ODER ohne Termin ODER vor heute.
    prisma.dealActivity.findMany({
      where: {
        ...baseWhere,
        OR: [
          { completedAt: { not: null } },
          { scheduledFor: null },
          { scheduledFor: { lt: todayStart } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include,
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Aktivitäten
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Alle CRM-Aktivitäten über die Deal-Pipeline hinweg — heute fällige
            zuerst, dann kommende, dann Historie.
          </p>
        </div>
        <ActivitiesFilterBar currentKind={kindFilter} currentQuery={queryRaw} />
      </header>

      <AdminTabs />

      <Section title={`Heute (${heute.length})`}>
        {heute.length === 0 ? (
          <Empty>Heute keine geplanten Aktivitäten.</Empty>
        ) : (
          <List>
            {heute.map((a) => (
              <Row key={a.id} activity={a} isUpcoming />
            ))}
          </List>
        )}
      </Section>

      <Section title={`Kommende (${kommende.length})`}>
        {kommende.length === 0 ? (
          <Empty>Keine kommenden Aktivitäten.</Empty>
        ) : (
          <List>
            {kommende.map((a) => (
              <Row key={a.id} activity={a} isUpcoming />
            ))}
          </List>
        )}
      </Section>

      <Section title={`Historie (${history.length})`}>
        {history.length === 0 ? (
          <Empty>Noch keine erledigten Aktivitäten.</Empty>
        ) : (
          <List>
            {history.map((a) => (
              <Row key={a.id} activity={a} isUpcoming={false} />
            ))}
          </List>
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      {children}
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <ol className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="divide-y divide-[color:var(--border)]">{children}</div>
    </ol>
  );
}

type ActivityRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  scheduledFor: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  deal: { id: string; name: string | null; company: string | null; status: string | null };
  createdBy: { email: string } | null;
};

function Row({
  activity,
  isUpcoming,
}: {
  activity: ActivityRow;
  isUpcoming: boolean;
}) {
  const Icon = kindIcon(activity.kind);
  const tone = KIND_TONE[activity.kind] ?? KIND_TONE.note;
  const kindLabel = KIND_LABEL[activity.kind] ?? activity.kind;
  return (
    <div className="flex gap-3 px-5 py-3">
      <span
        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/admin/crm/${activity.deal.id}`}
              className="text-sm font-semibold text-[color:var(--brand)] hover:underline"
            >
              {activity.deal.name ?? "Unbenannter Deal"}
            </Link>
            {activity.deal.company ? (
              <span className="ml-1 text-xs text-[color:var(--muted)]">
                · {activity.deal.company}
              </span>
            ) : null}
          </div>
          {activity.kind === "status_change" ? (
            <div className="shrink-0 text-[11px] text-[color:var(--muted)]">
              {formatDate(activity.createdAt)}
            </div>
          ) : (
            <ActivityDateEdit
              activityId={activity.id}
              dealId={activity.deal.id}
              kind="date"
              value={activity.createdAt}
            />
          )}
        </div>
        <div className="mt-0.5 text-sm font-medium text-[color:var(--foreground)] break-words">
          {activity.title}
        </div>
        {activity.body ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[color:var(--muted)]">
            {activity.body}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[color:var(--muted)]">
          {activity.kind !== "status_change" ? (
            <ActivityDoneToggle
              activityId={activity.id}
              done={activity.completedAt != null}
            />
          ) : null}
          <span>{kindLabel}</span>
          {activity.deal.status ? <span>· {activity.deal.status}</span> : null}
          {activity.kind !== "status_change" ? (
            <ActivityDateEdit
              activityId={activity.id}
              dealId={activity.deal.id}
              kind="schedule"
              value={activity.scheduledFor}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
