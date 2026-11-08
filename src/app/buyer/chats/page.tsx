import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerTabs } from "@/components/buyer-tabs";
import { SubmitButton } from "@/components/submit-button";
import { getBuyerContext } from "@/lib/buyer-context";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { displayProduct } from "@/lib/products";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import {
  cancelAppointmentBuyerAction,
  sendReplyBuyerAction,
  toggleBotBuyerAction,
} from "../chat-actions";

// WhatsApp-Chats im Kunden-CRM. Nur für Kunden mit WhatsApp-Assistent.
// Strikte Mandantentrennung: alle Abfragen mit customerId des Buyers.
export const dynamic = "force-dynamic";
export const metadata = { title: "Chats | performancegrowth" };

type SearchParams = Promise<{ c?: string; err?: string }>;

const ERRORS: Record<string, string> = {
  window:
    "Der Lead hat seit über 24 Stunden nicht geschrieben – WhatsApp erlaubt dann keine freie Nachricht. Bitte anrufen.",
  send: "Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen.",
  preview: "In der Vorschau sind Änderungen deaktiviert.",
};

const TZ = "Europe/Berlin";
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
  appointment_booked: "📅 Termin gebucht",
};

export default async function BuyerChatsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (!(await hasWhatsAppInbox(ctx.customerId))) redirect("/buyer/leads");

  const sp = await searchParams;
  const activeId = sp.c ?? null;
  const error = sp.err ? (ERRORS[sp.err] ?? null) : null;

  const conversations = await prisma.conversation.findMany({
    where: { customerId: ctx.customerId },
    orderBy: { lastMessageAt: "desc" },
    take: 150,
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      botActive: true,
      qualified: true,
      lastMessageAt: true,
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
        where: { id: activeId, customerId: ctx.customerId },
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          contactEmail: true,
          botActive: true,
          qualified: true,
          qualificationSummary: true,
          windowExpiresAt: true,
          lead: { select: { id: true, source: true, status: true, formData: true } },
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
          customerId: ctx.customerId,
          status: "booked",
          OR: [
            { conversationId: active.id },
            ...(active.lead ? [{ leadId: active.lead.id }] : []),
          ],
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, mode: true, meetUrl: true },
      })
    : [];
  const formAnswers = parseFormAnswers(active?.lead?.formData);
  const windowOpen =
    !!active?.windowExpiresAt && active.windowExpiresAt.getTime() > Date.now();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <AutoRefresh intervalMs={15_000} />
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Chats</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        WhatsApp-Gespräche deines Assistenten mit deinen Leads. Du kannst
        jederzeit übernehmen und selbst antworten.
      </p>
      <BuyerTabs showChats />

      {error ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex h-[calc(100vh-260px)] min-h-[520px] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        {/* Liste — auf dem Handy ausgeblendet, sobald ein Chat offen ist */}
        <aside
          className={`${active ? "hidden md:flex" : "flex"} w-full flex-none flex-col border-r border-[color:var(--border)] md:w-[300px]`}
        >
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-[color:var(--muted)]">
                Noch keine Chats. Sobald dein Assistent Leads anschreibt oder
                Leads dir schreiben, erscheinen sie hier.
              </p>
            ) : (
              conversations.map((c) => {
                const last = c.messages[0];
                const isActive = c.id === activeId;
                return (
                  <Link
                    key={c.id}
                    href={`/buyer/chats?c=${c.id}`}
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
                          {c.contactName ?? `+${c.contactPhone}`}
                        </span>
                        <span className="shrink-0 text-[10px] text-[color:var(--muted)]">
                          {c.lastMessageAt ? formatDateTime(c.lastMessageAt) : ""}
                        </span>
                      </div>
                      <div className="flex gap-1.5 py-0.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            c.botActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {c.botActive ? "Assistent" : "Du"}
                        </span>
                        {c.qualified ? (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                            qualifiziert
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-[color:var(--muted)]">
                        {last ? `${last.direction === "outbound" ? "↳ " : ""}${last.body ?? ""}` : ""}
                      </p>
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
              Wähle links einen Chat.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Link href="/buyer/chats" className="text-sm text-[color:var(--brand)] md:hidden">
                    ←
                  </Link>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{active.contactName ?? `+${active.contactPhone}`}</div>
                    <a href={`tel:+${active.contactPhone}`} className="text-xs text-[color:var(--brand)] hover:underline">
                      📞 +{active.contactPhone}
                    </a>
                  </div>
                </div>
                <form action={toggleBotBuyerAction}>
                  <input type="hidden" name="conversationId" value={active.id} />
                  <SubmitButton
                    pendingLabel="…"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      active.botActive
                        ? "border border-[color:var(--border)] bg-white hover:border-[color:var(--brand)]"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {active.botActive ? "Übernehmen" : "Assistent wieder aktivieren"}
                  </SubmitButton>
                </form>
              </div>

              {/* Kontext: Termin, Formular, Qualifizierung */}
              <div className="space-y-2 border-b border-[color:var(--border)] bg-white px-4 py-3 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[color:var(--muted)]">
                  {active.lead?.source ? <span>Produkt: {displayProduct(active.lead.source)}</span> : null}
                  {active.lead?.status ? <span>Status: {active.lead.status}</span> : null}
                  {active.contactEmail ? <span>E-Mail: {active.contactEmail}</span> : null}
                </div>
                {appointments.length > 0 ? (
                  <div className="font-semibold text-blue-700">
                    {appointments.map((a) => (
                      <div key={a.id}>
                        📅 {formatAppt(a.startsAt)} Uhr · {a.mode === "video" ? "Videocall" : "Telefonat"}
                        {a.meetUrl ? (
                          <>
                            {" · "}
                            <a href={a.meetUrl} target="_blank" rel="noreferrer" className="underline">
                              Video-Link
                            </a>
                          </>
                        ) : null}
                        <form action={cancelAppointmentBuyerAction} className="inline">
                          <input type="hidden" name="appointmentId" value={a.id} />
                          <input type="hidden" name="conversationId" value={active.id} />
                          {" · "}
                          <SubmitButton
                            pendingLabel="sagt ab …"
                            className="font-medium text-rose-700 hover:underline"
                          >
                            absagen
                          </SubmitButton>
                        </form>
                      </div>
                    ))}
                  </div>
                ) : null}
                {formAnswers.length > 0 ? (
                  <div className="text-[color:var(--foreground)]">
                    <span className="font-semibold">Leadformular: </span>
                    {formAnswers.map((a) => `${a.label}: ${a.value}`).join(" · ")}
                  </div>
                ) : null}
                {active.qualificationSummary ? (
                  <div className="text-[color:var(--foreground)]">
                    <span className="font-semibold">
                      {active.qualified ? "✓ Qualifiziert: " : "Bisher erfasst: "}
                    </span>
                    {active.qualificationSummary}
                  </div>
                ) : null}
              </div>

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
              </div>

              <form action={sendReplyBuyerAction} className="border-t border-[color:var(--border)] bg-white px-4 py-3">
                <input type="hidden" name="conversationId" value={active.id} />
                <textarea
                  name="body"
                  rows={2}
                  disabled={!windowOpen}
                  placeholder={
                    windowOpen
                      ? "Selbst antworten … (pausiert den Assistenten für diesen Chat)"
                      : "Freie Antwort nicht möglich – letzte Nachricht des Leads ist über 24 h her. Bitte anrufen."
                  }
                  className="w-full resize-none rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none disabled:bg-zinc-50"
                />
                <div className="mt-2 flex justify-end">
                  <SubmitButton
                    pendingLabel="Sendet …"
                    className="rounded-lg bg-[color:var(--brand)] px-5 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-dark)] disabled:opacity-50"
                  >
                    Senden
                  </SubmitButton>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
