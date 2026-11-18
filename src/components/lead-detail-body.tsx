import { LeadLegalCard } from "@/components/lead-legal-card";
import { isHealthLabel, splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { AlertTriangle, ClipboardList, MessageCircle, PhoneCall } from "lucide-react";
import { NextStepButton, NextStepPrompt } from "@/components/next-step";
import { NEXT_STEP_LABEL, pastOpenAppointmentWhere } from "@/lib/lead-next-step";
import { nextStepStateOf } from "@/lib/lead-next-step-server";
import { EmpfehlungLeadCard } from "@/components/empfehlung/server";
import { Card, CardHeader } from "@/components/ui";
import { TerminKarte } from "@/components/termin-karte";
import { EinwilligungEtikett } from "@/components/einwilligung-kontakt";
import { einwilligungStand } from "@/lib/einwilligung-stand";
import { optOutHash } from "@/lib/bestand/links";
import { angebotOffen, terminKartenAktionen } from "@/lib/termin-karte";
import { formatPhone } from "@/lib/format";
import { pipelinePhasesFor, WHATSAPP_STATUS_LABELS } from "@/lib/products";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { qualificationPoints } from "@/lib/whatsapp/qualification";
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
import { listUnterlagen } from "@/lib/policen/server";
import { mailFeaturesOffFor, postfachOf } from "@/lib/mail/postfach";
import { leadVersandKontext, resendBereit } from "@/lib/mail/lead-versand";
import { leadAnzeigename, leadSignatur } from "@/lib/mail/lead-absender";
import { loadVorlagen } from "@/lib/mail/vorlagen";
import { passendeVorlagen } from "@/lib/mail/phasen";
import { istSpaeter } from "@/lib/mail/termin-erinnerung";
import { wuenscheVorschlag } from "@/lib/mail/beratung";
import { LeadMailComposer } from "@/components/lead-mail";
import { anredeRohAusForm, asAnsprache, namePartsFromForm } from "@/lib/ansprache";
import { bookingPageUrl } from "@/lib/public-url";
import { LeadFiles } from "@/components/lead-files";
import { LeadStammdatenEdit } from "@/components/lead-stammdaten-edit";
import { applyStammdatenToFields, currentStammdaten, formWithOverrides } from "@/lib/lead-stammdaten";
import { loadCustomerProvision } from "@/lib/provision-server";
import { contractProvision, sparteInfo } from "@/lib/provision";
import { listLeadContracts, syncPrimaryContract } from "@/lib/vertraege";
import { LeadContracts } from "@/components/lead-contracts";
import { anrufZiel } from "@/lib/anruf-ziel";
import { BestehendeVertraege } from "@/components/bestehende-vertraege";
import { vorvertraegeAus } from "@/lib/whatsapp/vorvertraege";
import { lebenssituationAus } from "@/lib/whatsapp/gespraech";
import { waOhneMarker } from "@/lib/wa-format";
import { LeadSequenceCard } from "@/components/lead-sequence-card";
import { angebotStandText } from "@/lib/angebot-senden";
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
      isTest: true,
      id: true,
      airtableId: true,
      name: true,
      source: true,
      status: true,
      createdAt: true,
      phone: true,
      email: true,
      weitereEmails: true,
      formData: true,
      contactOverrides: true,
      contactEditedAt: true,
      vorvertraege: true,
      contactAttempts: true,
      reached: true,
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
      externalId: true,
      waConsent: true,
      consentData: true,
      waUnavailableAt: true,
      waUnavailableMailAt: true,
    },
  });
  if (!lead) notFound();
  if (lead.erasedAt) {
    // Gesetzliche Aufbewahrung (Paket M5, lib/erasure.ts): nur die Beratungsdokumentation bleibt als Nachweis
    const aufbewahrt = await prisma.leadFile.findMany({
      where: { leadId: lead.id, kind: "beratungsdoku" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, createdAt: true, aufbewahrenBis: true },
    });
    return (
      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-5 py-6 text-sm text-[color:var(--muted)]">
        Die Daten dieses Leads wurden am {formatDate(lead.erasedAt)} auf Wunsch gelöscht. Für Abrechnung und Zahlen bleibt nur ein anonymer Eintrag.
        {aufbewahrt.length ? (
          <ul className="mt-3 space-y-1" data-aufbewahrt>
            {aufbewahrt.map((f) => (
              <li key={f.id}>
                <a href={`/api/buyer/leads/${lead.id}/dateien/${f.id}`} target="_blank" rel="noopener" className="font-medium text-[color:var(--brand)] hover:underline">
                  Beratungsdokumentation vom {formatDate(f.createdAt)}
                </a>
                {f.aufbewahrenBis ? <> · gesetzliche Aufbewahrung bis {formatDate(f.aufbewahrenBis)}</> : null}
              </li>
            ))}
          </ul>
        ) : null}
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
  // Weitere E-Mail-Adressen (z. B. bisherige, als der Lead im Chat eine neue nannte) unter der Haupt-E-Mail
  if (fields && lead.weitereEmails.length) fields["Weitere E-Mail"] = lead.weitereEmails.join(", ");
  // Gesundheitsangaben nur vertraulich in eigener Karte (lib/gesundheitsdaten.ts), nicht unter „Weitere Angaben“
  const health: { label: string; value: string }[] = Array.isArray(lead.formData)
    ? splitHealthAnswers(
        (lead.formData as unknown[]).flatMap((x) =>
          x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string" && typeof (x as { value?: unknown }).value === "string"
            ? [{ label: (x as { label: string }).label, value: (x as { value: string }).value }]
            : [],
        ),
      ).health
    : [];
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (!isHealthLabel(k) && !health.some((h) => h.label === k)) continue;
      const value = firstString(v) ?? (v == null ? "" : String(v));
      if (value && !health.some((h) => h.label === k)) health.push({ label: k, value });
      delete fields[k];
    }
  }
  const stamm = currentStammdaten(lead, fields);
  const stammInitial = {
    salutation: stamm.salutation ?? "",
    firstName: stamm.firstName,
    lastName: stamm.lastName,
    phone: stamm.phone ? formatPhone(stamm.phone) : "",
    email: stamm.email ?? "",
    weitereEmails: stamm.weitereEmails,
    street: stamm.street,
    zip: stamm.zip,
    city: stamm.city,
  };

  const whatsapp = await hasWhatsAppInbox(customerId);
  const waConnected = (await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }))?.status === "connected";
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
      select: TERMIN_SELECT,
    }),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, bookingSlug: true } }),
    // Nächster Schritt (lib/lead-next-step.ts): Hinweis im Kontakt und Dialog nach jeder Aktion
    nextStepStateOf(lead.id),
    prisma.appointment.findFirst({ where: { leadId: lead.id, ...pastOpenAppointmentWhere(new Date(nowMs())) }, orderBy: { startsAt: "desc" }, select: TERMIN_SELECT }),
  ]);
  // Einwilligung (lib/einwilligung-stand.ts): Häkchen im Formular, „STOPP“ und Abmeldungen (Sperrliste des Vermittlers)
  const [stopp, abmeldungen] = await Promise.all([
    prisma.conversation.findFirst({
      where: { customerId, optedOutAt: { not: null }, OR: [{ leadId: lead.id }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
      orderBy: { optedOutAt: "asc" },
      select: { optedOutAt: true },
    }),
    lead.email || lead.phone
      ? prisma.bestandOptOut.findMany({
          where: {
            customerId,
            OR: [...(lead.email ? [{ kind: "email", hash: optOutHash("email", lead.email) }] : []), ...(lead.phone ? [{ kind: "phone", hash: optOutHash("phone", lead.phone) }] : [])],
          },
          orderBy: { createdAt: "asc" },
          select: { scope: true, createdAt: true },
        })
      : [],
  ]);
  const einwilligung = einwilligungStand({
    waConsent: lead.waConsent,
    consentData: lead.consentData,
    meta: !!lead.externalId,
    whatsappStoppAt: stopp?.optedOutAt ?? null,
    mailAbgemeldetAt: abmeldungen.find((o) => o.scope !== "all")?.createdAt ?? null,
    alleAbgemeldetAt: abmeldungen.find((o) => o.scope === "all")?.createdAt ?? null,
  });
  // Angaben des Assistenten ohne das, was schon im Leadformular steht (UX, Ole 15.11.2026: nicht doppelt)
  const werteAus = (x: unknown): string[] =>
    typeof x === "string"
      ? [x]
      : Array.isArray(x)
        ? x.flatMap(werteAus)
        : x && typeof x === "object"
          ? Object.values(x as Record<string, unknown>).flatMap(werteAus)
          : [];
  const formWerte = new Set([...werteAus(formWithOverrides(lead.formData, lead.contactOverrides)), ...werteAus(fields)].map((v) => v.trim().toLowerCase()));
  const vorvertraege = (() => {
    const v = vorvertraegeAus(lead.vorvertraege);
    return v && (v.liste.length || v.keine) ? v : null;
  })();
  const qPoints = qualificationPoints(conv?.qualificationData).filter((q) => !formWerte.has(q.value.trim().toLowerCase()));
  // Wiedervorlage des Assistenten (schedule_followup), sichtbar unter den Aktionen
  const recallSeq = await prisma.leadSequence.findFirst({ where: { leadId: lead.id, kind: "recall", stoppedAt: null }, select: { nextAt: true, log: true } });
  const recallNote = Array.isArray(recallSeq?.log)
    ? ((recallSeq.log as { action?: string; detail?: string }[]).find((e) => e?.action === "plan")?.detail?.match(/„(.+)“/)?.[1] ?? null)
    : null;
  const botRecall = recallSeq?.nextAt ? { at: recallSeq.nextAt.toISOString(), note: recallNote } : null;
  const resultMissingAppt = stepState === "result_missing" ? (pastAppt?.id ?? null) : null;
  // Terminkarte unter den Aktionen (lib/termin-karte.ts): kommender bzw. laufender Termin, sonst der vergangene ohne Ergebnis
  const kartenTermin = nextAppt ?? (resultMissingAppt ? pastAppt : null);
  const storniert = !!lead.status?.toLowerCase().startsWith("storno");
  // Abschluss (Ole, 13.11.2026): Beitrag, geschätzte Provision und Police im Kontakt sehen
  const won = (lead.status ?? "").trim().toLowerCase() === "abschluss";
  // Was beim nächsten Anruf zu tun ist, auf einen Blick (Ole, 16.11.2026; gleiche Regeln wie die Anrufliste).
  // Nur bei offenen Kontakten ohne anstehenden Termin und ohne fehlendes Termin-Ergebnis.
  const verloren = ["kein interesse", "disqualifiziert"].includes((lead.status ?? "").trim().toLowerCase());
  const gesprochen = lead.reached || !!lead.followUpAt || lead.status === "Angebot gesendet";
  const zielOffen = !storniert && !won && !verloren && !nextAppt && stepState !== "result_missing" && !lead.erasedAt;
  // Letzter vergangener Termin (nicht abgesagt): Nachfassen konkret „An den Termin vom … anknüpfen“
  const letzterTermin = zielOffen
    ? ((await prisma.appointment.findFirst({ where: { leadId: lead.id, startsAt: { lt: new Date(nowMs()) }, status: { not: "cancelled" } }, orderBy: { startsAt: "desc" }, select: { startsAt: true } }))?.startsAt ?? null)
    : null;
  const ziel =
    zielOffen
      ? anrufZiel({
          letzterTermin,
          kind: gesprochen ? "followup" : "callback",
          reason: lead.followUpNote ?? (lead.status === "Angebot gesendet" ? "Angebot nachfassen" : (conv?.attentionReason ?? "")),
          source: lead.source,
          known: conv?.qualificationSummary ?? null,
        })
      : null;
  const [history, rates, files, postfachRaw, me, mailOff, unterlagen, angebotStaende] = await Promise.all([
    loadLeadHistory(lead.id, team.userId),
    won ? loadCustomerProvision(customerId).then((p) => p.rates) : null,
    listLeadFiles(lead.id),
    postfachOf(team.userId),
    team.userId ? prisma.user.findUnique({ where: { id: team.userId }, select: { displayName: true, mailSignature: true } }) : null,
    mailFeaturesOffFor(customerId),
    // Unterlagen vom Kunden per WhatsApp (lib/policen); Admin-Vorschau ohne Inhalte mit Gesundheitsbezug
    listUnterlagen(lead.id, { preview: !team.userId }),
    // Kennzeichen „Angebot abgelegt am“ / „gesendet am“ an der Datei (Paket P3, lib/angebot-senden.ts)
    prisma.appointment.findMany({
      where: { leadId: lead.id, angebotDateiId: { not: null } },
      orderBy: { startsAt: "desc" },
      take: 10,
      select: { angebotDateiId: true, angebotAbgelegtAt: true, angebotGesendetAt: true, angebotVersand: true, angebotKanaele: true },
    }),
  ]);
  const angebotStand = new Map<string, string>();
  for (const t of angebotStaende) {
    const text = angebotStandText({ abgelegtAt: t.angebotAbgelegtAt, gesendetAt: t.angebotGesendetAt, versand: t.angebotVersand, kanaele: t.angebotKanaele });
    if (t.angebotDateiId && text && !angebotStand.has(t.angebotDateiId)) angebotStand.set(t.angebotDateiId, text);
  }
  // E-Mail an den Lead (Pakete M0/M1, Ole 17.11.2026): Dialog immer. Über die App aus dem eigenen Postfach, sonst von
  // unserer Versanddomain mit „Name | Agentur“; „Meine Gesellschaft erlaubt das nicht“ (mailOff): nur eigenes
  // Mailprogramm und Kopieren.
  const postfach = mailOff ? null : postfachRaw;
  const vorlagen = await loadVorlagen(customerId);
  // Vorlagen nach Phase (Ole, 14.11.2026): letzter vergangener Termin, Notizen für die Gesprächszusammenfassung
  const [lastAppt, notizen, versand, customerAn] = await Promise.all([
    prisma.appointment.findFirst({
      where: { leadId: lead.id, startsAt: { lte: new Date() }, status: { in: ["booked", "completed", "no_show"] } },
      orderBy: { startsAt: "desc" },
      select: { status: true },
    }),
    prisma.leadHistory.findMany({ where: { leadId: lead.id, kind: "notiz" }, orderBy: { createdAt: "desc" }, take: 3, select: { text: true } }),
    leadVersandKontext(customerId, { leadId: lead.id, schreiber: team.userId, nurLesen: true }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }),
  ]);
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
  const ansprache = asAnsprache(customerAn?.leadAddress);
  const terminlink = !nextAppt && cal?.status === "connected" && cal.bookingSlug ? bookingPageUrl(cal.bookingSlug, { lead: lead.id }) : null;
  const appVersand = !mailOff && (!!postfach || resendBereit());
  // Signatur im Text: eigene des Postfachs, sonst aus den Anbieterangaben (wie beim automatischen Versand)
  const mailSignatur = (postfach ? me?.mailSignature?.trim() : "") || leadSignatur(versand.daten).text;
  const mailVon = !appVersand
    ? "Über Ihr eigenes Mailprogramm"
    : postfach
      ? `Von ${postfach.email}`
      : `Von ${leadAnzeigename(versand.daten.name, versand.daten.agentur)}, Antworten an Sie`;
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
  // Kein WhatsApp (lib/whatsapp/kein-whatsapp.ts), solange der Lead nicht selbst geschrieben hat
  const noWhatsApp =
    !!lead.waUnavailableAt &&
    (await prisma.message.count({ where: { direction: "inbound", conversation: { customerId, OR: [{ leadId: lead.id }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] } } })) === 0;
  // „Heute, 10:00“ / „Morgen, 10:00“ wie auf „Heute“ (UX Runde 4), sonst „Mo., 23.11., 10:00“
  const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  const apptFmt = (d: Date) => {
    const uhr = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
    if (berlinTag(d) === berlinTag(new Date(nowMs()))) return `Heute, ${uhr}`;
    if (berlinTag(d) === berlinTag(new Date(nowMs() + 86_400_000))) return `Morgen, ${uhr}`;
    return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  };

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
        botRecall={botRecall}
        stornoOptions={stornoOptions}
        storniert={storniert}
        canErase={canErase}
        isTest={lead.isTest}
        daysInPhase={Math.max(0, Math.floor((nowMs() - lead.statusChangedAt.getTime()) / 86_400_000))}
        askAfterCall={newUi}
        mailReady={!!postfach}
        mailOff={mailOff}
        whatsappConnected={waConnected}
        hasUpcomingAppointment={!!nextAppt && nextAppt.startsAt.getTime() > nowMs()}
        nameZusatz={<EinwilligungEtikett stand={einwilligung} />}
        anrufenNeutral={!!kartenTermin}
      />
      {kartenTermin ? (
        <TerminKarte
          t={{
            id: kartenTermin.id,
            wann: apptFmt(kartenTermin.startsAt),
            mode: kartenTermin.mode,
            meetUrl: kartenTermin.meetUrl,
            zugesagt: !!kartenTermin.confirmedAt,
            komplettcheck: !!kartenTermin.komplettcheck,
            erschienen: kartenTermin.attendance === "erschienen",
            begonnen: kartenTermin.startsAt.getTime() <= nowMs(),
          }}
          a={terminKartenAktionen(kartenTermin, { now: new Date(nowMs()), telefon: !!lead.phone, angebotOffen: angebotOffen(lead.status) })}
          leadId={lead.id}
          name={lead.name ?? "Lead"}
          source={lead.source}
          phone={lead.phone}
          mailReady={!!postfach}
        />
      ) : null}
      {/* „Ergebnis fehlt“ übernimmt die Terminkarte („Ergebnis eintragen“) */}
      {stepState === "missing" || (stepState === "result_missing" && !kartenTermin) ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-next-step-hint>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>{NEXT_STEP_LABEL[stepState]}.</b> {stepState === "result_missing" ? "Der Termin ist vorbei. Wie ist er gelaufen?" : "Legen Sie fest, wie es weitergeht."}
          </span>
          {team.userId ? <NextStepButton leadId={lead.id} name={lead.name ?? "Lead"} source={lead.source} appointmentId={resultMissingAppt} resultMissing={stepState === "result_missing"} /> : null}
        </div>
      ) : null}
      {team.userId ? <NextStepPrompt leadId={lead.id} name={lead.name ?? "Lead"} source={lead.source} resultMissingAppointmentId={resultMissingAppt} /> : null}
      {lead.erasedAt ? null : (
        <LeadMailComposer
          leadId={lead.id}
          lead={{ name: lead.name, source: lead.source, salutation: anredeRohAusForm(formWithOverrides(lead.formData, lead.contactOverrides)), ...namePartsFromForm(formWithOverrides(lead.formData, lead.contactOverrides)) }}
          to={lead.email}
          from={mailVon}
          appVersand={appVersand}
          meinname={postfach?.fromName ?? me?.displayName ?? versand.daten.name}
          signatur={mailSignatur}
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
      )}

      {won ? (
        <AbschlussCard
          leadId={lead.id}
          closedAt={lead.closedAt?.toISOString() ?? null}
          beitrag={beitrag}
          provision={provision}
          policyDoneAt={lead.policyDoneAt?.toISOString() ?? null}
          mailVorschlag={!lead.erasedAt && vorlagen.some((v) => v.standardKey === "willkommen")}
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

      {noWhatsApp ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900" data-kein-whatsapp>
          <PhoneCall className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>Kein WhatsApp:</b> Diese Nummer ist nicht per WhatsApp erreichbar, der Assistent schreibt nicht. Bitte direkt anrufen.
            {lead.waUnavailableMailAt ? " Eine E-Mail mit Ihrem Terminlink ist raus." : ""}
          </span>
          {lead.phone ? (
            <a href={`tel:+${lead.phone}`} className="font-semibold">
              {formatPhone(lead.phone)} anrufen
            </a>
          ) : null}
        </div>
      ) : null}

      {conv?.needsAttention ? (
        <a
          href={`/buyer/chats?c=${conv.id}`}
          className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>Wartet auf Sie:</b> {waOhneMarker(conv.attentionReason) ?? "Bitte beim Kontakt melden."}
          </span>
          <span className="font-semibold">Antworten</span>
        </a>
      ) : null}

      <EmpfehlungLeadCard leadId={lead.id} team={team} readOnly={!team.userId} />

      <LeadLegalCard einwilligung={einwilligung} health={health} />

      {members.length > 1 ? (
        <LeadAssignee
          leadId={lead.id}
          current={lead.assignedUserId}
          members={members.map((m) => ({ id: m.id, name: m.displayName ?? m.email, costHint: assignCost.get(m.id) ?? null }))}
          readOnly={!team.userId}
        />
      ) : null}

      {ziel || conv?.qualificationSummary || qPoints.length || vorvertraege ? (
        <Card className="mb-6">
          {ziel ? (
            <div className="px-5 py-3.5" data-kontakt-ziel>
              <div className="text-sm font-semibold text-[color:var(--muted)]">
                Ziel: <span className="text-[color:var(--foreground)]">{ziel.ziel}</span>
              </div>
              <ol className="mt-1.5 space-y-1 text-sm">
                {ziel.schritte.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-semibold text-[color:var(--brand-dark)]">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {conv?.qualificationSummary ? (
            <p className={`px-5 py-3.5 text-sm ${ziel ? "border-t border-[color:var(--border)]" : ""}`}>
              <span className="text-[color:var(--muted)]">Assistent: </span>
              {conv.qualificationSummary}
            </p>
          ) : null}
          {/* Einzelne Angaben des Assistenten, z. B. fürs Privatschutz-Angebot (Ole, 15.11.2026) */}
          {qPoints.length ? (
            <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-5 py-3.5 text-sm ${ziel || conv?.qualificationSummary ? "border-t border-[color:var(--border)]" : ""}`} data-lead-angaben>
              {qPoints.map((q) => (
                <div key={q.key} className="contents">
                  <dt className="text-[color:var(--muted)]">{q.label}</dt>
                  <dd className="min-w-0 break-words">{q.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {/* Bestehende Verträge laut Lead (Komplettcheck im Chat, Ole 17.11.2026) */}
          {vorvertraege ? (
            <BestehendeVertraege
              v={vorvertraege}
              lebenssituation={lebenssituationAus(
                ((x) => (Array.isArray(x) ? x.filter((f): f is { label: string; value: string } => typeof f?.label === "string" && typeof f?.value === "string") : []))(formWithOverrides(lead.formData, lead.contactOverrides)),
                conv?.qualificationData,
              )}
              className="border-t border-[color:var(--border)] px-5 py-3.5 text-sm"
            />
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
          nameImTitel={!!lead.name}
        />
      ) : null}

      <LeadSequenceCard leadId={lead.id} readOnly={!!lead.erasedAt} />

      <LeadFiles leadId={lead.id} files={files.map((f) => ({ ...f, stand: angebotStand.get(f.id) ?? null }))} unterlagen={unterlagen} defaultKind={won ? "police" : "angebot"} />

      <LeadHistory mailReady={!lead.erasedAt} leadId={lead.id} initial={history} legacyNote={lead.notes ?? (fields ? (firstString(fields["Notizen"]) ?? null) : null)} />
    </>
  );
}

function ReadOnlyCard({
  fields,
  source,
  statusLabels = {},
  edit = null,
  nameImTitel = false,
}: {
  fields: Record<string, unknown>;
  source: string | null;
  /** Name steht schon als Überschrift: Vorname und Nachname nicht noch einmal (16.11.2026) */
  nameImTitel?: boolean;
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
  if (nameImTitel) common = common.filter((f) => f.key !== "Vorname" && f.key !== "Nachname");
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
      <CardHeader icon={ClipboardList} title="Angaben" actions={edit} />
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
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-2.5 sm:grid-cols-[200px_1fr] sm:gap-4 sm:py-3">
      <dt className="hyphens-auto text-sm text-[color:var(--muted)] [overflow-wrap:anywhere]">{label}</dt>
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


const TERMIN_SELECT = { id: true, startsAt: true, endsAt: true, mode: true, meetUrl: true, confirmedAt: true, komplettcheck: true, attendance: true } as const;

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
