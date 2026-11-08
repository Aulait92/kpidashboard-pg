import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import {
  BuyerLeadsTable,
  type BuyerLeadRow,
} from "@/components/buyer-leads-table";
import { BuyerTabs } from "@/components/buyer-tabs";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { logoutAction } from "@/app/login/actions";
import { getStornogruendePerLead } from "@/app/buyer/actions";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { formatDate } from "@/lib/format";
import { loadRetainerConfig } from "@/lib/customer-spend";
import { prisma } from "@/lib/prisma";
import { displayProduct } from "@/lib/products";
import {
  getCallbackLeads,
  hasWhatsAppOutreach,
  type CallbackLead,
} from "@/lib/whatsapp/outreach";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
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

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    select: { name: true },
  });

  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--brand)]" />
              Live · aktualisiert <LiveUpdated since={renderedAt} />
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Hallo,{" "}
              <span className="text-[color:var(--brand)]">
                {customer?.name ?? session.email}
              </span>
              .
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Zeitraum: {formatDate(range.from)} – {formatDate(range.to)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Abmelden"
                title="Abmelden"
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition hover:border-[color:var(--brand)] sm:min-h-0 sm:py-1.5"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </form>
          </div>
        </header>

        <BuyerTabs showChats={await hasWhatsAppInbox(session.customerId)} />

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
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}

async function LeadsBody({
  customerId,
  range,
}: {
  customerId: string;
  range: { from: Date; to: Date };
}) {
  const leadRows = await prisma.lead.findMany({
    where: {
      customerId,
      createdAt: { gte: range.from, lte: range.to },
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
  const whatsapp = await hasWhatsAppOutreach(customerId);
  const callbacks = whatsapp ? await getCallbackLeads(customerId) : [];
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
      {whatsapp ? <CallbackCard callbacks={callbacks} /> : null}
      <BuyerLeadsTable
        leads={leads}
        showLeadCost={!(await loadRetainerConfig(customerId))}
      />
    </div>
  );
}

function CallbackCard({ callbacks }: { callbacks: CallbackLead[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(217,119,6,0.18)]">
      <div className="border-b border-amber-100 bg-amber-50/60 px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
          Rückruf nötig
        </div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
          {callbacks.length === 0
            ? "Alles erledigt – kein Lead wartet auf deinen Anruf"
            : `${callbacks.length} ${callbacks.length === 1 ? "Lead wartet" : "Leads warten"} auf deinen Anruf`}
        </h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Diese Leads haben weder über die Buchungsseite noch im WhatsApp-Chat
          einen Termin gebucht. Am besten heute noch anrufen.
        </p>
      </div>
      {callbacks.length > 0 ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {callbacks.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link
                  href={`/buyer/leads/${c.id}?from=leads`}
                  className="font-semibold hover:text-[color:var(--brand)]"
                >
                  {c.name ?? "Unbekannt"}
                </Link>
                <div className="text-xs text-[color:var(--muted)]">
                  {displayProduct(c.source)} · eingegangen {formatDate(c.createdAt)} ·{" "}
                  <span className="text-amber-700">{c.reason}</span>
                  {c.conversationId ? (
                    <>
                      {" · "}
                      <Link
                        href={`/buyer/chats?c=${c.conversationId}`}
                        className="font-medium text-[color:var(--brand)] hover:underline"
                      >
                        Chat lesen
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
              {c.phone ? (
                <a
                  href={`tel:+${c.phone}`}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--brand-dark)]"
                >
                  📞 +{c.phone}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
