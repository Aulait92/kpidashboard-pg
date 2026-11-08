import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import { getCurrentSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { sendReplyAction, toggleBotAction } from "./actions";
import { SubmitButton } from "./form-buttons";

export const dynamic = "force-dynamic";

export const metadata = { title: "WhatsApp-Inbox | KPI-Dashboard" };

const STATUS_TABS = [
  { key: "open", label: "Offen" },
  { key: "snoozed", label: "Zurückgestellt" },
  { key: "done", label: "Erledigt" },
] as const;

type SearchParams = Promise<{
  c?: string;
  tab?: string;
  q?: string;
  gcal?: string;
}>;

const BERLIN_TZ = "Europe/Berlin";
function formatApptDE(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BERLIN_TZ,
  }).format(d);
}

function initials(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "··";
}

function parseJson(body: string | null): Record<string, unknown> | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function AdminWhatsAppPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const sp = await searchParams;
  const tab = STATUS_TABS.some((t) => t.key === sp.tab) ? sp.tab! : "open";
  const q = (sp.q ?? "").trim();
  const activeId = sp.c ?? null;

  const conversations = await prisma.conversation.findMany({
    where: {
      status: tab,
      ...(q
        ? {
            OR: [
              { contactName: { contains: q, mode: "insensitive" as const } },
              { contactPhone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      contactPhone: true,
      contactName: true,
      botActive: true,
      lastMessageAt: true,
      customer: { select: { name: true } },
      messages: {
        where: { direction: { in: ["inbound", "outbound"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true },
      },
    },
  });

  const active = activeId
    ? await prisma.conversation.findUnique({
        where: { id: activeId },
        select: {
          id: true,
          customerId: true,
          contactPhone: true,
          contactName: true,
          contactEmail: true,
          botActive: true,
          status: true,
          windowExpiresAt: true,
          qualified: true,
          qualificationSummary: true,
          customer: { select: { name: true } },
          lead: { select: { source: true, status: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              direction: true,
              kind: true,
              body: true,
              sentBy: true,
              status: true,
              createdAt: true,
            },
          },
        },
      })
    : null;

  const appointment = active?.messages
    .filter((m) => m.direction === "internal" && m.kind === "appointment_proposal")
    .at(-1);
  const apptData = parseJson(appointment?.body ?? null);

  // Echte gebuchte Termine + Kalender-Verbindungsstatus für die aktive Konversation.
  const [appointments, googleConn] = active
    ? await Promise.all([
        prisma.appointment.findMany({
          where: { conversationId: active.id },
          orderBy: { startsAt: "desc" },
          take: 5,
          select: {
            id: true,
            mode: true,
            startsAt: true,
            meetUrl: true,
            status: true,
          },
        }),
        prisma.googleCalendarConnection.findUnique({
          where: { customerId: active.customerId },
          select: { status: true },
        }),
      ])
    : [[], null];
  const calConnected = googleConn?.status === "connected";

  const windowOpen =
    !!active?.windowExpiresAt && active.windowExpiresAt.getTime() > Date.now();

  const linkFor = (id: string) => `/admin/whatsapp?tab=${tab}&c=${id}`;

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        WhatsApp-Inbox
      </h1>
      <AdminTabs />

      {sp.gcal ? (
        <div
          className={`mt-4 rounded-lg px-4 py-2 text-sm ${
            sp.gcal === "connected"
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              : "bg-red-50 text-red-800 ring-1 ring-red-200"
          }`}
        >
          {sp.gcal === "connected"
            ? "✓ Google-Kalender erfolgreich verbunden."
            : sp.gcal === "denied"
              ? "Google-Verbindung abgebrochen."
              : "Google-Verbindung fehlgeschlagen — bitte erneut versuchen."}
        </div>
      ) : null}

      <div className="mt-6 flex h-[calc(100vh-200px)] min-h-[540px] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        {/* Spalte 1: Konversationsliste */}
        <aside className="flex w-[320px] flex-none flex-col border-r border-[color:var(--border)]">
          <div className="flex gap-1 p-3">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin/whatsapp?tab=${t.key}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  t.key === tab
                    ? "bg-[color:var(--foreground)] text-white"
                    : "bg-[color:var(--background)] text-[color:var(--muted)] hover:bg-[color:var(--brand-soft)]/40"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <form className="px-3 pb-2">
            <input type="hidden" name="tab" value={tab} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Suchen …"
              className="w-full rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </form>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {conversations.length === 0 ? (
              <div className="p-4 text-sm text-[color:var(--muted)]">
                Keine Konversationen.
              </div>
            ) : (
              conversations.map((c) => {
                const last = c.messages[0];
                const isActive = c.id === activeId;
                return (
                  <Link
                    key={c.id}
                    href={linkFor(c.id)}
                    className={`mb-1 flex gap-3 rounded-xl p-3 ${
                      isActive
                        ? "bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand)]/30"
                        : "hover:bg-[color:var(--background)]"
                    }`}
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
                      {initials(c.contactName ?? c.contactPhone)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {c.contactName ?? c.contactPhone}
                        </span>
                        <span className="shrink-0 text-[10px] text-[color:var(--muted)]">
                          {c.lastMessageAt ? formatDateTime(c.lastMessageAt) : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className="truncate text-[10px] text-[color:var(--muted)]">
                          {c.customer?.name ?? "—"}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            c.botActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {c.botActive ? "KI-Bot" : "Mensch"}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[color:var(--muted)]">
                        {last
                          ? `${last.direction === "outbound" ? "Du: " : ""}${last.body ?? ""}`
                          : ""}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* Spalte 2: Chat */}
        <section className="flex min-w-0 flex-1 flex-col bg-[color:var(--background)]">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-[color:var(--muted)]">
              Wähle links eine Konversation.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] bg-white px-5 py-3">
                <div>
                  <div className="font-bold">
                    {active.contactName ?? active.contactPhone}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">
                    WhatsApp · {active.contactPhone}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      active.botActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {active.botActive ? "KI-Bot aktiv" : "Mensch übernimmt"}
                  </span>
                  <form action={toggleBotAction}>
                    <input type="hidden" name="conversationId" value={active.id} />
                    <SubmitButton
                      pendingLabel="…"
                      className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:border-[color:var(--brand)]"
                    >
                      {active.botActive ? "Übernehmen" : "Bot aktivieren"}
                    </SubmitButton>
                  </form>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                {active.messages.map((m) => {
                  if (m.direction === "internal") {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-800 ring-1 ring-amber-200">
                          {m.kind === "qualification"
                            ? "Qualifizierung"
                            : m.kind === "appointment_proposal"
                              ? "Terminvorschlag"
                              : m.kind === "appointment_booked"
                                ? "📅 Termin gebucht"
                                : m.kind}
                        </span>
                      </div>
                    );
                  }
                  const outbound = m.direction === "outbound";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[72%]">
                        <div
                          className={`whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed ${
                            outbound
                              ? "rounded-[16px_4px_16px_16px] bg-[color:var(--brand)] text-white"
                              : "rounded-[4px_16px_16px_16px] border border-[color:var(--border)] bg-white"
                          }`}
                        >
                          {m.body}
                        </div>
                        <div
                          className={`mt-1 text-[10px] text-[color:var(--muted)] ${outbound ? "text-right" : ""}`}
                        >
                          {outbound && m.sentBy ? `${m.sentBy} · ` : ""}
                          {formatDateTime(m.createdAt)}
                          {outbound && m.status ? ` · ${m.status}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                action={sendReplyAction}
                className="border-t border-[color:var(--border)] bg-white px-4 py-3"
              >
                <input type="hidden" name="conversationId" value={active.id} />
                <textarea
                  name="body"
                  rows={2}
                  placeholder="Als Agent antworten …"
                  className="w-full resize-none rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-[color:var(--muted)]">
                    {windowOpen
                      ? `24h-Fenster offen bis ${formatDateTime(active.windowExpiresAt!)}`
                      : "24h-Fenster geschlossen — ggf. nur per Vorlage zustellbar"}
                  </span>
                  <SubmitButton
                    pendingLabel="Sendet …"
                    className="rounded-lg bg-[color:var(--brand)] px-5 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-dark)]"
                  >
                    Senden
                  </SubmitButton>
                </div>
              </form>
            </>
          )}
        </section>

        {/* Spalte 3: Lead-Kontext */}
        {active ? (
          <aside className="hidden w-[300px] flex-none flex-col overflow-y-auto border-l border-[color:var(--border)] bg-white p-5 lg:flex">
            <div className="flex flex-col items-center border-b border-[color:var(--border)] pb-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-lg font-bold text-[color:var(--brand-dark)]">
                {initials(active.contactName ?? active.contactPhone)}
              </div>
              <div className="mt-2 font-bold">
                {active.contactName ?? active.contactPhone}
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                {active.contactPhone}
              </div>
            </div>

            <div className="border-b border-[color:var(--border)] py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                Lead
              </div>
              <Row label="Kunde" value={active.customer?.name ?? "—"} />
              <Row label="Produkt" value={active.lead?.source ?? "—"} />
              <Row label="E-Mail" value={active.contactEmail ?? "—"} />
              <Row label="Status" value={active.lead?.status ?? active.status} />
            </div>

            <div className="border-b border-[color:var(--border)] py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                Qualifizierung
              </div>
              {active.qualificationSummary ? (
                <>
                  {active.qualified ? (
                    <span className="mb-1.5 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      ✓ qualifiziert
                    </span>
                  ) : null}
                  <p className="text-xs leading-relaxed text-[color:var(--foreground)]">
                    {active.qualificationSummary}
                  </p>
                </>
              ) : (
                <p className="text-xs text-[color:var(--muted)]">
                  Noch keine Angaben erfasst.
                </p>
              )}
            </div>

            <div className="py-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                Termine
              </div>

              {appointments.length > 0 ? (
                <ul className="mb-3 space-y-2">
                  {appointments.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">
                          {formatApptDE(a.startsAt)} Uhr
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            a.status === "booked"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {a.mode === "video" ? "Video" : "Telefon"}
                        </span>
                      </div>
                      {a.meetUrl ? (
                        <a
                          href={a.meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate text-[11px] font-medium text-[color:var(--brand)] hover:underline"
                        >
                          Meet-Link öffnen
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : apptData ? (
                <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
                  Terminwunsch: {String(apptData.modus ?? "")}
                  {apptData.wunschzeit ? ` · ${apptData.wunschzeit}` : ""}
                  <br />
                  <span className="text-[10px]">
                    (noch nicht gebucht — Kalender verbinden)
                  </span>
                </p>
              ) : (
                <p className="mb-3 text-xs text-[color:var(--muted)]">
                  Noch kein Termin.
                </p>
              )}

              {calConnected ? (
                <p className="text-[10px] text-emerald-700">
                  ✓ Google-Kalender verbunden — der Bot bucht automatisch.
                </p>
              ) : (
                <a
                  href={`/api/google/connect?customerId=${active.customerId}`}
                  className="block rounded-lg border border-[color:var(--brand)] py-1.5 text-center text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/40"
                >
                  Google-Kalender verbinden
                </a>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-xs">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span className="font-semibold text-[color:var(--foreground)]">{value}</span>
    </div>
  );
}
