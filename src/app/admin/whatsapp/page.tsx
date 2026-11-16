import { splitHealthAnswers } from "@/lib/gesundheitsdaten";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Mail,
  Phone,
  Smartphone,
  TriangleAlert,
  UserRound,
  Video,
} from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { formatDateTime, formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { displayProduct, statusLabel, statusToneClass } from "@/lib/products";
import { loadTeamCalendars } from "@/lib/calendar/team";
import { chooseFollowup, followupOptions } from "@/lib/whatsapp/followup";
import { qualificationPoints } from "@/lib/whatsapp/qualification";
import { firstNameOf, PURPOSE_LABELS, PURPOSE_PARAMS, renderTemplate, type NoticePurpose } from "@/lib/whatsapp/templates";
import { toggleBotAction } from "./actions";
import { AdminRescheduleButton, ChatComposer, type Snippet } from "./chat-client";
import { SupportAssign } from "./support-assign";
import { isSupportCustomer } from "@/lib/whatsapp/support-inbox";
import { refreshSupportLinks, SUPPORT_BADGE_SELECT, SUPPORT_KINDS, supportBadge, supportKindWhere, type SupportBadge, type SupportKind } from "@/lib/whatsapp/support-contacts";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { nowMs } from "@/lib/now";

export const dynamic = "force-dynamic";

export const metadata = { title: "Chats | performancegrowth Admin" };

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
  /** Support-Nummer: support | kunde | interessent | unbekannt */
  art?: string;
}>;

const ART_FILTERS: { key: SupportKind | "support" | ""; label: string }[] = [{ key: "", label: "Alle" }, { key: "support", label: "Support-Nummer" }, ...SUPPORT_KINDS];

const BADGE_TONE: Record<SupportKind, string> = {
  kunde: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  interessent: "bg-sky-50 text-sky-800 ring-sky-200",
  unbekannt: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

function SupportBadgeChip({ badge }: { badge: SupportBadge }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-xs font-medium ring-1 ring-inset ${BADGE_TONE[badge.kind]}`} data-support-kind={badge.kind}>{badge.label}</span>;
}

const TZ = "Europe/Berlin";
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const clock = (d: Date) => fmt(d, { hour: "2-digit", minute: "2-digit" });

/** Datumstrenner im Verlauf: „Heute“, „Gestern“, „Fr., 13.11.“. */
function dayLabel(d: Date, now: number): string {
  const k = dayKey(d);
  if (k === dayKey(new Date(now))) return "Heute";
  if (k === dayKey(new Date(now - 86_400_000))) return "Gestern";
  const sameYear = k.slice(0, 4) === dayKey(new Date(now)).slice(0, 4);
  return fmt(d, { weekday: "short", day: "2-digit", month: "2-digit", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Chatliste: heute Uhrzeit, gestern „Gestern“, sonst Datum. */
function shortTime(d: Date, now: number): string {
  const k = dayKey(d);
  if (k === dayKey(new Date(now))) return clock(d);
  if (k === dayKey(new Date(now - 86_400_000))) return "Gestern";
  return fmt(d, { day: "2-digit", month: "2-digit" }) + ".";
}

function initials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : s.replace(/[^A-Za-zÄÖÜäöü0-9]/g, "").slice(0, 2);
  return letters.toUpperCase() || "··";
}

function parseJson(body: string | null): Record<string, unknown> | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseFormAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) =>
    x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label as string, value: x.value as string }] : [],
  );
}

const INTERNAL: Record<string, { label: string; icon: typeof Bot }> = {
  qualification: { label: "Qualifizierung aktualisiert", icon: ClipboardCheck },
  appointment_proposal: { label: "Terminwunsch notiert", icon: CalendarClock },
  appointment_booked: { label: "Termin gebucht", icon: CalendarCheck },
  appointment_cancelled: { label: "Termin abgesagt", icon: CalendarX },
  appointment_rescheduled: { label: "Termin verschoben", icon: CalendarClock },
  appointment_declined: { label: "Einladung abgelehnt", icon: CalendarX },
  handover: { label: "An den Berater übergeben", icon: UserRound },
  erneut_eingetragen: { label: "Hat sich erneut eingetragen", icon: UserRound },
};

/** Absender ausgehender Nachrichten als kleines Etikett. */
function senderOf(sentBy: string | null, kind: string): { label: string; icon: typeof Bot } | null {
  if (sentBy === "bot") return { label: "KI-Bot", icon: Bot };
  if (sentBy === "agent") return { label: "Agent", icon: UserRound };
  if (sentBy === "app") return { label: "WhatsApp-App", icon: Smartphone };
  if (sentBy === "system") return { label: kind === "template" ? "Vorlage" : "System", icon: FileText };
  return null;
}

/** Häkchen wie bei WhatsApp: gesendet, zugestellt, gelesen (fehlgeschlagen rot). */
function DeliveryStatus({ status }: { status: string | null }) {
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-700" title="Nicht zugestellt">
        <AlertCircle className="h-3.5 w-3.5" /> nicht zugestellt
      </span>
    );
  }
  if (status === "read") return <CheckCheck className="h-4 w-4 text-sky-600" aria-label="Gelesen" />;
  if (status === "delivered") return <CheckCheck className="h-4 w-4" aria-label="Zugestellt" />;
  if (status === "sent") return <Check className="h-4 w-4" aria-label="Gesendet" />;
  return null;
}

export default async function AdminWhatsAppPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const sp = await searchParams;
  const tab = STATUS_TABS.some((t) => t.key === sp.tab) ? sp.tab! : "open";
  const q = (sp.q ?? "").trim();
  const qDigits = q.replace(/\D/g, "");
  const activeId = sp.c ?? null;
  const now = nowMs();
  const art = ART_FILTERS.some((f) => f.key && f.key === sp.art) ? (sp.art as SupportKind | "support") : null;
  // Support-Chats ohne frische Zuordnung über die Telefonnummer nachziehen (Kunde/Interessent)
  await refreshSupportLinks(new Date(now)).catch(() => 0);

  const conversations = await prisma.conversation.findMany({
    where: {
      status: tab,
      ...(art ? { AND: [supportKindWhere(art)] } : {}),
      ...(q
        ? {
            OR: [
              { contactName: { contains: q, mode: "insensitive" as const } },
              { contactPhone: { contains: qDigits.length >= 3 ? qDigits : q } },
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
      needsAttention: true,
      lastMessageAt: true,
      customerId: true,
      customer: { select: { name: true } },
      ...SUPPORT_BADGE_SELECT,
      messages: {
        where: { direction: { in: ["inbound", "outbound"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true },
      },
    },
  });

  const active = activeId ? await prisma.conversation.findUnique({ where: { id: activeId }, select: ACTIVE_SELECT }) : null;

  const artQs = art ? `&art=${art}` : "";
  const linkFor = (id: string) => `/admin/whatsapp?tab=${tab}&c=${id}${artQs}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6">
      {/* Chats sind seit 16.11.2026 ein eigener Bereich in der Leiste (vorher Leads → WhatsApp-Chats) */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
        <Link href="/admin/whatsapp/settings" className="inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--brand)] hover:underline">
          Einstellungen →
        </Link>
      </div>

      {sp.gcal ? (
        <div
          className={`mt-4 rounded-lg px-4 py-2 text-sm ${
            sp.gcal === "connected" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-red-50 text-red-800 ring-1 ring-red-200"
          }`}
        >
          {sp.gcal === "connected"
            ? "✓ Kalender erfolgreich verbunden."
            : sp.gcal === "denied"
              ? "Kalender-Verbindung abgebrochen."
              : sp.gcal === "consent"
                ? "Microsoft verlangt eine Administrator-Freigabe: Die IT des Kunden muss die App im Firmen-Tenant einmalig genehmigen."
                : "Kalender-Verbindung fehlgeschlagen, bitte erneut versuchen."}
        </div>
      ) : null}

      <div className="mt-6 flex h-[calc(100dvh-250px)] min-h-[460px] overflow-hidden md:h-[calc(100dvh-160px)] md:min-h-[540px] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]">
        {/* Spalte 1: Konversationsliste (Handy: ausgeblendet, sobald ein Chat offen ist) */}
        <aside className={cn(active ? "hidden md:flex" : "flex", "w-full flex-none flex-col border-r border-[color:var(--border)] md:w-[300px] xl:w-[320px]")}>
          <div className="flex gap-1 p-3 pb-2">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin/whatsapp?tab=${t.key}${artQs}`}
                className={`inline-flex h-10 items-center rounded-full px-3 text-[13px] font-semibold md:h-8 md:text-xs ${
                  t.key === tab
                    ? "bg-[color:var(--foreground)] text-white"
                    : "bg-[color:var(--background)] text-[color:var(--muted)] hover:bg-[color:var(--brand-soft)]/40"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" data-art-filter>
            {ART_FILTERS.map((f) => (
              <Link
                key={f.key || "alle"}
                href={`/admin/whatsapp?tab=${tab}${f.key ? `&art=${f.key}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`inline-flex h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-medium ring-1 ring-inset md:h-7 md:px-2.5 md:text-xs ${
                  (art ?? "") === f.key ? "bg-[color:var(--brand)] text-white ring-[color:var(--brand)]" : "text-[color:var(--muted)] ring-[color:var(--border)] hover:bg-[color:var(--brand-soft)]/40"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <form className="px-3 pb-2">
            <input type="hidden" name="tab" value={tab} />
            {art ? <input type="hidden" name="art" value={art} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="Name oder Nummer suchen"
              type="search"
              className="h-10 w-full rounded-lg border border-[color:var(--border)] px-3 text-base focus:border-[color:var(--brand)] focus:outline-none md:h-9 md:text-sm"
            />
          </form>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {conversations.length === 0 ? (
              <div className="p-4 text-sm text-[color:var(--muted)]">
                {q ? `Kein Chat zu „${q}“.` : tab === "open" ? "Keine offenen Chats. Neue Nachrichten erscheinen hier sofort." : "Keine Chats in dieser Liste."}
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
                      isActive ? "bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand)]/30" : "hover:bg-[color:var(--background)]"
                    }`}
                  >
                    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
                      {initials(c.contactName ?? c.contactPhone)}
                      {c.needsAttention ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-rose-600" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.contactName ?? formatPhone(c.contactPhone)}</span>
                        <span className="shrink-0 text-xs text-[color:var(--muted)]">{c.lastMessageAt ? shortTime(c.lastMessageAt, now) : ""}</span>
                      </div>
                      <div className="flex items-center gap-1.5 py-0.5">
                        {isSupportCustomer(c.customerId) ? (
                          <SupportBadgeChip badge={supportBadge(c)} />
                        ) : (
                          <span className="truncate text-xs text-[color:var(--muted)]">{c.customer?.name ?? "Ohne Kunde"}</span>
                        )}
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-xs font-medium ${
                            c.botActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {c.botActive ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                          {c.botActive ? "KI-Bot" : "Mensch"}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[color:var(--muted)]">
                        {last ? `${last.direction === "outbound" ? "Du: " : ""}${last.body ?? ""}` : ""}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* Spalte 2: Chat */}
        <section className={cn(active ? "flex" : "hidden md:flex", "min-w-0 flex-1 flex-col bg-[color:var(--background)]")}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-[color:var(--muted)]">Wähle links eine Konversation.</div>
          ) : (
            <ActiveChat active={active} now={now} backHref={`/admin/whatsapp?tab=${tab}${artQs}${q ? `&q=${encodeURIComponent(q)}` : ""}`} />
          )}
        </section>

        {/* Spalte 3: Lead-Kontext (ab lg rechts, darunter als aufklappbares Panel im Chat) */}
        {active ? (
          <aside className="hidden w-[320px] flex-none overflow-y-auto border-l border-[color:var(--border)] bg-white lg:block" data-lead-panel="desktop">
            <LeadPanel active={active} now={now} />
          </aside>
        ) : null}
      </div>
    </main>
  );
}

const ACTIVE_SELECT = {
  id: true,
  customerId: true,
  leadId: true,
  contactPhone: true,
  contactName: true,
  contactEmail: true,
  botActive: true,
  needsAttention: true,
  attentionReason: true,
  windowExpiresAt: true,
  qualified: true,
  qualificationSummary: true,
  qualificationData: true,
  contactLinkManual: true,
  ...SUPPORT_BADGE_SELECT,
  customer: { select: { id: true, name: true } },
  lead: { select: { id: true, source: true, status: true, formData: true, email: true, createdAt: true } },
  messages: {
    orderBy: { createdAt: "asc" },
    select: { id: true, direction: true, kind: true, body: true, sentBy: true, status: true, createdAt: true },
  },
} satisfies Prisma.ConversationSelect;

type Active = Prisma.ConversationGetPayload<{ select: typeof ACTIVE_SELECT }>;

async function ActiveChat({ active, now, backHref }: { active: Active; now: number; backHref: string }) {
  const windowOpen = !!active.windowExpiresAt && active.windowExpiresAt.getTime() > now;

  // Eingabeleiste: Textbausteine aus den WhatsApp-Vorlagen des Kunden (offenes
  // Fenster) bzw. freigegebene Nachfass-Vorlagen (geschlossenes Fenster).
  const [templates, situation, options, nextAppt] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { customerId: active.customerId, status: { in: ["approved", "pending"] } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: { name: true, purpose: true, body: true },
    }),
    windowOpen ? null : chooseFollowup(active.id),
    followupOptions(active.id),
    prisma.appointment.findFirst({
      where: { status: "booked", startsAt: { gt: new Date(now) }, OR: [{ conversationId: active.id }, ...(active.leadId ? [{ leadId: active.leadId }] : [])] },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
  ]);
  const first = firstNameOf(active.contactName);
  const seen = new Set<string>();
  const snippets: Snippet[] = [];
  for (const t of templates) {
    const key = t.purpose || t.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const extra = (PURPOSE_PARAMS[t.purpose as NoticePurpose] ?? []).slice(1).map((p) => `[${p}]`);
    snippets.push({ label: PURPOSE_LABELS[t.purpose as NoticePurpose] ?? t.name, text: renderTemplate(t.body, [first, ...extra]) });
  }
  if (snippets.length === 0) for (const o of options) snippets.push({ label: o.label, text: o.preview });

  // Verlauf mit Datumstrennern
  let lastDay = "";
  const items: React.ReactNode[] = [];
  for (const m of active.messages) {
    const k = dayKey(m.createdAt);
    if (k !== lastDay) {
      lastDay = k;
      items.push(
        <div key={`d:${k}`} className="sticky top-0 z-10 flex justify-center py-1" data-day-separator>
          <span className="rounded-full bg-white/95 px-3 py-0.5 text-xs font-medium text-[color:var(--muted)] shadow-[var(--shadow-sm)] ring-1 ring-[color:var(--border)]">
            {dayLabel(m.createdAt, now)}
          </span>
        </div>,
      );
    }
    if (m.direction === "internal") {
      const info = INTERNAL[m.kind];
      const Icon = info?.icon ?? ClipboardCheck;
      items.push(
        <div key={m.id} className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
            <Icon className="h-3.5 w-3.5" />
            {info?.label ?? m.kind} · {clock(m.createdAt)}
          </span>
        </div>,
      );
      continue;
    }
    const outbound = m.direction === "outbound";
    const sender = outbound ? senderOf(m.sentBy, m.kind) : null;
    items.push(
      <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[80%] sm:max-w-[72%]">
          <div
            className={`whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed ${
              outbound
                ? "rounded-[16px_4px_16px_16px] bg-[color:var(--brand)] text-white"
                : "rounded-[4px_16px_16px_16px] border border-[color:var(--border)] bg-white"
            }`}
          >
            {m.body}
          </div>
          <div className={`mt-1 flex items-center gap-1.5 text-xs text-[color:var(--muted)] ${outbound ? "justify-end" : ""}`} data-message-meta>
            {sender ? (
              <span className="inline-flex items-center gap-1" title={`Gesendet von: ${sender.label}`}>
                <sender.icon className="h-3.5 w-3.5" />
                {sender.label}
              </span>
            ) : null}
            <time dateTime={m.createdAt.toISOString()} title={formatDateTime(m.createdAt)}>
              {clock(m.createdAt)}
            </time>
            {outbound ? <DeliveryStatus status={m.status} /> : null}
          </div>
        </div>
      </div>,
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-[color:var(--border)] bg-white px-3 py-3 sm:px-5">
        <Link href={backHref} aria-label="Zurück zur Liste" className="-ml-1 rounded-full p-1.5 text-[color:var(--brand)] md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{active.contactName ?? formatPhone(active.contactPhone)}</div>
          <div className="truncate text-xs text-[color:var(--muted)]">
            WhatsApp · {formatPhone(active.contactPhone)}
            {active.customer ? ` · ${active.customer.name}` : ""}
          </div>
        </div>
        <span
          className={`hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-flex ${
            active.botActive ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200"
          }`}
        >
          {active.botActive ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
          {active.botActive ? "KI-Bot aktiv" : "Mensch übernimmt"}
        </span>
        {/* Handy: Übernehmen steht über der Eingabeleiste, hier nur „Bot aktivieren“ */}
        <form action={toggleBotAction} className={active.botActive ? "hidden sm:block" : ""}>
          <input type="hidden" name="conversationId" value={active.id} />
          <SubmitButton pendingLabel="…" className={buttonClass("secondary", "sm")}>
            {active.botActive ? "Übernehmen" : "Bot aktivieren"}
          </SubmitButton>
        </form>
      </div>

      {active.needsAttention ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
          <b>Braucht Aufmerksamkeit:</b> {active.attentionReason ?? "Bitte beim Lead melden."}
        </div>
      ) : null}

      {/* Lead-Infos unter lg als aufklappbares Panel (gleiche Inhalte wie rechts) */}
      <details className="group/panel border-b border-[color:var(--border)] bg-white lg:hidden" data-lead-panel="mobile">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 truncate">
            Infos zum Lead
            {nextAppt ? (
              <span className="font-normal text-[color:var(--muted)]">
                {" "}
                · Termin {fmt(nextAppt.startsAt, { weekday: "short", day: "2-digit", month: "2-digit" })}, {clock(nextAppt.startsAt)} Uhr
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 transition group-open/panel:rotate-180" />
        </summary>
        <div className="max-h-[60dvh] overflow-y-auto border-t border-[color:var(--border)]">
          <LeadPanel active={active} now={now} />
        </div>
      </details>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6" data-messages>
        {items}
      </div>

      <ChatComposer
        key={active.id}
        conversationId={active.id}
        botActive={active.botActive}
        windowExpiresAt={active.windowExpiresAt?.getTime() ?? null}
        snippets={snippets}
        templates={options.map((o) => ({ purpose: o.key, label: o.label, preview: o.preview, approved: o.approved }))}
        suggestedPurpose={situation?.kind === "ok" ? (situation.purpose === "followup_nudge" ? "followup" : situation.purpose) : null}
        blockedReason={situation?.kind === "blocked" ? situation.reason : null}
      />
    </>
  );
}

// ─── Seitenleiste: Lead-Kontext ────────────────────────────────────────

const SECTION = "border-t border-[color:var(--border)] px-5 py-4";
const SECTION_TITLE = "mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]";
const CLOSED_STATUSES = new Set(["kein interesse", "disqualifiziert"]);

async function LeadPanel({ active, now }: { active: Active; now: number }) {
  const [appointments, team] = await Promise.all([
    prisma.appointment.findMany({
      where: { OR: [{ conversationId: active.id }, ...(active.leadId ? [{ leadId: active.leadId }] : [])] },
      orderBy: { startsAt: "desc" },
      take: 6,
      select: { id: true, mode: true, startsAt: true, endsAt: true, meetUrl: true, status: true },
    }),
    loadTeamCalendars(active.customerId),
  ]);
  const upcoming = appointments
    .filter((a) => a.status === "booked" && a.startsAt.getTime() > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const earlier = appointments.filter((a) => !upcoming.includes(a));
  const proposal = active.messages.filter((m) => m.direction === "internal" && m.kind === "appointment_proposal").at(-1);
  const proposalData = parseJson(proposal?.body ?? null);

  const name = active.contactName ?? formatPhone(active.contactPhone);
  const email = active.contactEmail ?? active.lead?.email ?? null;
  const status = active.lead?.status ?? null;
  // Gesundheitsangaben nur im Kontakt des Vermittlers (lib/gesundheitsdaten.ts)
  const formAnswers = splitHealthAnswers(parseFormAnswers(active.lead?.formData)).normal;
  const points = qualificationPoints(active.qualificationData);
  // Admin-Link ins CRM: Lead in der Admin-Leadliste (gefiltert), sonst die Kundenakte.
  const crmHref = active.lead
    ? `/admin/leads?kunde=${active.customerId}&q=${encodeURIComponent(active.contactPhone)}`
    : `/admin/kunden/${active.customerId}`;
  const statusConflict = !!status && CLOSED_STATUSES.has(status.trim().toLowerCase()) && upcoming.length > 0;

  return (
    <div className="text-sm">
      {/* Kopf */}
      <div className="flex flex-col items-center px-5 pb-4 pt-5 text-center" data-lead-head>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-lg font-bold text-[color:var(--brand-dark)]">
          {initials(active.contactName ?? active.contactPhone)}
        </div>
        <div className="mt-2 text-base font-semibold">{name}</div>
        <div className="text-sm text-[color:var(--muted)] tabular-nums">{formatPhone(active.contactPhone)}</div>
        {status ? (
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusToneClass(status)}`} data-lead-status>
            {statusLabel(status, true)}
          </span>
        ) : (
          <span className="mt-2 text-xs text-[color:var(--muted)]">Kein Lead verknüpft</span>
        )}
        {statusConflict ? (
          <p className="mt-2 rounded-[var(--radius-sm)] bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
            Es ist noch ein Termin gebucht. Status bitte im CRM prüfen.
          </p>
        ) : null}
        <div className="mt-3 grid w-full grid-cols-3 gap-2">
          <a href={`tel:+${active.contactPhone}`} className={buttonClass("secondary", "sm", "h-auto flex-col gap-1 py-2")}>
            <Phone className="h-4 w-4" />
            Anrufen
          </a>
          {email ? (
            <a href={`mailto:${email}`} className={buttonClass("secondary", "sm", "h-auto flex-col gap-1 py-2")}>
              <Mail className="h-4 w-4" />
              E-Mail
            </a>
          ) : (
            <span className={buttonClass("secondary", "sm", "pointer-events-none h-auto flex-col gap-1 py-2 opacity-50")} title="Keine E-Mail-Adresse bekannt">
              <Mail className="h-4 w-4" />
              E-Mail
            </span>
          )}
          <Link href={crmHref} className={buttonClass("secondary", "sm", "h-auto flex-col gap-1 py-2")}>
            <ExternalLink className="h-4 w-4" />
            Im CRM
          </Link>
        </div>
      </div>

      {isSupportCustomer(active.customerId) ? <SupportWho active={active} /> : null}

      {!team.anyConnected && !isSupportCustomer(active.customerId) ? (
        <div className="px-5 pb-4">
          <Link
            href={`/admin/kunden/${active.customerId}/whatsapp#kalender`}
            className="flex items-start gap-2 rounded-[var(--radius-md)] bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
            data-calendar-warning
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Bot kann keine Termine buchen, <span className="font-semibold underline">Kalender verbinden</span>
            </span>
          </Link>
        </div>
      ) : null}

      {/* Lead-Angaben */}
      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>Lead</h3>
        <dl className="space-y-2">
          <Row label="Kunde">
            <Link href={`/admin/kunden/${active.customerId}`} className="hover:underline">
              {active.customer?.name ?? "Ohne Kunde"}
            </Link>
          </Row>
          <Row label="Produkt">{active.lead?.source ? displayProduct(active.lead.source) : "Nicht bekannt"}</Row>
          <Row label="E-Mail">{email ? <span className="break-all">{email}</span> : <span className="text-[color:var(--muted)]">Nicht bekannt</span>}</Row>
          {active.lead ? <Row label="Eingang">{formatDateTime(active.lead.createdAt)}</Row> : null}
        </dl>
        {formAnswers.length > 0 ? (
          <>
            <h4 className="mb-2 mt-4 text-xs font-medium text-[color:var(--muted)]">Aus dem Leadformular</h4>
            <dl className="space-y-2">
              {formAnswers.map((a) => (
                <Row key={a.label} label={a.label}>
                  {a.value}
                </Row>
              ))}
            </dl>
          </>
        ) : null}
      </section>

      {/* Qualifizierung */}
      <section className={SECTION} data-qualification>
        <h3 className={SECTION_TITLE}>
          Qualifizierung
          {active.qualified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-px text-xs font-medium normal-case tracking-normal text-emerald-700 ring-1 ring-emerald-200">
              <Check className="h-3 w-3" /> qualifiziert
            </span>
          ) : null}
        </h3>
        {points.length > 0 ? (
          <>
            <dl className="space-y-2" data-qualification-points>
              {points.map((p) => (
                <Row key={p.key} label={p.label}>
                  {p.value}
                </Row>
              ))}
            </dl>
            {active.qualificationSummary ? (
              <details className="group/sum mt-3">
                <summary className="cursor-pointer list-none text-xs font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
                  <span className="group-open/sum:hidden">Zusammenfassung des Bots anzeigen</span>
                  <span className="hidden group-open/sum:inline">Zusammenfassung ausblenden</span>
                </summary>
                <p className="mt-2 leading-relaxed text-[color:var(--muted)]">{active.qualificationSummary}</p>
              </details>
            ) : null}
          </>
        ) : active.qualificationSummary ? (
          // Altfälle ohne strukturierte Punkte: Fließtext, gekürzt und aufklappbar.
          <details className="group/sum" data-qualification-legacy>
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <p className="line-clamp-3 leading-relaxed group-open/sum:line-clamp-none">{active.qualificationSummary}</p>
              <span className="mt-1 inline-block text-xs font-medium text-[color:var(--brand)] group-open/sum:hidden">Ganzen Text anzeigen</span>
            </summary>
          </details>
        ) : (
          <p className="text-[color:var(--muted)]">Noch keine Angaben erfasst.</p>
        )}
      </section>

      {/* Termine */}
      <section className={SECTION} data-appointments>
        <h3 className={SECTION_TITLE}>Termine</h3>
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a.id} a={a} />
            ))}
          </div>
        ) : proposalData ? (
          <p className="rounded-[var(--radius-md)] bg-amber-50 px-3 py-2.5 text-amber-900 ring-1 ring-amber-200">
            Terminwunsch: {proposalData.modus === "video" ? "Videocall" : proposalData.modus === "phone" ? "Telefon" : String(proposalData.modus ?? "")}
            {proposalData.wunschzeit ? `, ${String(proposalData.wunschzeit)}` : ""}
            <span className="mt-0.5 block text-xs">Noch nicht gebucht.</span>
          </p>
        ) : (
          <p className="text-[color:var(--muted)]">Kein Termin geplant.</p>
        )}
        {earlier.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-[color:var(--muted)]">
            {earlier.map((a) => (
              <li key={a.id}>
                {fmt(a.startsAt, { weekday: "short", day: "2-digit", month: "2-digit" })}, {clock(a.startsAt)} Uhr ·{" "}
                {a.status === "cancelled" ? "abgesagt" : a.status === "no_show" ? "nicht erschienen" : a.status === "completed" ? "stattgefunden" : "vorbei"}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function AppointmentCard({ a }: { a: { id: string; mode: string; startsAt: Date; endsAt: Date | null; meetUrl: string | null } }) {
  const video = a.mode === "video";
  const ModeIcon = video ? Video : Phone;
  const minutes = a.endsAt ? Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000) : null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3" data-appointment-card>
      <div className="flex items-center gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white py-1.5">
          <span className="text-xs font-semibold uppercase text-[color:var(--brand)]">{fmt(a.startsAt, { month: "short" }).replace(".", "")}</span>
          <span className="text-2xl font-semibold leading-none tabular-nums">{fmt(a.startsAt, { day: "numeric" })}</span>
        </div>
        <div className="min-w-0">
          <div className="font-semibold">
            {fmt(a.startsAt, { weekday: "long" })}, {clock(a.startsAt)} Uhr
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[color:var(--muted)]">
            <ModeIcon className="h-4 w-4" />
            {video ? "Videocall" : "Telefon"}
            {minutes ? ` · ${minutes} Min.` : ""}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {video && a.meetUrl ? (
          <a href={a.meetUrl} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>
            <Video className="h-3.5 w-3.5" />
            Video-Link öffnen
          </a>
        ) : null}
        <AdminRescheduleButton appointmentId={a.id} className={buttonClass("secondary", "sm")}>
          Verschieben
        </AdminRescheduleButton>
        <AdminRescheduleButton appointmentId={a.id} initialStep="cancel" className={buttonClass("ghost", "sm")}>
          Absagen
        </AdminRescheduleButton>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_1fr] gap-3">
      <dt className="min-w-0 hyphens-auto break-words text-[color:var(--muted)]" lang="de">
        {label}
      </dt>
      <dd className="min-w-0 break-words font-medium text-[color:var(--foreground)]">{children}</dd>
    </div>
  );
}

/** Support-Nummer: Wer ist das? Kunde, Interessent oder unbekannt, mit Link und Zuordnen. */
function SupportWho({ active }: { active: Active }) {
  const badge = supportBadge(active);
  return (
    <section className={SECTION} data-support-who>
      <h3 className={SECTION_TITLE}>Wer schreibt?</h3>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SupportBadgeChip badge={badge} />
        {badge.detail ? (
          badge.href ? (
            <Link href={badge.href} className="text-sm font-medium hover:underline">
              {badge.detail}
            </Link>
          ) : (
            <span className="text-sm">{badge.detail}</span>
          )
        ) : (
          <span className="text-sm text-[color:var(--muted)]">Nummer bei keinem Vertriebskontakt hinterlegt</span>
        )}
        {active.contactLinkManual ? <span className="text-xs text-[color:var(--muted)]">(von Hand)</span> : null}
      </div>
      <SupportAssign conversationId={active.id} manual={active.contactLinkManual} linked={badge.kind !== "unbekannt"} />
    </section>
  );
}
