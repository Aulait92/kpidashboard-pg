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
import { pastOpenAppointmentWhere, upcomingAppointmentWhere, withoutNextStepWhere, type NextStepState } from "@/lib/lead-next-step";
import { countWithoutNextStep, loadNextStepFlags, stateFor } from "@/lib/lead-next-step-server";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { nowMs } from "@/lib/now";
import { keinWhatsAppIds } from "@/lib/kein-whatsapp-kennzeichen-server";

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
  const now = new Date(nowMs());
  // „Ohne nächsten Schritt“ zeigt alle offenen Leads ohne Schritt, unabhängig vom Zeitraum
  // (gleiche Regel wie Zähler in der Navigation und „Heute“, lib/lead-next-step.ts).
  const noStepView = view === "ohne-schritt" && !q;
  const leadRows = await prisma.lead.findMany({
    where: {
      ...leadScope(team),
      ...(noStepView ? withoutNextStepWhere(now) : {}),
      // Bei einer Suche über alle Zeiträume (Rückrufer sind oft älter).
      ...(noStepView
        ? {}
        : q
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
      phone: true,
      source: true,
      status: true,
      outreachStatus: true,
      waUnavailableAt: true,
      followUpAt: true,
      reached: true,
      closedAt: true,
      erasedAt: true,
      stornoState: true,
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
  // Termine für alle Kunden (nicht nur mit WhatsApp-Assistent): ohne sie zeigte die Liste bei
  // „Termin vereinbart“ mit künftigem Termin fälschlich „Kein nächster Schritt“.
  const leadIds = leadRows.map((l) => l.id);
  const [appointments, flags, pastAppts, noWhatsApp] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId, leadId: { in: leadIds }, ...upcomingAppointmentWhere(now) },
      orderBy: { startsAt: "asc" },
      select: { leadId: true, startsAt: true, mode: true },
    }),
    loadNextStepFlags(leadIds, now),
    prisma.appointment.findMany({
      where: { customerId, leadId: { in: leadIds }, ...pastOpenAppointmentWhere(now) },
      orderBy: { startsAt: "desc" },
      select: { id: true, leadId: true },
    }),
    keinWhatsAppIds(leadRows),
  ]);
  const apptByLead = new Map<string, { startsAt: Date; mode: string }>();
  for (const a of appointments) {
    if (a.leadId && !apptByLead.has(a.leadId)) {
      apptByLead.set(a.leadId, { startsAt: a.startsAt, mode: a.mode });
    }
  }
  const noStepTotal = await countWithoutNextStep(leadScope(team), now);
  const pastByLead = new Map<string, string>();
  for (const a of pastAppts) if (a.leadId && !pastByLead.has(a.leadId)) pastByLead.set(a.leadId, a.id);

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
    ...(noWhatsApp.has(l.id) ? { phone: l.phone, noWhatsApp: true } : {}),
    ...nextStepFields(stateFor(l, flags), pastByLead.get(l.id) ?? null),
  }));

  // Ansichten (wie gespeicherte Filter in Pipedrive) und Phase.
  const phases = pipelinePhasesFor(whatsapp);
  const today = new Date(nowMs());
  today.setHours(23, 59, 59, 999);
  const VIEWS: { key: string; label: string; match: (l: BuyerLeadRow) => boolean }[] = [
    { key: "", label: "Alle", match: () => true },
    // Neu: noch niemand hat gesprochen (wie der Zähler an „Kontakte“)
    { key: "neu", label: "Neu", match: (l: BuyerLeadRow) => !l.reached && !l.closedAt && (!l.status || l.status === "Neuer Lead") },
    ...(whatsapp ? [{ key: "rueckruf", label: "Rückruf nötig", match: (l: BuyerLeadRow) => !!l.callback }] : []),
    // Nur, wenn es solche Kontakte gibt (oder die Ansicht gerade offen ist): Leads ohne WhatsApp gesammelt anrufen
    ...(view === "ohne-whatsapp" || leads.some((l) => l.noWhatsApp)
      ? [{ key: "ohne-whatsapp", label: "Nur ohne WhatsApp", match: (l: BuyerLeadRow) => !!l.noWhatsApp }]
      : []),
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
          // „Ohne nächsten Schritt“ zählt über alle Zeiträume (wie der Zähler an „Kontakte“).
          const n = v.key === "ohne-schritt" ? noStepTotal : noStepView ? null : byPhase.filter(v.match).length;
          const active = v.key === activeView.key;
          return (
            <Link
              key={v.key || "alle"}
              href={hrefFor(v.key)}
              scroll={false}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm sm:h-8 font-medium transition ${
                active ? "bg-[color:var(--foreground)] text-white" : "text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)]"
              }`}
            >
              {v.label}
              {n != null ? <span className={`tabular-nums text-xs ${active ? "text-white/70" : ""}`}>{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      <BuyerLeadsTable
        leads={shown}
        title={[activeView.key ? activeView.label : "Alle Kontakte", phase?.label].filter(Boolean).join(" · ")}
        statusLabels={WHATSAPP_STATUS_LABELS}
        showLeadCost={!(await loadRetainerConfig(customerId))}
        detailBase={detailBase}
        detailSuffix={detailSuffix}
        empty={
          // Leerer Zustand mit nächster Handlung (UX-Regel): Filter lösen bzw. Zeitraum erweitern
          leads.length > 0 ? (
            <>
              Keine Kontakte in dieser Ansicht.{" "}
              <Link href={basePath} className="font-medium text-[color:var(--brand)] underline">
                Alle Kontakte anzeigen
              </Link>
            </>
          ) : q ? (
            `Kein Kontakt zu „${q}“ gefunden.`
          ) : params.range !== "max" && (await prisma.lead.count({ where: leadScope(team), take: 1 })) > 0 ? (
            <>
              In diesem Zeitraum sind keine Kontakte eingegangen.{" "}
              <Link href={`${basePath}?range=max`} className="font-medium text-[color:var(--brand)] underline">
                Gesamten Zeitraum anzeigen
              </Link>
            </>
          ) : (
            "Noch keine Kontakte. Neue Leads erscheinen hier und auf „Heute“, sobald sie eingehen."
          )
        }
      />
    </div>
  );
}

function nextStepFields(state: NextStepState, pastAppointmentId: string | null): Pick<BuyerLeadRow, "noNextStep" | "resultMissing" | "pastAppointmentId"> {
  const missing = state === "missing" || state === "result_missing";
  return { noNextStep: missing, resultMissing: state === "result_missing", pastAppointmentId: state === "result_missing" ? pastAppointmentId : null };
}
