// Lead-Liste mit Ansichten (Rückruf nötig, Wiedervorlage fällig, …) – genutzt
// von /buyer/leads und von „Kontakte“ der neuen Oberfläche.

import Link from "next/link";
import { BuyerLeadsTable, type BuyerLeadRow } from "@/components/buyer-leads-table";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { getStornogruendePerLead } from "@/app/buyer/actions";
import { isAdvisor, leadScope, type TeamCtx } from "@/lib/team";
import { loadRetainerConfig } from "@/lib/customer-spend";
import { prisma } from "@/lib/prisma";
import { findPhaseIn, pipelinePhasesFor, WHATSAPP_STATUS_LABELS } from "@/lib/products";
import { FilterChips } from "@/components/ui/filter-chips";
import { needsNextStep } from "@/lib/lead-next-step";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { nowMs } from "@/lib/now";

export async function BuyerLeadsBody({
  customerId,
  team,
  range,
  q,
  view,
  phaseKey,
  params,
  basePath = "/buyer/leads",
  detailBase,
  detailSuffix,
}: {
  /** Seite, auf der die Liste steht (für die Ansichts-Links). */
  basePath?: string;
  /** Ziel für Klick auf einen Lead (Standard: Lead-Detail als Modal). */
  detailBase?: string;
  detailSuffix?: string;
  customerId: string;
  team: TeamCtx;
  range: { from: Date; to: Date };
  q: string;
  view: string;
  phaseKey: string;
  params: Record<string, string | undefined>;
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
      erasedAt: true,
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
          startsAt: { gt: new Date(nowMs() - 2 * 60 * 60 * 1000) },
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
    noNextStep: needsNextStep({ status: l.status, closedAt: l.closedAt, erasedAt: l.erasedAt, followUpAt: l.followUpAt, hasUpcomingAppointment: apptByLead.has(l.id) }),
  }));

  // Ansichten (wie gespeicherte Filter in Pipedrive) und Phase.
  const phases = pipelinePhasesFor(whatsapp);
  const today = new Date(nowMs());
  today.setHours(23, 59, 59, 999);
  const VIEWS: { key: string; label: string; match: (l: BuyerLeadRow) => boolean }[] = [
    { key: "", label: "Alle", match: () => true },
    ...(whatsapp ? [{ key: "rueckruf", label: "Rückruf nötig", match: (l: BuyerLeadRow) => !!l.callback }] : []),
    { key: "wiedervorlage", label: "Wiedervorlage fällig", match: (l) => !!l.followUpAt && new Date(l.followUpAt) <= today },
    { key: "ohne-schritt", label: "Ohne nächsten Schritt", match: (l) => !!l.noNextStep },
    ...(whatsapp ? [{ key: "termin", label: "Termin", match: (l: BuyerLeadRow) => !!l.appointment }] : []),
  ];
  const activeView = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const phase = phases.find((p) => p.key === phaseKey);
  const byPhase = phase ? leads.filter((l) => findPhaseIn(phases, l.status)?.key === phase.key) : leads;
  const shown = byPhase.filter(activeView.match);
  const hrefFor = (key: string) => {
    const next = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "ansicht") as [string, string][]);
    if (key) next.set("ansicht", key);
    const s = next.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="space-y-4">
      <FilterChips
        searchPlaceholder="Name, Telefon oder E-Mail"
        fields={[{ kind: "select", key: "phase", label: "Phase", options: phases.map((p) => ({ value: p.key, label: p.label })) }]}
      />
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Ansichten">
        {VIEWS.map((v) => {
          const n = byPhase.filter(v.match).length;
          const active = v.key === activeView.key;
          return (
            <Link
              key={v.key || "alle"}
              href={hrefFor(v.key)}
              scroll={false}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-[color:var(--foreground)] text-white" : "text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)]"
              }`}
            >
              {v.label}
              <span className={`tabular-nums text-xs ${active ? "text-white/70" : ""}`}>{n}</span>
            </Link>
          );
        })}
      </nav>
      <BuyerLeadsTable
        leads={shown}
        title={[activeView.key ? activeView.label : "Alle Leads", phase?.label].filter(Boolean).join(" · ")}
        statusLabels={whatsapp ? WHATSAPP_STATUS_LABELS : {}}
        showLeadCost={!(await loadRetainerConfig(customerId))}
        detailBase={detailBase}
        detailSuffix={detailSuffix}
      />
    </div>
  );
}
