// Lead-Liste mit Ansichten (Rückruf nötig, Wiedervorlage fällig, …) – genutzt
// von /buyer/leads und von „Kontakte“ der neuen Oberfläche.

import Link from "next/link";
import { BuyerLeadsTable, type BuyerLeadRow } from "@/components/buyer-leads-table";
import { ButtonLink, EmptyState } from "@/components/ui";
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
import { X } from "lucide-react";
import { VERLUST_LABEL, verlustKey, type VerlustKey } from "@/lib/verlustgruende";
import { verlorenImZeitraum } from "@/lib/verlustgruende-server";
import { weitereEmailsSuche } from "@/lib/lead-emails";
import { CROSS_SELL_FILTER, CROSS_SELL_LABEL, crossSellOffenWhere } from "@/lib/cross-sell-offen";
import { ladeCrossSellVerkauf } from "@/lib/cross-sell-verkauf-server";
import { CrossSellLeiste } from "@/components/bestand/cross-sell-angebot";
import { istZuTun, kontaktAnsicht, zuTunRang } from "@/lib/kontakt-liste";
import { zaehltAlsTermin } from "@/lib/kpis";
import { produktWhere } from "@/lib/produkt-filter";
import { ladeProduktFilter } from "@/lib/produkt-filter-server";

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
  // Aus „Warum Leads verloren gehen“ (Zahlen): verlorene Leads mit diesem Grund, verloren im Zeitraum (lib/verlustgruende.ts)
  // Aus dem Tipp „Weiteres Produkt anbieten“ (Zahlen): genau die dort gezählten Kunden, unabhängig vom Zeitraum
  const crossSell = !noStepView && !q && params.filter === CROSS_SELL_FILTER;
  const verlust = !noStepView && !crossSell && !q && params.verlust && params.verlust in VERLUST_LABEL ? (params.verlust as VerlustKey) : null;
  // Standardansicht „Zu erledigen“ (Ole, 19.11.2026); bei Suche und Filtern aus Zahlen wie bisher alle Treffer
  const viewKey = kontaktAnsicht(view, { suche: !!q, filter: !!crossSell || !!verlust });
  // „Zu erledigen“ reicht über den Zeitraum hinaus: Wartendes bleibt sichtbar, auch wenn der Lead älter ist
  // (ohne nächsten Schritt, fällige Wiedervorlage, Antwort im Chat). Die übrigen Ansichten zählen nur den Zeitraum.
  const zuTunView = viewKey === "zu-tun" && !q && !crossSell && !verlust;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  // Produktfilter (Ole, 26.11.2026): erst ab zwei Produkten; wirkt auf Liste und alle Zähler der Ansichten
  const produktFilter = await ladeProduktFilter(leadScope(team), params.produkt);
  const nachProdukt = produktFilter.aktiv
    ? produktWhere(produktFilter.aktiv)
    : verlust && params.produkt
    ? { source: params.produkt }
    : {};
  const leadRowsAll = await prisma.lead.findMany({
    where: {
      ...leadScope(team),
      ...nachProdukt,
      ...(noStepView ? withoutNextStepWhere(now) : {}),
      // Bei einer Suche über alle Zeiträume (Rückrufer sind oft älter).
      ...(noStepView
        ? {}
        : crossSell
        ? crossSellOffenWhere(now)
        : verlust
        ? verlorenImZeitraum(range.from, range.to)
        : q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              ...weitereEmailsSuche(q),
              ...(qDigits.length >= 3 ? [{ phone: { contains: qDigits } }] : []),
            ],
          }
        : zuTunView
        ? {
            OR: [
              { createdAt: { gte: range.from, lte: range.to } },
              withoutNextStepWhere(now),
              { followUpAt: { lte: endOfToday }, closedAt: null, erasedAt: null },
              { conversations: { some: { needsAttention: true } }, erasedAt: null },
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
      isTest: true,
      lostReason: true,
      disqualifyReason: true,
      callAttempts: true,
      subscriptionId: true,
      revenues: { select: { amount: true }, take: 1 },
    },
  });
  const leadRows = verlust ? leadRowsAll.filter((l) => verlustKey(l) === verlust) : leadRowsAll;

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
  const [appointments, flags, pastAppts, noWhatsApp, waitingChats, gebuchteTermine] = await Promise.all([
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
    // Lead hat im Chat geschrieben und wartet (UX-Runde 19.11.2026: in der Liste sichtbar, Reaktionszeit)
    prisma.conversation.findMany({ where: { customerId, leadId: { in: leadIds }, needsAttention: true }, select: { leadId: true } }),
    // Ansicht „Termin“ wie Wachstum und Zahlen (lib/kpis.ts zaehltAlsTermin): gebuchte oder stattgefundene Termine
    prisma.appointment.findMany({ where: { customerId, leadId: { in: leadIds }, status: { in: ["booked", "completed"] } }, select: { leadId: true }, distinct: ["leadId"] }),
  ]);
  const mitTermin = new Set(gebuchteTermine.map((a) => a.leadId));
  const waiting = new Set(waitingChats.map((c) => c.leadId));
  const apptByLead = new Map<string, { startsAt: Date; mode: string }>();
  for (const a of appointments) {
    if (a.leadId && !apptByLead.has(a.leadId)) {
      apptByLead.set(a.leadId, { startsAt: a.startsAt, mode: a.mode });
    }
  }
  const noStepTotal = await countWithoutNextStep({ ...leadScope(team), ...nachProdukt }, now);
  const crossSellTotal = crossSell ? await prisma.lead.count({ where: { ...leadScope(team), ...crossSellOffenWhere(now) } }) : 0;
  // „Allen ein Produkt anbieten“ (lib/cross-sell-verkauf.ts): nur mit Bestandskunden-Modul für alle, sonst wie bisher
  const crossSellVerkauf = crossSell && crossSellTotal > 0 ? await ladeCrossSellVerkauf(team, { now, anzahl: crossSellTotal }) : null;
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
    ...(l.isTest ? { isTest: true } : {}),
    // Pay-per-Lead: Rückmeldung mit einem Tipp (components/ppl-rueckmeldung.tsx), nicht nach Storno, Abschluss, Löschung
    ...(l.subscriptionId && !l.stornoState && !l.closedAt && !l.erasedAt ? { ppl: true } : {}),
    ...(waiting.has(l.id) ? { waiting: true } : {}),
    ...(flags.get(l.id)?.botActive ? { botActive: true } : {}),
    ...nextStepFields(stateFor(l, flags), pastByLead.get(l.id) ?? null),
  }));

  // Ansichten (wie gespeicherte Filter in Pipedrive) und Phase.
  const phases = pipelinePhasesFor(whatsapp);
  const today = new Date(nowMs());
  today.setHours(23, 59, 59, 999);
  // UX-Runde 19.11.2026 (Team B): vier Ansichten statt sieben. „Zu erledigen“ sammelt alles, was auf den Vermittler
  // wartet (Antwort im Chat, Ergebnis, fällige Wiedervorlage, Rückruf, kein nächster Schritt), Dringendes zuerst.
  // Die bisherigen Ansichten bleiben per Link erreichbar (Heute, Zahlen, Erinnerung) und zeigen sich nur, solange sie offen sind.
  // Leads im gewählten Zeitraum (bei „Zu erledigen“ lädt die Liste auch ältere Wartende)
  const imZeitraum = (l: BuyerLeadRow) => !zuTunView || (l.createdAt >= range.from && l.createdAt <= range.to);
  const VIEWS: { key: string; label: string; match: (l: BuyerLeadRow) => boolean; nurOffen?: boolean }[] = [
    { key: "zu-tun", label: "Zu erledigen", match: (l) => istZuTun(l, now) },
    { key: "alle", label: "Alle", match: imZeitraum },
    // Neu: noch niemand hat gesprochen (wie der Zähler an „Kontakte“)
    { key: "neu", label: "Neu", match: (l: BuyerLeadRow) => imZeitraum(l) && !l.reached && !l.closedAt && (!l.status || l.status === "Neuer Lead") },
    // Gleiche Zählweise wie „Termine“ auf Wachstum (Usability-Check 25.11.2026): auch schon stattgefundene Termine
    { key: "termin", label: "Termin", match: (l: BuyerLeadRow) => imZeitraum(l) && (!!l.appointment || zaehltAlsTermin(l.status, mitTermin.has(l.id))) },
    { key: "rueckruf", label: "Rückruf nötig", match: (l: BuyerLeadRow) => !!l.callback, nurOffen: true },
    { key: "ohne-whatsapp", label: "Ohne WhatsApp", match: (l: BuyerLeadRow) => !!l.noWhatsApp, nurOffen: true },
    { key: "wiedervorlage", label: "Wiedervorlage fällig", match: (l) => !!l.followUpAt && new Date(l.followUpAt) <= today, nurOffen: true },
    { key: "ohne-schritt", label: "Ohne nächsten Schritt", match: (l) => !!l.noNextStep, nurOffen: true },
  ];
  const activeView = VIEWS.find((v) => v.key === viewKey) ?? VIEWS[0];
  const phase = phases.find((p) => p.key === phaseKey);
  const byPhase = phase ? leads.filter((l) => findPhaseIn(phases, l.status)?.key === phase.key) : leads;
  const shown = byPhase.filter(activeView.match);
  if (activeView.key === "zu-tun") shown.sort((a, b) => zuTunRang(a, now) - zuTunRang(b, now));
  const hrefFor = (key: string) => {
    const next = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "ansicht") as [string, string][]);
    // „Zu erledigen“ ist der Standard und braucht keinen Parameter
    if (key && key !== "zu-tun") next.set("ansicht", key);
    const s = next.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const alleHref = `${basePath}?ansicht=alle`;
  // Gibt es überhaupt Kontakte? (nur für leere Zustände abgefragt)
  const hatKontakte = shown.length === 0 ? (await prisma.lead.count({ where: leadScope(team), take: 1 })) > 0 : true;
  // Noch gar kein Kontakt und Einrichtung offen: nächster Schritt „Einrichtung fortsetzen“ (nur Inhaber, Berater sehen sie nicht)
  const einrichtungOffen =
    !hatKontakte && !isAdvisor(team)
      ? await prisma.onboarding.findUnique({ where: { customerId }, select: { liveAt: true } }).then((o) => !!o && !o.liveAt).catch(() => false)
      : false;

  return (
    <div className="space-y-4">
      {verlust ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-verlust-filter>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 font-medium text-[color:var(--brand-dark)]">
            Verloren: {VERLUST_LABEL[verlust]}
            <Link href={basePath} aria-label="Filter entfernen" className="-mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/60">
              <X className="h-3.5 w-3.5" />
            </Link>
          </span>
        </p>
      ) : null}
      {crossSellVerkauf ? (
        <CrossSellLeiste verkauf={crossSellVerkauf} filterWeg={basePath} />
      ) : crossSell ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-cross-sell-filter>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 font-medium text-[color:var(--brand-dark)]">
            {CROSS_SELL_LABEL}: <span className="tabular-nums">{crossSellTotal}</span>
            <Link href={basePath} aria-label="Filter entfernen" className="-mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/60">
              <X className="h-3.5 w-3.5" />
            </Link>
          </span>
        </p>
      ) : null}
      <FilterChips
        searchPlaceholder="Name, Telefon oder E-Mail"
        fields={[
          { kind: "select", key: "phase", label: "Phase", options: phases.map((p) => ({ value: p.key, label: p.label })) },
          // Nur bei mindestens zwei Produkten (sonst unverändert), häufigste zuerst
          ...(produktFilter.optionen.length > 1
            ? [{ kind: "select" as const, key: "produkt", label: "Produkt", options: produktFilter.optionen.map((p) => ({ value: p.value, label: p.label })) }]
            : []),
        ]}
      />
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Ansichten">
        {VIEWS.filter((v) => !v.nurOffen || v.key === activeView.key).map((v) => {
          // „Ohne nächsten Schritt“ zählt über alle Zeiträume (wie der Zähler an „Kontakte“).
          const n = v.key === "ohne-schritt" ? noStepTotal : noStepView ? null : byPhase.filter(v.match).length;
          const active = v.key === activeView.key;
          // Wartet etwas, ist „Zu erledigen“ rot markiert (wie die Zähler in der Navigation)
          const dringend = v.key === "zu-tun" && !active && !!n;
          return (
            <Link
              key={v.key}
              href={hrefFor(v.key)}
              scroll={false}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm sm:h-8 font-medium transition ${
                active ? "bg-[color:var(--foreground)] text-white" : "text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)]"
              }`}
            >
              {v.label}
              {n != null ? (
                dringend ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-semibold tabular-nums text-white">{n}</span>
                ) : (
                  <span className={`tabular-nums text-xs ${active ? "text-white/70" : ""}`}>{n}</span>
                )
              ) : null}
            </Link>
          );
        })}
      </nav>
      <BuyerLeadsTable
        leads={shown}
        title={[crossSell ? CROSS_SELL_LABEL : activeView.key === "alle" ? "Alle Kontakte" : activeView.label, phase?.label, produktFilter.aktiv?.label].filter(Boolean).join(" · ")}
        statusLabels={WHATSAPP_STATUS_LABELS}
        showLeadCost={!(await loadRetainerConfig(customerId))}
        detailBase={detailBase}
        detailSuffix={detailSuffix}
        empty={
          // Leerer Zustand mit nächster Handlung (UX-Regel): Filter lösen bzw. Zeitraum erweitern
          crossSell && leads.length === 0 ? (
            <>
              Alle Kunden mit Abschluss haben schon ein weiteres Produkt.{" "}
              <Link href={alleHref} className="font-medium text-[color:var(--brand)] underline">
                Alle Kontakte anzeigen
              </Link>
            </>
          ) : zuTunView && hatKontakte ? (
            // Standardansicht leer (Ole, 19.11.2026): dort bleiben, Erfolg zeigen, Weg zu „Alle“
            <>
              Alles erledigt, kein Kontakt wartet auf Sie.{" "}
              <Link href={alleHref} className="font-medium text-[color:var(--brand)] underline" data-alle-anzeigen>
                Alle Kontakte anzeigen
              </Link>
            </>
          ) : leads.length > 0 ? (
            <>
              Keine Kontakte in dieser Ansicht.{" "}
              <Link href={alleHref} className="font-medium text-[color:var(--brand)] underline">
                Alle Kontakte anzeigen
              </Link>
            </>
          ) : q ? (
            `Kein Kontakt zu „${q}“ gefunden.`
          ) : params.range !== "max" && hatKontakte ? (
            <>
              In diesem Zeitraum sind keine Kontakte eingegangen.{" "}
              <Link href={`${basePath}?ansicht=alle&range=max`} className="font-medium text-[color:var(--brand)] underline">
                Gesamten Zeitraum anzeigen
              </Link>
            </>
          ) : (
            <EmptyState
              leo="ruhig"
              title="Noch keine Kontakte"
              text="Neue Leads erscheinen hier und auf „Heute“, sobald sie eingehen."
              action={einrichtungOffen ? <ButtonLink href="/buyer/einrichtung" variant="primary">Einrichtung fortsetzen</ButtonLink> : undefined}
            />
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
