import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/buyer-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBuyerContext } from "@/lib/buyer-context";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { displayProduct, statusLabel } from "@/lib/products";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import {
  cancelAppointmentBuyerAction,
  followupBuyerAction,
  markChatDoneBuyerAction,
  sendReplyBuyerAction,
  toggleBotBuyerAction,
} from "../chat-actions";

// WhatsApp-Chats im Kunden-CRM. Nur für Kunden mit WhatsApp-Assistent.
// Strikte Mandantentrennung: alle Abfragen mit customerId des Buyers.
export const dynamic = "force-dynamic";
export const metadata = { title: "Chats | performancegrowth" };

type SearchParams = Promise<{ c?: string; err?: string; f?: string; q?: string }>;

const ERRORS: Record<string, string> = {
  window:
    "Der Lead hat seit über 24 Stunden nicht geschrieben – WhatsApp erlaubt dann keine freie Nachricht. Bitte anrufen.",
  send: "Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen.",
  preview: "In der Vorschau sind Änderungen deaktiviert.",
  template:
    "Für „Nachfassen\" ist noch keine freigegebene WhatsApp-Vorlage hinterlegt (Einstellungen → Vorlagen).",
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
  appointment_cancelled: "❌ Termin abgesagt",
  appointment_rescheduled: "🔁 Termin verschoben",
  appointment_declined: "❌ Einladung abgelehnt",
};

export default async function BuyerChatsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (!(await hasWhatsAppInbox(ctx.customerId))) redirect("/buyer/leads");

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
    where: { customerId: ctx.customerId, needsAttention: true },
  });

  const conversations = await prisma.conversation.findMany({
    where: {
      customerId: ctx.customerId,
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
          customerId: ctx.customerId,
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
    !!active?.windowExpiresAt && active.windowExpiresAt.getTime() > Date.now();

  const leadInfo = active ? (
    <div className="space-y-5 text-sm">
      <InfoSection title="Kontakt">
        <InfoRow label="Telefon">
          <a href={`tel:+${active.contactPhone}`} className="text-[color:var(--brand)] hover:underline">
            +{active.contactPhone}
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
              <div className="font-semibold text-blue-900">📅 {formatAppt(a.startsAt)} Uhr</div>
              <div className="mt-0.5 text-xs text-blue-800">
                {a.mode === "video" ? "Videocall" : "Telefonat – du rufst an"}
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
        <InfoSection title={active.qualified ? "Qualifizierung ✓" : "Bisher erfasst"}>
          <p className="text-sm leading-relaxed">{active.qualificationSummary}</p>
        </InfoSection>
      ) : null}
    </div>
  ) : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
      <AutoRefresh intervalMs={15_000} />
      <div className="hidden sm:block">
        <PageHeader
          title="Chats"
          subtitle="WhatsApp-Gespräche deines Assistenten – du kannst jederzeit übernehmen."
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {error}
        </div>
      ) : null}

      <div className="flex h-[calc(100dvh-56px-64px)] overflow-hidden border-[color:var(--border)] bg-white sm:h-[calc(100dvh-56px-140px)] sm:min-h-[520px] sm:rounded-2xl sm:border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
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
                    href={`/buyer/chats?c=${c.id}${listQs ? `&${listQs}` : ""}`}
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
                        {c.needsAttention ? (
                          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            Braucht dich
                          </span>
                        ) : null}
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
                  Lead-Infos{appointments.length > 0 ? " · Termin" : ""}
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
              </div>

              {windowOpen ? (
                <form action={sendReplyBuyerAction} className="border-t border-[color:var(--border)] bg-white px-4 py-3">
                  <input type="hidden" name="conversationId" value={active.id} />
                  <textarea
                    name="body"
                    rows={2}
                    placeholder="Selbst antworten … (pausiert den Assistenten für diesen Chat)"
                    className="w-full resize-none rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
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
              ) : (
                <form
                  action={followupBuyerAction}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border)] bg-white px-4 py-3"
                >
                  <input type="hidden" name="conversationId" value={active.id} />
                  <p className="text-xs text-[color:var(--muted)]">
                    Letzte Nachricht des Leads ist über 24 h her – WhatsApp erlaubt nur eine
                    freigegebene Vorlage. Anrufen oder nachfassen:
                  </p>
                  <SubmitButton
                    pendingLabel="Sendet …"
                    className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-dark)]"
                  >
                    Nachfassen senden
                  </SubmitButton>
                </form>
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
