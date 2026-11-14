import { AlertTriangle, CalendarClock, ClipboardList, MessageCircle } from "lucide-react";
import { NextStepButton, NextStepPrompt } from "@/components/next-step";
import { NEXT_STEP_LABEL, pastOpenAppointmentWhere } from "@/lib/lead-next-step";
import { nextStepStateOf } from "@/lib/lead-next-step-server";
import { EmpfehlungLeadCard } from "@/components/empfehlung/server";
import { ButtonLink, buttonClass, Card, CardHeader } from "@/components/ui";
import { RescheduleButton } from "@/components/reschedule-dialog";
import { formatPhone } from "@/lib/format";
import { pipelinePhasesFor, WHATSAPP_STATUS_LABELS } from "@/lib/products";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { notFound } from "next/navigation";
import {
  getStornogruendePerLead,
  type LeadStornogrundOptions,
} from "@/app/buyer/actions";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { formatDate, formatEUR } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { isAdvisor, leadScope, teamMembers, type TeamCtx } from "@/lib/team";
import { LeadAssignee } from "@/components/lead-assignee";
import { addsSeatCost, berlinDayStart, fmtSeatPrice, isActiveSeller } from "@/lib/seats";
import { LeadHeaderActions } from "@/components/lead-actions";
import { AbschlussCard, LeadHistory } from "@/components/lead-history";
import { loadLeadHistory } from "@/lib/lead-history";
import { listLeadFiles } from "@/lib/lead-files";
import { postfachOf } from "@/lib/mail/postfach";
import { loadVorlagen } from "@/lib/mail/vorlagen";
import { passendeVorlagen } from "@/lib/mail/phasen";
import { istSpaeter } from "@/lib/mail/termin-erinnerung";
import { wuenscheVorschlag } from "@/lib/mail/beratung";
import { LeadMailComposer } from "@/components/lead-mail";
import { asAnsprache, namePartsFromForm, salutationFromForm } from "@/lib/ansprache";
import { appUrl } from "@/lib/whatsapp/event-text";
import { LeadFiles } from "@/components/lead-files";
import { LeadStammdatenEdit } from "@/components/lead-stammdaten-edit";
import { applyStammdatenToFields, currentStammdaten, formWithOverrides } from "@/lib/lead-stammdaten";
import { loadCustomerProvision } from "@/lib/provision-server";
import { contractProvision, sparteInfo } from "@/lib/provision";
import { listLeadContracts, syncPrimaryContract } from "@/lib/vertraege";
import { LeadContracts } from "@/components/lead-contracts";
import { LeadSequenceCard } from "@/components/lead-sequence-card";
import {
  ALL_GROUP_KEYS,
  COMMON_FIELDS,
  detectLeadKind,
  fieldGroupFor,
  fieldsFromLead,
  firstString,
  TAIL_FIELDS,
  type ReadOnlyField,
} from "@/lib/lead-fields";

// Shared Lead-Detail-Inhalt — wird sowohl von /buyer/leads/[id]
// (Vollseite) als auch vom Pipeline-Intercepting-Modal genutzt. Enthält
// Header + Read-Only-Karte + Edit-Form, aber NICHT die Außen-Hülle
// (main / dialog) und keinen Back-Link — das macht der jeweilige
// Wrapper, damit Page-Variante und Modal-Variante unterschiedliche
// Chrome haben können.


// Interne/technische Felder, die in „Weitere Angaben" NIE auftauchen dürfen.
const INTERNAL_KEYS = new Set<string>([
  "Lead-ID",
  "Datum",
  "Produkt (Eingang)",
  "Source",
  "SMS-Verifizierung",
  "score",
  "ist_beamter",
  "schwach",
  "Preis",
  "Zuweisungsdatum",
  "Perspective-ID",
  "delivery_id",
  "ausgeliefert_am",
  "liefer_status",
  "Bearbeitungsstatus",
  "Kontaktversuche",
  "Erster Kontaktversuch",
  "Notizen",
  "Abschlusswert",
  "Im Storno-Fenster",
  "Stornogrund",
  "storniert_am",
  "Storno-Bemerkung",
  "Zählt zum Kontingent",
  "Im aktuellen Monat",
  "Abrechenbar",
  "Abgerechnet",
  "Gutschrift fällig",
  "Gutgeschrieben",
  "Telefon-Prüfung",
]);


function formatValue(
  v: unknown,
  format: ReadOnlyField["format"] | undefined,
): string | null {
  if (v == null) return null;
  if (Array.isArray(v) && v.length === 0) return null;
  const raw = firstString(v);
  if (!raw) return null;
  switch (format) {
    case "date": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? raw : formatDate(d);
    }
    case "datetime": {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw;
      const time = d.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
      });
      return `${formatDate(d)}  ${time}`;
    }
    case "eur": {
      const n = Number.parseFloat(raw.replace(",", "."));
      return Number.isFinite(n) ? formatEUR(n) : raw;
    }
    default:
      return raw;
  }
}


export async function LeadDetailBody({
  leadId,
  team,
  newUi = false,
}: {
  leadId: string;
  team: TeamCtx;
  /** Neue Oberfläche: nach „Anrufen“ automatisch „Wie lief's?“. */
  newUi?: boolean;
}) {
  const customerId = team.customerId;
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...leadScope(team) },
    select: {
      assignedUserId: true,
      id: true,
      airtableId: true,
      name: true,
      source: true,
      status: true,
      createdAt: true,
      phone: true,
      email: true,
      formData: true,
      contactOverrides: true,
      contactEditedAt: true,
      contactAttempts: true,
      firstContactAt: true,
      followUpAt: true,
      followUpNote: true,
      notes: true,
      erasedAt: true,
      closedAt: true,
      closeValue: true,
      policyDoneAt: true,
      statusChangedAt: true,
      stornoState: true,
      stornoReason: true,
    },
  });
  if (!lead) notFound();
  if (lead.erasedAt) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-5 py-6 text-sm text-[color:var(--muted)]">
        Die Daten dieses Leads wurden am {formatDate(lead.erasedAt)} auf Wunsch gelöscht. Für Abrechnung und Zahlen bleibt nur ein anonymer Eintrag.
      </div>
    );
  }

  let fields: Record<string, unknown> | null = null;
  let fetchError: string | null = null;
  if (lead.airtableId) {
    try {
      fields = await fetchLeadRecord({ airtableId: lead.airtableId });
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  } else {
    // Ohne Airtable-Referenz (z. B. Demo-Leads): aus der DB anzeigen.
    fields = {
      ...fieldsFromLead(lead),
      Kontaktversuche: lead.contactAttempts,
      "Erster Kontaktversuch": lead.firstContactAt?.toISOString(),
    };
  }

  // Korrigierte Stammdaten (lib/lead-stammdaten.ts) über die Formular- bzw. Airtable-Felder legen
  if (fields) fields = applyStammdatenToFields(fields, lead);
  const stamm = currentStammdaten(lead, fields);
  const stammInitial = {
    salutation: stamm.salutation ?? "",
    firstName: stamm.firstName,
    lastName: stamm.lastName,
    phone: stamm.phone ? formatPhone(stamm.phone) : "",
    email: stamm.email ?? "",
    street: stamm.street,
    zip: stamm.zip,
    city: stamm.city,
  };

  const whatsapp = await hasWhatsAppInbox(customerId);
  let stornoOptionsMap: LeadStornogrundOptions = new Map();
  try {
    stornoOptionsMap = await getStornogruendePerLead([lead.id]);
  } catch {
    /* still mit leer */
  }
  const stornoOptions = stornoOptionsMap.get(lead.id) ?? [];
  // Team: Inhaber sieht und ändert, wer zuständig ist.
  const members = isAdvisor(team) ? [] : await teamMembers(customerId);
  // Zuteilen an ein Mitglied ohne „bekommt Leads“ macht es heute zum aktiven Verkäufer (lib/seats.ts): Kostenhinweis
  const assignCost = members.length > 1 ? await assignCostHints(customerId, members) : new Map<string, string>();
  // Löschen (Datenschutz): Inhaber oder Admin in der Kundenansicht.
  const canErase = !isAdvisor(team);

  const [conv, nextAppt, cal, stepState, pastAppt] = await Promise.all([
    prisma.conversation.findFirst({
      where: { leadId: lead.id },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, qualificationSummary: true, qualificationData: true, needsAttention: true, attentionReason: true },
    }),
    prisma.appointment.findFirst({
      where: { leadId: lead.id, status: "booked", startsAt: { gt: twoHoursAgo() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, mode: true, meetUrl: true },
    }),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, bookingSlug: true } }),
    // Nächster Schritt (lib/lead-next-step.ts): Hinweis im Kontakt und Dialog nach jeder Aktion
    nextStepStateOf(lead.id),
    prisma.appointment.findFirst({ where: { leadId: lead.id, ...pastOpenAppointmentWhere(new Date(nowMs())) }, orderBy: { startsAt: "desc" }, select: { id: true } }),
  ]);
  const resultMissingAppt = stepState === "result_missing" ? (pastAppt?.id ?? null) : null;
  const storniert = !!lead.status?.toLowerCase().startsWith("storno");
  // Abschluss (Ole, 13.11.2026): Beitrag, geschätzte Provision und Police im Kontakt sehen
  const won = (lead.status ?? "").trim().toLowerCase() === "abschluss";
  const [history, rates, files, postfach, me] = await Promise.all([
    loadLeadHistory(lead.id, team.userId),
    won ? loadCustomerProvision(customerId).then((p) => p.rates) : null,
    listLeadFiles(lead.id),
    postfachOf(team.userId),
    team.userId ? prisma.user.findUnique({ where: { id: team.userId }, select: { displayName: true, mailSignature: true } }) : null,
  ]);
  const vorlagen = postfach ? await loadVorlagen(customerId) : [];
  // Vorlagen nach Phase (Ole, 14.11.2026): letzter vergangener Termin, Notizen für die Gesprächszusammenfassung
  const [lastAppt, notizen] = postfach
    ? await Promise.all([
        prisma.appointment.findFirst({
          where: { leadId: lead.id, startsAt: { lte: new Date() }, status: { in: ["booked", "completed", "no_show"] } },
          orderBy: { startsAt: "desc" },
          select: { status: true },
        }),
        prisma.leadHistory.findMany({ where: { leadId: lead.id, kind: "notiz" }, orderBy: { createdAt: "desc" }, take: 3, select: { text: true } }),
      ])
    : [null, []];
  const empfohlen = passendeVorlagen({
    status: lead.status,
    contactAttempts: lead.contactAttempts,
    naechsterTermin: !!nextAppt && nextAppt.startsAt.getTime() > nowMs(),
    letzterTermin: (lastAppt?.status as "booked" | "completed" | "no_show" | undefined) ?? null,
    policeFertig: !!lead.policyDoneAt,
    spaeter: istSpaeter(lead.followUpAt, lead.followUpNote),
  });
  // E-Mail: Ansprache des Kunden und persönlicher Buchungslink für diesen Lead (Ole, 14.11.2026).
  // Steht schon ein Termin an, entfällt der Satz mit dem Link.
  const ansprache = postfach
    ? asAnsprache((await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }))?.leadAddress)
    : "sie";
  const base = appUrl();
  const terminlink = postfach && !nextAppt && cal?.status === "connected" && cal.bookingSlug && base ? `${base}/book/${cal.bookingSlug}?lead=${lead.id}` : null;
  let beitrag: string | null = null;
  let provision: string | null = null;
  // Verträge (Cross-Selling): der erste aus dem Abschluss, weitere im Kontakt eingetragen
  let contracts = won && rates ? await listLeadContracts(lead.id, rates) : [];
  if (won && rates && !contracts.some((c) => c.primary)) {
    // Abschluss ohne gespeicherten ersten Vertrag (z. B. aus dem Airtable-Abgleich): jetzt anlegen
    await syncPrimaryContract(lead.id).catch(() => null);
    contracts = await listLeadContracts(lead.id, rates);
  }
  if (won && rates) {
    const active = contracts.filter((c) => c.status === "aktiv");
    const sum = active.map((c) => contractProvision(c, rates));
    // Beitrag je Jahr; PKV als Monatsbeitrag; Tarifoptimierung hat keinen Beitrag (premium = Ersparnis)
    const premiums = active
      .filter((c) => sparteInfo(c.sparte).rateKey !== "pkv_tarif")
      .map((c) => ({ v: c.premium, monthly: sparteInfo(c.sparte).rateKey === "pkv" }))
      .filter((x) => x.v != null);
    if (premiums.length === 1) beitrag = `${formatEUR(premiums[0].v!)} ${premiums[0].monthly ? "im Monat" : "im Jahr"}`;
    else if (premiums.length > 1) beitrag = `${formatEUR(premiums.reduce((n, x) => n + x.v! * (x.monthly ? 12 : 1), 0))} im Jahr (${premiums.length} Verträge)`;
    const first = sum.reduce((s, p) => s + p.firstYear, 0);
    const trail = sum.filter((p) => p.trailFromYear2).reduce((s, p) => s + p.trailPerYear, 0);
    const missing = active.some((c) => c.premium == null && c.provisionValue == null && c.beitragssumme == null);
    if (active.length) provision = `≈ ${formatEUR(first)}${trail > 0 ? `, ab dem 2. Jahr ≈ ${formatEUR(trail)} Bestand pro Jahr` : ""}${missing ? " (Standardbeitrag)" : ""}`;
  }
  const label = WHATSAPP_STATUS_LABELS[lead.status ?? ""] ?? lead.status ?? "Neuer Lead";
  const apptFmt = (d: Date) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

  return (
    <>
      <LeadHeaderActions
        leadId={lead.id}
        name={lead.name}
        source={lead.source}
        createdAt={lead.createdAt.toISOString()}
        phone={lead.phone}
        email={lead.email}
        status={lead.status}
        statusLabel={label}
        phases={pipelinePhasesFor(whatsapp)}
        conversationId={conv?.id ?? null}
        bookingSlug={cal?.status === "connected" ? (cal.bookingSlug ?? null) : null}
        followUpAt={lead.followUpAt?.toISOString() ?? null}
        followUpNote={lead.followUpNote}
        stornoOptions={stornoOptions}
        storniert={storniert}
        canErase={canErase}
        daysInPhase={Math.max(0, Math.floor((nowMs() - lead.statusChangedAt.getTime()) / 86_400_000))}
        askAfterCall={newUi}
        mailReady={!!postfach}
      />
      {stepState === "missing" || stepState === "result_missing" ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-next-step-hint>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>{NEXT_STEP_LABEL[stepState]}.</b> {stepState === "result_missing" ? "Der Termin ist vorbei. Wie ist er gelaufen?" : "Legen Sie fest, wie es weitergeht."}
          </span>
          {team.userId ? <NextStepButton leadId={lead.id} name={lead.name ?? "Lead"} source={lead.source} appointmentId={resultMissingAppt} resultMissing={stepState === "result_missing"} /> : null}
        </div>
      ) : null}
      {team.userId ? <NextStepPrompt leadId={lead.id} name={lead.name ?? "Lead"} source={lead.source} resultMissingAppointmentId={resultMissingAppt} /> : null}
      {postfach ? (
        <LeadMailComposer
          leadId={lead.id}
          lead={{ name: lead.name, source: lead.source, salutation: salutationFromForm(formWithOverrides(lead.formData, lead.contactOverrides)), ...namePartsFromForm(formWithOverrides(lead.formData, lead.contactOverrides)) }}
          to={lead.email}
          from={postfach.email}
          meinname={postfach.fromName ?? me?.displayName ?? ""}
          signatur={me?.mailSignature ?? ""}
          ansprache={ansprache}
          terminlink={terminlink}
          vorlagen={vorlagen}
          empfohlen={empfohlen}
          termin={nextAppt ? { startsAt: nextAppt.startsAt.toISOString(), mode: nextAppt.mode, meetUrl: nextAppt.meetUrl } : null}
          beratung={{
            wuensche: wuenscheVorschlag({ produkt: lead.source, formData: lead.formData, qualificationData: conv?.qualificationData, qualificationSummary: conv?.qualificationSummary }),
            notizen: notizen.map((n) => n.text),
          }}
          dateien={files.map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind }))}
        />
      ) : null}

      {won ? (
        <AbschlussCard
          leadId={lead.id}
          closedAt={lead.closedAt?.toISOString() ?? null}
          beitrag={beitrag}
          provision={provision}
          policyDoneAt={lead.policyDoneAt?.toISOString() ?? null}
          mailVorschlag={!!postfach && vorlagen.some((v) => v.standardKey === "willkommen")}
        >
          <LeadContracts leadId={lead.id} contracts={contracts} readOnly={!team.userId} />
        </AbschlussCard>
      ) : null}

      {lead.stornoState === "review" || lead.stornoState === "rejected" ? (
        <div
          className={`mb-5 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${lead.stornoState === "review" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
        >
          {lead.stornoState === "review"
            ? `Storno eingereicht (${lead.stornoReason ?? "Grund"}), wird geprüft.`
            : `Storno abgelehnt (${lead.stornoReason ?? "Grund"}). Bei Fragen melden Sie sich gern.`}
        </div>
      ) : null}

      {conv?.needsAttention ? (
        <a
          href={`/buyer/chats?c=${conv.id}`}
          className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>Braucht dich:</b> {conv.attentionReason ?? "Bitte beim Lead melden."}
          </span>
          <span className="font-semibold">Antworten</span>
        </a>
      ) : null}

      <EmpfehlungLeadCard leadId={lead.id} team={team} readOnly={!team.userId} />

      {members.length > 1 ? (
        <LeadAssignee
          leadId={lead.id}
          current={lead.assignedUserId}
          members={members.map((m) => ({ id: m.id, name: m.displayName ?? m.email, costHint: assignCost.get(m.id) ?? null }))}
          readOnly={!team.userId}
        />
      ) : null}

      {nextAppt || conv?.qualificationSummary ? (
        <Card className="mb-6">
          {nextAppt ? (
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <CalendarClock className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{apptFmt(nextAppt.startsAt)} Uhr</div>
                <div className="text-xs text-[color:var(--muted)]">{nextAppt.mode === "video" ? "Videocall" : "Telefonat"}</div>
              </div>
              {nextAppt.mode === "video" && nextAppt.meetUrl ? (
                <ButtonLink href={nextAppt.meetUrl} variant="primary" external>
                  Videocall
                </ButtonLink>
              ) : null}
              {nextAppt.startsAt.getTime() > nowMs() ? (
                <RescheduleButton appointmentId={nextAppt.id} className={buttonClass("secondary", "sm")}>
                  Verschieben
                </RescheduleButton>
              ) : null}
            </div>
          ) : null}
          {conv?.qualificationSummary ? (
            <p className={`px-5 py-3.5 text-sm ${nextAppt ? "border-t border-[color:var(--border)]" : ""}`}>
              <span className="text-[color:var(--muted)]">Assistent: </span>
              {conv.qualificationSummary}
            </p>
          ) : null}
        </Card>
      ) : null}

      {fetchError ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Angaben konnten gerade nicht geladen werden. Bitte später noch einmal öffnen.
        </div>
      ) : null}

      {fields ? (
        <ReadOnlyCard
          fields={fields}
          source={lead.source}
          statusLabels={WHATSAPP_STATUS_LABELS}
          edit={team.userId ? <LeadStammdatenEdit leadId={lead.id} initial={stammInitial} /> : null}
        />
      ) : null}

      <LeadSequenceCard leadId={lead.id} readOnly={!!lead.erasedAt} />

      <LeadFiles leadId={lead.id} files={files} defaultKind={won ? "police" : "angebot"} />

      <LeadHistory mailReady={!!postfach} leadId={lead.id} initial={history} legacyNote={lead.notes ?? (fields ? (firstString(fields["Notizen"]) ?? null) : null)} />
    </>
  );
}

function ReadOnlyCard({
  fields,
  source,
  statusLabels = {},
  edit = null,
}: {
  fields: Record<string, unknown>;
  source: string | null;
  statusLabels?: Record<string, string>;
  /** Stift „Bearbeiten“ im Kartenkopf */
  edit?: React.ReactNode;
}) {
  const kind = detectLeadKind(source, fields);
  let group = fieldGroupFor(kind);
  // „Haltung" fragt der Funnel nur bei der Katze ab (Freigänger/Wohnung) —
  // bei Hund/Pferd ist das Feld leer und irrelevant, also ausblenden.
  if (kind === "tier") {
    const tierart = (firstString(fields["Tierart"]) ?? "").toLowerCase();
    if (!tierart.includes("katze")) {
      group = group.filter((f) => f.key !== "Haltung (Tier)");
    }
  }
  // Bei Tier- und Hundefutter-Funnels sind PLZ/Ort/Bundesland irrelevant (der
  // Funnel erfasst sie nicht) — nur die reinen Kontaktdaten zeigen.
  let common = COMMON_FIELDS;
  if (kind === "tier" || kind === "hundefutter") {
    const hide = new Set(["Postleitzahl", "Ort", "Bundesland"]);
    common = common.filter((f) => !hide.has(f.key));
  }
  const curated = [...common, ...group, ...TAIL_FIELDS];

  const rows = curated.map((def) => {
    if (def.key === "_produktEingang") {
      const name =
        firstString(fields["Zielgruppe Bezeichnung (from Produkt (Eingang))"]) ??
        firstString(fields["Produkt (Eingang)"]);
      return { def, value: name };
    }
    // Ersten belegten Feldnamen (key oder fallbackKeys) verwenden.
    let raw = fields[def.key];
    if (firstString(raw) == null && def.fallbackKeys) {
      for (const alt of def.fallbackKeys) {
        if (firstString(fields[alt]) != null) {
          raw = fields[alt];
          break;
        }
      }
    }
    const value = formatValue(raw, def.format);
    // Telefonnummer lesbar (+49 171 …).
    if (def.key === "Telefonnummer" && value) {
      return { def, value: formatPhone(value.replace(/^\+/, "")) };
    }
    return { def, value };
  })
    // Leere Felder ausblenden – nur zeigen, was es auch gibt. Status steht
    // schon im Kopf und im Bearbeiten-Block.
    .filter(
      (r) =>
        r.value != null && r.value !== "" && r.value !== "–" && r.def.key !== "Bearbeitungsstatus",
    );

  // Catch-all für fachliche Zusatzfelder, die (noch) keiner Gruppe zugeordnet
  // sind — interne/technische Felder und bereits gezeigte bleiben außen vor.
  const shownKeys = new Set<string>([
    ...curated.map((f) => f.key),
    ...COMMON_FIELDS.map((f) => f.key),
    "Produkt (Eingang)",
    "Zielgruppe Bezeichnung (from Produkt (Eingang))",
    // group-Felder, die bei diesem kind evtl. nicht in curated sind, trotzdem
    // nicht doppelt als „weitere Angabe" zeigen:
    ...ALL_GROUP_KEYS,
  ]);
  const extra = Object.entries(fields)
    .filter(
      ([k]) =>
        !shownKeys.has(k) &&
        !INTERNAL_KEYS.has(k) &&
        !k.startsWith("_") &&
        !k.includes("(from ") &&
        // Roh-Funnelfelder (…(Futter)/…(Tier)) gehören zur kuratierten Gruppe,
        // nicht in den „Weitere Angaben"-Catch-all.
        !k.includes("(Futter)") &&
        !k.includes("(Tier)") &&
        !k.includes("(KSP)") &&
        !k.includes("(Zahnzusatz)") &&
        !k.includes("(Privatschutz)"),
    )
    .map(([k, v]) => ({ key: k, value: firstString(v) }))
    .filter((r): r is { key: string; value: string } => r.value != null);

  return (
    <Card>
      <CardHeader icon={ClipboardList} title="Angaben zum Lead" actions={edit} />
      <dl className="divide-y divide-[color:var(--border)]">
        {rows.map(({ def, value }) => (
          <DetailRow key={def.label} label={def.label}>
            {value == null ? (
              <span className="text-[color:var(--muted)]">–</span>
            ) : def.format === "chip-product" ? (
              <Chip tone="lilac">{value}</Chip>
            ) : def.format === "chip-status" ? (
              <Chip tone={statusTone(value)}>{statusLabels[value] ?? value}</Chip>
            ) : (
              value
            )}
          </DetailRow>
        ))}
      </dl>
      {extra.length > 0 ? (
        <>
          <div className="bg-[color:var(--brand-soft)]/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Weitere Angaben
          </div>
          <dl className="divide-y divide-[color:var(--border)]">
            {extra.map(({ key, value }) => (
              <DetailRow key={key} label={key}>
                {value}
              </DetailRow>
            ))}
          </dl>
        </>
      ) : null}
    </Card>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-[color:var(--muted)]">{label}</dt>
      <dd className="text-sm font-medium text-[color:var(--foreground)] break-words">
        {children}
      </dd>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "lilac" | "emerald" | "amber" | "rose" | "blue" | "zinc";
}) {
  const cls = {
    lilac: "bg-violet-100 text-violet-900",
    emerald: "bg-emerald-100 text-emerald-900",
    amber: "bg-amber-100 text-amber-900",
    rose: "bg-rose-100 text-rose-900",
    blue: "bg-blue-100 text-blue-900",
    zinc: "bg-zinc-100 text-zinc-700",
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function statusTone(status: string): "emerald" | "amber" | "rose" | "blue" | "zinc" {
  const s = status.toLowerCase();
  if (s.startsWith("storno")) return "emerald";
  if (s === "abschluss") return "emerald";
  if (s === "kein interesse") return "rose";
  if (s === "termin vereinbart" || s.startsWith("angebot")) return "blue";
  if (s === "erreicht" || s === "qualifiziert") return "amber";
  return "zinc";
}


/** Termine ab 2 Stunden vor jetzt (laufende Termine bleiben sichtbar). */
function twoHoursAgo(): Date {
  return new Date(Date.now() - 2 * 60 * 60 * 1000);
}

/** Kostenhinweis je Mitglied, falls ein Lead von Hand es heute zum weiteren aktiven Verkäufer macht. */
async function assignCostHints(customerId: string, members: { id: string; receivesLeads: boolean; leadReceivedAt: Date | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { seatsIncluded: true, seatMonthly: true } });
  const price = Number(c?.seatMonthly ?? 0);
  if (c?.seatsIncluded == null || !(price > 0)) return out;
  const dayStart = berlinDayStart(new Date());
  const active = members.filter((m) => isActiveSeller(m, dayStart)).length;
  if (!addsSeatCost({ active, included: c.seatsIncluded, price })) return out;
  for (const m of members) if (!isActiveSeller(m, dayStart)) out.set(m.id, `Das Mitglied bekommt sonst keine Leads. Durch das Zuteilen zählt es heute als weiterer aktiver Verkäufer (${fmtSeatPrice(price)} im Monat, tagesgenau abgerechnet).`);
  return out;
}
