import Link from "next/link";
import { ArrowLeft, Bot, CalendarClock, MessageCircle, Phone, SendHorizontal, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { LiveRefresh, StickToBottom } from "@/components/live-refresh";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass } from "@/components/ui";
import { chooseFollowup } from "@/lib/whatsapp/followup";
import { SubmitButton } from "@/components/submit-button";
import { getBuyerContext } from "@/lib/buyer-context";
import { appointmentScope, conversationScope } from "@/lib/team";
import { formatDateTime, formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { displayProduct, statusLabel, statusToneClass } from "@/lib/products";
import { hasWhatsAppInbox, showChatsTeaser } from "@/lib/whatsapp/access";
import { selfConnectEnabled } from "@/lib/whatsapp/dialog360-partner";
import {
  cancelAppointmentBuyerAction,
  followupBuyerAction,
  markChatDoneBuyerAction,
  sendReplyBuyerAction,
  toggleBotBuyerAction,
} from "../chat-actions";
import { nowMs } from "@/lib/now";

// WhatsApp-Chats im Kunden-CRM. Nur für Kunden mit WhatsApp-Assistent.
// Strikte Mandantentrennung: alle Abfragen mit customerId des Buyers.
export const dynamic = "force-dynamic";
export const metadata = { title: "Chats | performancegrowth" };

type SearchParams = Promise<{ c?: string; err?: string; f?: string; q?: string }>;

const ERRORS: Record<string, string> = {
  window:
    "Der Lead hat seit über 24 Stunden nicht geschrieben. WhatsApp erlaubt dann keine freie Nachricht. Bitte anrufen.",
  send: "Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen.",
  preview: "In der Vorschau sind Änderungen deaktiviert.",
  template:
    "Für diese Nachfass-Situation ist noch keine freigegebene WhatsApp-Vorlage hinterlegt.",
  followup_blocked: "Nachfassen ist in dieser Situation nicht sinnvoll, siehe Hinweis unten.",
};

const TZ = "Europe/Berlin";

/** Heute → „14:05", gestern → „Gestern", sonst „07.11.". */
function shortTime(d: Date): string {
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  const now = new Date();
  if (day(d) === day(now)) {
    return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  }
  if (day(d) === day(new Date(now.getTime() - 86400000))) return "Gestern";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d) + ".";
}
function formatAppt(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d);
}

function initials(s: string): string {
  return s.replace(/[^A-Za-zÄÖÜäöü0-9]/g, "").slice(0, 2).toUpperCase() || "··";
}

function parseFormAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) =>
    x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string"
      ? [{ label: x.label as string, value: x.value as string }]
      : [],
  );
}

const INTERNAL_LABELS: Record<string, string> = {
  qualification: "Qualifizierung aktualisiert",
  appointment_proposal: "Terminwunsch notiert",
  appointment_booked: "Termin gebucht",
  appointment_cancelled: "Termin abgesagt",
  appointment_rescheduled: "Termin verschoben",
  appointment_declined: "Einladung abgelehnt",
};

export default async function BuyerChatsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (!(await hasWhatsAppInbox(ctx.customerId))) {
    // Neue Oberfläche mit Software: „Chats“ schon vor dem Verbinden zeigen, mit Weg zum Verbinden.
    if (!(await showChatsTeaser(ctx.customerId))) redirect("/buyer/leads");
    const selfConnect = selfConnectEnabled() && ctx.teamRole === "owner";
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <PageHeader title="Chats" subtitle="WhatsApp-Gespräche mit Ihren Leads" />
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-center shadow-[var(--shadow-sm)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-soft,#eef3ff)] text-[color:var(--brand)]">
            <MessageCircle className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-base font-semibold">WhatsApp ist noch nicht verbunden</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[color:var(--muted)]">
            Sobald Ihre Nummer verbunden ist, schreibt Ihr Assistent jeden neuen Lead in wenigen Minuten an. Alle Gespräche
            sehen Sie hier – und können jederzeit selbst antworten.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {selfConnect ? (
              <Link href="/buyer/einrichtung?schritt=whatsapp#whatsapp" className={buttonClass("primary")}>
                WhatsApp verbinden
              </Link>
            ) : ctx.teamRole === "owner" ? (
              <Link href="/buyer/einrichtung" className={buttonClass("primary")}>
                Zur Einrichtung
              </Link>
            ) : null}
          </div>
          {!selfConnect ? (
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              {ctx.teamRole === "owner" ? "Wir verbinden WhatsApp gemeinsam mit Ihnen bei der Einrichtung." : "Die Verbindung richtet der Inhaber ein."}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const activeId = sp.c ?? null;
  const error = sp.err ? (ERRORS[sp.err] ?? null) : null;

  const filter = sp.f === "attention" ? "attention" : "all";
  const q = (sp.q ?? "").trim();
  const qDigits = q.replace(/\D/g, "");
  // Links in der Liste behalten Filter + Suche.
  const listQs = new URLSearchParams({
    ...(filter === "attention" ? { f: "attention" } : {}),
    ...(q ? { q } : {}),
  }).toString();
  const attentionTotal = await prisma.conversation.count({
    where: { ...conversationScope(ctx), needsAttention: true },
  });

  const conversations = await prisma.conversation.findMany({
    where: {
      ...conversationScope(ctx),
      ...(filter === "attention" ? { needsAttention: true } : {}),
      ...(q
        ? {
            OR: [
              { contactName: { contains: q, mode: "insensitive" as const } },
              { contactEmail: { contains: q, mode: "insensitive" as const } },
              ...(qDigits.length >= 3 ? [{ contactPhone: { contains: qDigits } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 150,
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      botActive: true,
      qualified: true,
      needsAttention: true,
      lastMessageAt: true,
      lead: { select: { status: true } },
      messages: {
        where: { direction: { in: ["inbound", "outbound"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true },
      },
    },
  });

  // Aktiven Chat NUR mit customerId laden (Mandantentrennung).
  const active = activeId
    ? await prisma.conversation.findFirst({
        where: { id: activeId, ...conversationScope(ctx) },
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          contactEmail: true,
          botActive: true,
          qualified: true,
          needsAttention: true,
          attentionReason: true,
          qualificationSummary: true,
          windowExpiresAt: true,
          lead: {
            select: { id: true, source: true, status: true, formData: true, createdAt: true },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, direction: true, kind: true, body: true, sentBy: true, createdAt: true },
          },
        },
      })
    : null;

  const appointments = active
    ? await prisma.appointment.findMany({
        where: {
          ...appointmentScope(ctx),
          status: "booked",
          OR: [
            { conversationId: active.id },
            ...(active.lead ? [{ leadId: active.lead.id }] : []),
          ],
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, mode: true, meetUrl: true, manageToken: true },
      })
    : [];
  const formAnswers = parseFormAnswers(active?.lead?.formData);
  const windowOpen =
    !!active?.windowExpiresAt && active.windowExpiresAt.getTime() > nowMs();
  const followup = active && !windowOpen ? await chooseFollowup(active.id) : null;

  const leadInfo = active ? (
    <div className="space-y-5 text-sm">
      <InfoSection title="Kontakt">
        <InfoRow label="Telefon">
          <a href={`tel:+${active.contactPhone}`} className="text-[color:var(--brand)] hover:underline">
            {formatPhone(active.contactPhone)}
          </a>
        </InfoRow>
        {active.contactEmail ? (
          <InfoRow label="E-Mail">
            <a href={`mailto:${active.contactEmail}`} className="break-all text-[color:var(--brand)] hover:underline">
              {active.contactEmail}
            </a>
          </InfoRow>
        ) : null}
      </InfoSection>

      {active.lead ? (
        <InfoSection title="Lead">
          {active.lead.source ? <InfoRow label="Produkt">{displayProduct(active.lead.source)}</InfoRow> : null}
          {active.lead.status ? (
            <InfoRow label="Status">{statusLabel(active.lead.status, true)}</InfoRow>
          ) : null}
          <InfoRow label="Eingang">{formatDateTime(active.lead.createdAt)}</InfoRow>
          <Link
            href={`/buyer/leads/${active.lead.id}`}
            className="mt-1 inline-block text-xs font-semibold text-[color:var(--brand)] hover:underline"
          >
            Lead öffnen →
          </Link>
        </InfoSection>
      ) : null}

      <InfoSection title="Termin">
        {appointments.length === 0 ? (
          <p className="text-xs text-[color:var(--muted)]">Kein Termin gebucht.</p>
        ) : (
          appointments.map((a) => (
            <div key={a.id} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                <CalendarClock className="h-4 w-4" /> {formatAppt(a.startsAt)} Uhr
              </div>
              <div className="mt-0.5 text-xs text-blue-800">
                {a.mode === "video" ? "Videocall" : "Telefonat, du rufst an"}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {a.meetUrl ? (
                  <a href={a.meetUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">
                    Video-Link
                  </a>
                ) : null}
                {a.manageToken ? (
                  <a
                    href={`/book/manage/${a.manageToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700 underline"
                  >
                    Verschieben
                  </a>
                ) : null}
                <form action={cancelAppointmentBuyerAction}>
                  <input type="hidden" name="appointmentId" value={a.id} />
                  <input type="hidden" name="conversationId" value={active.id} />
                  <SubmitButton pendingLabel="sagt ab …" className="font-medium text-rose-700 hover:underline">
                    Termin absagen
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))
        )}
      </InfoSection>

      {formAnswers.length > 0 ? (
        <InfoSection title="Leadformular">
          {formAnswers.map((a) => (
            <InfoRow key={a.label} label={a.label}>
              {a.value}
            </InfoRow>
          ))}
        </InfoSection>
      ) : null}

      {active.qualificationSummary ? (
        <InfoSection title={active.qualified ? "Qualifizierung" : "Bisher erfasst"}>
          <p className="text-sm leading-relaxed">{active.qualificationSummary}</p>
        </InfoSection>
      ) : null}
    </div>
  ) : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
      <LiveRefresh />
      <div className="hidden sm:block">
        <PageHeader
          title="Chats"
          subtitle="WhatsApp-Gespräche mit deinen Leads"
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {error}
        </div>
      ) : null}

      <div className="flex h-[calc(100dvh-56px-64px)] overflow-hidden border-[color:var(--border)] bg-white sm:h-[calc(100dvh-56px-140px)] sm:min-h-[520px] sm:rounded-2xl sm:border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]">
        {/* Liste — auf dem Handy ausgeblendet, sobald ein Chat offen ist */}
        <aside
          className={`${active ? "hidden md:flex" : "flex"} w-full flex-none flex-col border-r border-[color:var(--border)] md:w-[300px]`}
        >
          <div className="space-y-2 border-b border-[color:var(--border)] p-2">
            <div className="flex gap-1 text-xs font-semibold">
              <Link
                href={`/buyer/chats${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                className={`flex-1 rounded-lg px-2 py-1.5 text-center ${filter === "all" ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--muted)]"}`}
              >
                Alle
              </Link>
              <Link
                href={`/buyer/chats?f=attention${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`flex-1 rounded-lg px-2 py-1.5 text-center ${filter === "attention" ? "bg-rose-100 text-rose-800" : "text-[color:var(--muted)]"}`}
              >
                Braucht dich{attentionTotal > 0 ? ` (${attentionTotal})` : ""}
              </Link>
            </div>
            <form action="/buyer/chats" className="flex gap-1">
              {filter === "attention" ? <input type="hidden" name="f" value="attention" /> : null}
              <input
                name="q"
                defaultValue={q}
                placeholder="Name, Nummer oder E-Mail suchen"
                className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] px-2.5 py-1.5 text-xs focus:border-[color:var(--brand)] focus:outline-none"
              />
            </form>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-[color:var(--muted)]">Noch keine Chats.</p>
            ) : (
              conversations.map((c) => {
                const last = c.messages[0];
                const isActive = c.id === activeId;
                return (
                  <Link
                    key={c.id}
                    href={`/buyer/chats?c=${c.id}${listQs ? `&${listQs}` : ""}`}
                    className={`mb-0.5 flex gap-3 rounded-xl px-3 py-2.5 ${
                      isActive
                        ? "bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand)]/30"
                        : "hover:bg-[color:var(--background)]"
                    }`}
                  >
                    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[11px] font-bold text-[color:var(--brand-dark)]">
                      {initials(c.contactName ?? c.contactPhone)}
                      {c.needsAttention ? (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-rose-600" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${c.needsAttention ? "font-bold" : "font-semibold"}`}>
                          {c.contactName ?? formatPhone(c.contactPhone)}
                        </span>
                        <span className="shrink-0 text-[11px] text-[color:var(--muted)]">
                          {c.lastMessageAt ? shortTime(c.lastMessageAt) : ""}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[color:var(--muted)]">
                        {last ? `${last.direction === "outbound" ? (c.botActive ? "Assistent: " : "Du: ") : ""}${last.body ?? ""}` : ""}
                      </p>
                      <div className="mt-1 flex gap-1.5">
                        {c.needsAttention ? (
                          <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                            Braucht dich
                          </span>
                        ) : null}
                        {c.lead?.status ? (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusToneClass(c.lead.status)}`}>
                            {statusLabel(c.lead.status, true)}
                          </span>
                        ) : null}
                        {!c.botActive ? (
                          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                            Du schreibst
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat */}
        <section className={`${active ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[color:var(--background)]`}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-[color:var(--muted)]">
              <span className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="font-medium text-[color:var(--foreground)]">Wähle einen Chat aus</span>

              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-white px-3 py-2.5 sm:px-4">
                <Link href="/buyer/chats" aria-label="Zurück" className="-ml-1 rounded-full p-1.5 text-[color:var(--brand)] md:hidden">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{active.contactName ?? formatPhone(active.contactPhone)}</div>
                  <div className={`flex items-center gap-1 text-xs ${active.botActive ? "text-emerald-700" : "text-[color:var(--muted)]"}`}>
                    <Bot className="h-3.5 w-3.5" />
                    {active.botActive ? "Assistent antwortet" : "Du schreibst selbst"}
                  </div>
                </div>
                <a
                  href={`tel:+${active.contactPhone}`}
                  aria-label="Anrufen"
                  title={formatPhone(active.contactPhone)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]"
                >
                  <Phone className="h-4 w-4" />
                </a>
                {active.lead ? (
                  <Link
                    href={`/buyer/leads/${active.lead.id}`}
                    aria-label="Lead öffnen"
                    title="Lead öffnen"
                    className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--border-strong)]"
                  >
                    <UserRound className="h-4 w-4" />
                  </Link>
                ) : null}
                {/* Handy: Schreiben übernimmt automatisch; Knopf nur zum Zurückgeben an den Assistenten */}
                <form action={toggleBotBuyerAction} className={active.botActive ? "hidden sm:block" : ""}>
                  <input type="hidden" name="conversationId" value={active.id} />
                  <SubmitButton
                    pendingLabel="…"
                    className={`h-9 rounded-full px-3 text-xs font-semibold ${
                      active.botActive
                        ? "border border-[color:var(--border)] bg-white hover:border-[color:var(--brand)]"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {active.botActive ? "Selbst schreiben" : "Assistent an"}
                  </SubmitButton>
                </form>
              </div>

              {active.needsAttention ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
                  <span>
                    <b>Braucht dich:</b> {active.attentionReason ?? "Bitte melde dich beim Lead."}
                  </span>
                  <form action={markChatDoneBuyerAction}>
                    <input type="hidden" name="conversationId" value={active.id} />
                    <SubmitButton pendingLabel="…" className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800">
                      Erledigt
                    </SubmitButton>
                  </form>
                </div>
              ) : null}

              {/* Lead-Infos: unter xl als aufklappbarer Block, ab xl rechts */}
              <details className="border-b border-[color:var(--border)] bg-white xl:hidden">
                <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-[color:var(--brand)]">
                  {appointments.length > 0 ? `Termin ${formatAppt(appointments[0].startsAt)} Uhr · Infos` : "Infos zum Lead"}
                </summary>
                <div className="px-4 pb-4">{leadInfo}</div>
              </details>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {active.messages.map((m) => {
                  if (m.direction === "internal") {
                    const label = INTERNAL_LABELS[m.kind ?? ""];
                    return label ? (
                      <div key={m.id} className="flex justify-center">
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-800 ring-1 ring-amber-200">
                          {label}
                        </span>
                      </div>
                    ) : null;
                  }
                  const outbound = m.direction === "outbound";
                  const who =
                    m.sentBy === "agent"
                      ? "Du"
                      : m.sentBy === "app"
                        ? "Du (WhatsApp-App)"
                        : m.sentBy === "bot" || m.sentBy === "system"
                          ? "Assistent"
                          : "";
                  return (
                    <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[80%]">
                        <div
                          className={`whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed ${
                            outbound
                              ? "rounded-[16px_4px_16px_16px] bg-[color:var(--brand)] text-white"
                              : "rounded-[4px_16px_16px_16px] border border-[color:var(--border)] bg-white"
                          }`}
                        >
                          {m.body}
                        </div>
                        <div className={`mt-1 text-[10px] text-[color:var(--muted)] ${outbound ? "text-right" : ""}`}>
                          {outbound && who ? `${who} · ` : ""}
                          {formatDateTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <StickToBottom count={active.messages.length} chatId={active.id} />
              </div>

              {windowOpen ? (
                <form action={sendReplyBuyerAction} className="border-t border-[color:var(--border)] bg-white px-3 py-2.5">
                  <input type="hidden" name="conversationId" value={active.id} />
                  <div className="flex items-end gap-2">
                    <textarea
                      name="body"
                      rows={1}
                      required
                      placeholder="Nachricht schreiben"
                      className="max-h-40 min-h-[40px] flex-1 resize-none rounded-[20px] border border-[color:var(--border)] px-4 py-2.5 text-sm focus:border-[color:var(--brand)] focus:outline-none [field-sizing:content]"
                    />
                    <SubmitButton
                      pendingLabel="…"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)] disabled:opacity-50"
                    >
                      <SendHorizontal className="h-4 w-4" />
                    </SubmitButton>
                  </div>
                  {active.botActive ? (
                    <p className="mt-1 px-2 text-[11px] text-[color:var(--muted)]">Wenn du schreibst, pausiert der Assistent in diesem Chat.</p>
                  ) : null}
                </form>
              ) : (
                <div className="border-t border-[color:var(--border)] bg-white px-4 py-3">
                  <p className="text-xs text-[color:var(--muted)]">
                    Freies Schreiben geht erst wieder, wenn der Lead antwortet. Jetzt: anrufen oder nachfassen.
                  </p>
                  {followup?.kind === "blocked" ? (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">
                      {followup.reason}
                    </p>
                  ) : followup?.kind === "ok" ? (
                    <form action={followupBuyerAction} className="mt-2 space-y-2">
                      <input type="hidden" name="conversationId" value={active.id} />
                      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                          Vorschau · {followup.label}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{followup.preview}</p>
                      </div>
                      {followup.approved ? (
                        <div className="flex justify-end">
                          <SubmitButton pendingLabel="Sendet …" className={buttonClass("primary", "md")}>
                            Nachfassen senden
                          </SubmitButton>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-700">Nachfassen ist noch nicht freigeschaltet. Bis dahin: anrufen.</p>
                      )}
                    </form>
                  ) : null}
                </div>
              )}
            </>
          )}
        </section>

        {active ? (
          <aside className="hidden w-[300px] flex-none overflow-y-auto border-l border-[color:var(--border)] bg-white p-4 xl:block">
            {leadInfo}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-[color:var(--muted)]">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
