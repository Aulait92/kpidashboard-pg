import Link from "next/link";
import { appointmentOutcomeAction } from "@/app/buyer/actions";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";

// „Heute"-Übersicht für WhatsApp-Kunden: was steht an (Termine heute/morgen),
// welche Termine brauchen ein Ergebnis („Wie lief's?") und was wartet sonst
// (Chats, die den Berater brauchen; Rückrufe).

const TZ = "Europe/Berlin";
const DAY = 24 * 60 * 60 * 1000;
const POST_STATUSES = ["Angebot gesendet", "Abschluss", "Kein Interesse", "Disqualifiziert"];

function berlinDayStart(d: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD
  const guess = new Date(`${ymd}T00:00:00Z`);
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess),
  );
  return new Date(guess.getTime() - h * 60 * 60 * 1000);
}

const time = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const day = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric" }).format(d);

export async function TodayPanel({ customerId }: { customerId: string }) {
  const now = new Date();
  const todayStart = berlinDayStart(now);
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY);

  const [upcoming, past, attention, callbacks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        customerId,
        status: "booked",
        startsAt: { gte: new Date(now.getTime() - 60 * 60 * 1000), lt: tomorrowEnd },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        mode: true,
        meetUrl: true,
        manageToken: true,
        leadId: true,
        conversationId: true,
        lead: { select: { name: true, phone: true, status: true } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        customerId,
        status: "booked",
        startsAt: { lt: new Date(now.getTime() - 30 * 60 * 1000), gt: new Date(now.getTime() - 30 * DAY) },
        leadId: { not: null },
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: {
        id: true,
        startsAt: true,
        mode: true,
        leadId: true,
        lead: { select: { name: true, status: true } },
      },
    }),
    prisma.conversation.count({ where: { customerId, needsAttention: true } }),
    getCallbackLeads(customerId),
  ]);

  // Hat der Kunde den Lead schon selbst weitergeschoben (Angebot/Abschluss …),
  // braucht der Termin keine Rückfrage mehr.
  const needsOutcome = past.filter((a) => !POST_STATUSES.includes(a.lead?.status ?? ""));

  const convIds = upcoming.map((a) => a.conversationId).filter((x): x is string => !!x);
  const convs = convIds.length
    ? await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { id: true, contactName: true, contactPhone: true, qualificationSummary: true },
      })
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] bg-[color:var(--brand-soft)]/40 px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Heute
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {upcoming.length === 0
              ? "Heute und morgen keine Termine"
              : `${upcoming.length} ${upcoming.length === 1 ? "Termin" : "Termine"} heute & morgen`}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link
            href="/buyer/chats?f=attention"
            className={`rounded-full px-3 py-1.5 ${attention > 0 ? "bg-rose-600 text-white" : "bg-zinc-100 text-zinc-600"}`}
          >
            💬 {attention} {attention === 1 ? "Chat braucht" : "Chats brauchen"} dich
          </Link>
          <Link
            href="/buyer/leads"
            className={`rounded-full px-3 py-1.5 ${callbacks.length > 0 ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-600"}`}
          >
            📞 {callbacks.length} {callbacks.length === 1 ? "Rückruf" : "Rückrufe"}
          </Link>
        </div>
      </div>

      {upcoming.length > 0 ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {upcoming.map((a) => {
            const conv = a.conversationId ? convById.get(a.conversationId) : undefined;
            const name = a.lead?.name ?? conv?.contactName ?? "Lead";
            const phone = a.lead?.phone ?? conv?.contactPhone ?? null;
            const isToday = a.startsAt.getTime() < todayStart.getTime() + DAY;
            return (
              <li key={a.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-lg font-bold leading-tight">{time(a.startsAt)}</div>
                    <div className="text-[11px] text-[color:var(--muted)]">{isToday ? "heute" : day(a.startsAt)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {a.leadId ? (
                        <Link href={`/buyer/leads/${a.leadId}`} className="hover:text-[color:var(--brand)]">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                      <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
                        {a.mode === "video" ? "Videocall" : "Telefonat – du rufst an"}
                      </span>
                    </div>
                    {conv?.qualificationSummary ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--muted)]">{conv.qualificationSummary}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
                  {a.mode === "video" && a.meetUrl ? (
                    <a href={a.meetUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-white">
                      🎥 Videocall
                    </a>
                  ) : phone ? (
                    <a href={`tel:+${phone}`} className="rounded-lg bg-[color:var(--brand)] px-3 py-2 text-white">
                      📞 +{phone}
                    </a>
                  ) : null}
                  {a.conversationId ? (
                    <Link href={`/buyer/chats?c=${a.conversationId}`} className="rounded-lg border border-[color:var(--border)] px-3 py-2">
                      Chat
                    </Link>
                  ) : null}
                  {a.manageToken ? (
                    <a
                      href={`/book/manage/${a.manageToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-[color:var(--border)] px-3 py-2"
                    >
                      Verschieben
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {needsOutcome.length > 0 ? (
        <div className="border-t border-[color:var(--border)]">
          <div className="bg-violet-50/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            Wie lief&apos;s? · {needsOutcome.length} {needsOutcome.length === 1 ? "Termin braucht" : "Termine brauchen"} ein Ergebnis
          </div>
          <ul className="divide-y divide-[color:var(--border)]">
            {needsOutcome.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 text-sm">
                  <Link href={`/buyer/leads/${a.leadId}`} className="font-semibold hover:text-[color:var(--brand)]">
                    {a.lead?.name ?? "Lead"}
                  </Link>
                  <span className="ml-2 text-xs text-[color:var(--muted)]">
                    {day(a.startsAt)} {time(a.startsAt)} · {a.mode === "video" ? "Videocall" : "Telefonat"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <OutcomeButton id={a.id} outcome="offer" label="Angebot gesendet" cls="border-violet-300 text-violet-800 hover:bg-violet-50" />
                  <form action={appointmentOutcomeAction} className="flex items-center gap-1">
                    <input type="hidden" name="appointmentId" value={a.id} />
                    <input type="hidden" name="outcome" value="closed" />
                    <input
                      name="closeValue"
                      inputMode="decimal"
                      placeholder="€ Wert"
                      className="w-20 rounded-lg border border-[color:var(--border)] px-2 py-2 text-xs"
                    />
                    <SubmitButton pendingLabel="…" className="rounded-lg border border-emerald-300 px-3 py-2 text-emerald-800 hover:bg-emerald-50">
                      Abschluss
                    </SubmitButton>
                  </form>
                  <OutcomeButton id={a.id} outcome="lost" label="Kein Interesse" cls="border-rose-200 text-rose-700 hover:bg-rose-50" />
                  <OutcomeButton id={a.id} outcome="no_show" label="Nicht erschienen" cls="border-[color:var(--border)] hover:border-amber-400" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function OutcomeButton({ id, outcome, label, cls }: { id: string; outcome: string; label: string; cls: string }) {
  return (
    <form action={appointmentOutcomeAction}>
      <input type="hidden" name="appointmentId" value={id} />
      <input type="hidden" name="outcome" value={outcome} />
      <SubmitButton pendingLabel="…" className={`rounded-lg border px-3 py-2 ${cls}`}>
        {label}
      </SubmitButton>
    </form>
  );
}
