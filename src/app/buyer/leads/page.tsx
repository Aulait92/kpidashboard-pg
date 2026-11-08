import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CalendarPlus, ChevronDown, Phone } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import {
  BuyerLeadsTable,
  type BuyerLeadRow,
} from "@/components/buyer-leads-table";
import { PageHeader } from "@/components/buyer-shell";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { callbackOutcomeAction, getStornogruendePerLead } from "@/app/buyer/actions";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { formatDate, formatPhone } from "@/lib/format";
import { loadRetainerConfig } from "@/lib/customer-spend";
import { SubmitButton } from "@/components/submit-button";
import { getOrCreateBookingSlug } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { WHATSAPP_STATUS_LABELS } from "@/lib/products";
import {
  getCallbackLeads,
  type CallbackLead,
} from "@/lib/whatsapp/outreach";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  q?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads | performancegrowth",
};

export default async function BuyerLeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getBuyerContext();
  if (!session) {
    redirect("/login");
  }

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = Date.now();


  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Leads"
          subtitle={
            <>
              Anfragen, Rückrufe und Termine an einem Ort · aktualisiert <LiveUpdated since={renderedAt} />
            </>
          }
          actions={
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
          }
        />

        <Suspense
          fallback={
            <div className="mt-6 text-sm text-[color:var(--muted)]">
              Lade Leads…
            </div>
          }
        >
          <LeadsBody
            customerId={session.customerId}
            range={range}
            q={(sp.q ?? "").trim()}
            rangeParams={{ range: sp.range, from: sp.from, to: sp.to }}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}

async function LeadsBody({
  customerId,
  range,
  q,
  rangeParams,
}: {
  customerId: string;
  range: { from: Date; to: Date };
  q: string;
  rangeParams: { range?: string; from?: string; to?: string };
}) {
  const qDigits = q.replace(/\D/g, "");
  const leadRows = await prisma.lead.findMany({
    where: {
      customerId,
      // Bei einer Suche über alle Zeiträume (Rückrufer sind oft älter).
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              ...(qDigits.length >= 3 ? [{ phone: { contains: qDigits } }] : []),
            ],
          }
        : { createdAt: { gte: range.from, lte: range.to } }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      name: true,
      source: true,
      status: true,
      reached: true,
      closedAt: true,
      revenues: { select: { amount: true }, take: 1 },
    },
  });

  // Storno-Optionen vorab live aus Airtable laden (Bezug → erlaubte
  // Stornogründe), damit das Storno-Modal beim Klick ohne Latenz das
  // Dropdown füllt.
  const stornoOptions = await getStornogruendePerLead(leadRows.map((l) => l.id));

  // WhatsApp-Assistent (nur Kunden, bei denen er aktiv ist): gebuchte Termine
  // und Rückrufliste. Andere Kunden sehen die Tabelle unverändert.
  // Rückrufliste für alle WhatsApp-Kunden (auch ohne automatisches
  // Erstanschreiben: Antworten ohne Termin, Absagen).
  const whatsapp = await hasWhatsAppInbox(customerId);
  const callbacks = whatsapp ? await getCallbackLeads(customerId) : [];
  // Buchungsseite für „Termin buchen" aus der Rückrufliste (relativer Link →
  // gleiche Domain wie das Dashboard, damit die Vorbelegung greift).
  const bookingSlug = whatsapp
    ? (
        await prisma.calendarConnection.findUnique({
          where: { customerId },
          select: { bookingSlug: true, status: true },
        })
      )?.status === "connected"
      ? await getOrCreateBookingSlug(customerId)
      : null
    : null;
  const callbackIds = new Set(callbacks.map((c) => c.id));
  const appointments = whatsapp
    ? await prisma.appointment.findMany({
        where: {
          customerId,
          status: "booked",
          startsAt: { gt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
          leadId: { in: leadRows.map((l) => l.id) },
        },
        orderBy: { startsAt: "asc" },
        select: { leadId: true, startsAt: true, mode: true },
      })
    : [];
  const apptByLead = new Map<string, { startsAt: Date; mode: string }>();
  for (const a of appointments) {
    if (a.leadId && !apptByLead.has(a.leadId)) {
      apptByLead.set(a.leadId, { startsAt: a.startsAt, mode: a.mode });
    }
  }

  const leads: BuyerLeadRow[] = leadRows.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    name: l.name,
    source: l.source,
    status: l.status,
    reached: l.reached,
    closedAt: l.closedAt,
    revenue:
      l.revenues[0]?.amount != null ? Number(l.revenues[0].amount) : 0,
    stornoOptions: stornoOptions.get(l.id) ?? [],
    appointment: apptByLead.get(l.id) ?? null,
    callback: callbackIds.has(l.id),
  }));

  return (
    <div className="mt-6 space-y-6">
      <form action="/buyer/leads" className="flex gap-2">
        {Object.entries(rangeParams).map(([k, v]) =>
          v ? <input key={k} type="hidden" name={k} value={v} /> : null,
        )}
        <input
          name="q"
          defaultValue={q}
          placeholder="Lead suchen: Name, Telefonnummer oder E-Mail"
          className="min-w-0 flex-1 rounded-xl border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
        {q ? (
          <Link href="/buyer/leads" className="rounded-xl border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm">
            ✕
          </Link>
        ) : null}
      </form>
      {whatsapp && !q ? <CallbackCard callbacks={callbacks} bookingSlug={bookingSlug} /> : null}
      <BuyerLeadsTable
        leads={leads}
        statusLabels={whatsapp ? WHATSAPP_STATUS_LABELS : {}}
        showLeadCost={!(await loadRetainerConfig(customerId))}
      />
    </div>
  );
}

function CallbackCard({
  callbacks,
  bookingSlug,
}: {
  callbacks: CallbackLead[];
  bookingSlug: string | null;
}) {
  if (callbacks.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-white px-5 py-4 text-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</span>
        <span>
          <b>Keine offenen Rückrufe.</b>{" "}
          <span className="text-[color:var(--muted)]">Alle Leads haben einen Termin oder ein Ergebnis.</span>
        </span>
      </section>
    );
  }
  const first = callbacks.slice(0, 5);
  const rest = callbacks.slice(5);
  const row = (c: CallbackLead) => (
    <li key={c.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/buyer/leads/${c.id}?from=leads`} className="truncate font-medium hover:text-[color:var(--brand)]">
            {c.name ?? "Unbekannt"}
          </Link>
          {c.conversationId ? (
            <Link
              href={`/buyer/chats?c=${c.conversationId}`}
              className="shrink-0 text-xs text-[color:var(--muted)] hover:text-[color:var(--brand)]"
            >
              Chat
            </Link>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-[color:var(--muted)]">
          <span className="text-amber-700">{c.reason}</span> · seit {formatDate(c.createdAt)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {c.phone ? (
          <a
            href={`tel:+${c.phone}`}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[color:var(--brand)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[color:var(--brand-dark)]"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="sm:hidden">Anrufen</span>
            <span className="hidden sm:inline">{formatPhone(c.phone)}</span>
          </a>
        ) : null}
        {bookingSlug ? (
          <a
            href={`/book/${bookingSlug}?lead=${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:border-[color:var(--brand)]"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Termin
          </a>
        ) : null}
        <details className="group relative">
          <summary className="flex h-[30px] cursor-pointer list-none items-center rounded-lg border border-[color:var(--border)] bg-white px-2 text-xs font-semibold hover:border-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
            Ergebnis <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-[color:var(--border)] bg-white py-1 text-sm shadow-lg">
            <form action={callbackOutcomeAction}>
              <input type="hidden" name="leadId" value={c.id} />
              <input type="hidden" name="outcome" value="not_reached" />
              <SubmitButton pendingLabel="…" className="block w-full px-3 py-2 text-left hover:bg-[color:var(--background)]">
                Nicht erreicht
                <span className="block text-[11px] text-[color:var(--muted)]">Morgen wieder in der Liste</span>
              </SubmitButton>
            </form>
            <form action={callbackOutcomeAction}>
              <input type="hidden" name="leadId" value={c.id} />
              <input type="hidden" name="outcome" value="lost" />
              <SubmitButton pendingLabel="…" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50">
                Verloren
                <span className="block text-[11px] text-rose-400">Kein Interesse</span>
              </SubmitButton>
            </form>
          </div>
        </details>
      </div>
    </li>
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-amber-100 bg-amber-50/50 px-5 py-3.5">
        <h2 className="text-base font-semibold tracking-tight">
          Rückrufe <span className="font-normal text-[color:var(--muted)]">· {callbacks.length}</span>
        </h2>
        <span className="hidden text-xs text-[color:var(--muted)] sm:inline">
          Nach dem Anruf Ergebnis eintragen – dann verschwindet der Lead aus der Liste
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--border)]">{first.map(row)}</ul>
      {rest.length > 0 ? (
        <details className="group border-t border-[color:var(--border)]">
          <summary className="cursor-pointer list-none px-5 py-2.5 text-center text-xs font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Alle {callbacks.length} anzeigen</span>
            <span className="hidden group-open:inline">Weniger anzeigen</span>
          </summary>
          <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">{rest.map(row)}</ul>
        </details>
      ) : null}
    </section>
  );
}
