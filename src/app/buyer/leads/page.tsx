import Link from "next/link";
import { X } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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
import { getStornogruendePerLead } from "@/app/buyer/actions";
import { getBuyerContext } from "@/lib/buyer-context";
import { isAdvisor, leadScope, type TeamCtx } from "@/lib/team";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { loadRetainerConfig } from "@/lib/customer-spend";
import { prisma } from "@/lib/prisma";
import { WHATSAPP_STATUS_LABELS } from "@/lib/products";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";

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
            team={{ customerId: session.customerId, userId: session.userId, teamRole: session.teamRole }}
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
  team,
  range,
  q,
  rangeParams,
}: {
  customerId: string;
  team: TeamCtx;
  range: { from: Date; to: Date };
  q: string;
  rangeParams: { range?: string; from?: string; to?: string };
}) {
  const qDigits = q.replace(/\D/g, "");
  const leadRows = await prisma.lead.findMany({
    where: {
      ...leadScope(team),
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
      followUpAt: true,
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
  const callbacks = whatsapp ? await getCallbackLeads(customerId, isAdvisor(team) ? leadScope(team) : undefined) : [];
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
    followUpAt: l.followUpAt ? l.followUpAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
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
            <X className="h-4 w-4" />
          </Link>
        ) : null}
      </form>
      <BuyerLeadsTable
        leads={leads}
        statusLabels={whatsapp ? WHATSAPP_STATUS_LABELS : {}}
        showLeadCost={!(await loadRetainerConfig(customerId))}
      />
    </div>
  );
}
