import { splitHealthAnswers } from "@/lib/gesundheitsdaten";
import Link from "next/link";
import { ArrowLeft, Bot, Check, ChevronDown, ChevronRight, MessageCircle, Phone, Search, SendHorizontal } from "lucide-react";
import { redirect } from "next/navigation";
import { NewMessageHint, StickToBottom } from "@/components/live-refresh";
import { lastInboundAt } from "@/lib/live";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass } from "@/components/ui";
import { chooseFollowup } from "@/lib/whatsapp/followup";
import { SubmitButton } from "@/components/submit-button";
import { getBuyerContext } from "@/lib/buyer-context";
import { appointmentScope, conversationScope } from "@/lib/team";
import { formatDateTime, formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { displayProduct, statusLabel } from "@/lib/products";
import { hasWhatsAppInbox, showChatsTeaser } from "@/lib/whatsapp/access";
import { selfConnectEnabled } from "@/lib/whatsapp/dialog360-partner";
import { RescheduleButton } from "@/components/reschedule-dialog";
import {
  followupBuyerAction,
  markChatDoneBuyerAction,
  sendReplyBuyerAction,
  takeAsLeadBuyerAction,
  toggleBotBuyerAction,
} from "../chat-actions";
import { nowMs } from "@/lib/now";
import { NextStepButton, NextStepPrompt } from "@/components/next-step";
import { AnrufLink } from "@/components/call-outcome";
import { isNewUi } from "@/lib/new-ui";
import { nextStepStateOf } from "@/lib/lead-next-step-server";
import { pastOpenAppointmentWhere } from "@/lib/lead-next-step";
import { qualificationPoints } from "@/lib/whatsapp/qualification";
import { terminArtKurz } from "@/lib/termin-art";
import { kalenderblatt, listenZeit, phasenPunkt, sparten, terminKurz, uhrzeit } from "@/lib/chat-ansicht";
import { chatKopfTermin, chatNaechsterSchritt, KOPF_STATT_LEISTE, type ChatSchritt } from "@/lib/chat-naechster-schritt";
import { ChatAvatar, ChatVerlauf, NichtZugestellt, StatusPunkt } from "@/components/chat/chat-verlauf";
import { ChatDetailsKnopf, MerkFormular, SchreibHinweis, SprungKnopf, TerminBuchenKnopf } from "@/components/chat/chat-knoepfe";
import { cn } from "@/lib/utils";
import { waFormatKnoten, waOhneMarker } from "@/lib/wa-format";

// WhatsApp-Chats im Kunden-CRM. Nur für Kunden mit WhatsApp-Assistent.
// Strikte Mandantentrennung: alle Abfragen mit customerId des Buyers.
// Gestaltung (Ole, 17.11.2026, Entwurf docs/ux/chat-neu): Liste links, Chat in der Mitte mit drei klar
// unterscheidbaren Absendern, rechts „Nächster Schritt“, Termin, Anfrage, Angaben fürs Angebot, Kontakt.
// Handy: Liste und Chat als zwei Ansichten, der nächste Schritt steht oben im Chat, der Rest unter „Details“.
// Handy (Ole, 18.11.2026): mehr Platz für den Chat. Details per Tipp auf den Namen (Blatt), Termin in der zweiten
// Kopfzeile, „Vorbereiten“ als kleiner Knopf neben „Anrufen“ (24 Stunden vorher), Schreib-Hinweis nur anfangs.
export const dynamic = "force-dynamic";
export const metadata = { title: "Chats | performancegrowth" };

type SearchParams = Promise<{ c?: string; err?: string; f?: string; q?: string; schritt?: string }>;

const ERRORS: Record<string, string> = {
  window:
    "Der Lead hat seit über 24 Stunden nicht geschrieben. WhatsApp erlaubt dann keine freie Nachricht. Bitte anrufen.",
  send: "Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen.",
  preview: "In der Vorschau sind Änderungen deaktiviert.",
  template:
    "Die WhatsApp-Vorlage für diese Nachfass-Situation ist noch nicht von Meta freigegeben. Wir reichen sie automatisch ein, bis dahin bitte anrufen.",
  followup_blocked: "Nachfassen ist in dieser Situation nicht sinnvoll, siehe Hinweis unten.",
  lead: "Der Kontakt konnte nicht als Lead übernommen werden. Bitte später erneut versuchen.",
  neuer_kontakt: "Der Assistent antwortet erst, wenn Sie den Kontakt als Lead übernehmen.",
};

/** Termin gilt als vorbei (nicht mehr in der Karte), wenn er zu Ende ist. */
const TERMIN_DAUER_MS = 60 * 60 * 1000;

function parseFormAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) =>
    x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string"
      ? [{ label: x.label as string, value: x.value as string }]
      : [],
  );
}

export default async function BuyerChatsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (!(await hasWhatsAppInbox(ctx.customerId))) {
    // Neue Oberfläche mit Software: „Chats“ schon vor dem Verbinden zeigen, mit Weg zum Verbinden.
    if (!(await showChatsTeaser(ctx.customerId))) redirect("/buyer/leads");
    const selfConnect = selfConnectEnabled() && ctx.teamRole === "owner";
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <PageHeader title="Nachrichten" subtitle="WhatsApp-Gespräche mit Ihren Kontakten" />
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-center shadow-[var(--shadow-sm)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-soft,#eef3ff)] text-[color:var(--brand)]">
            <MessageCircle className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-base font-semibold">WhatsApp ist noch nicht verbunden</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[color:var(--muted)]">
            Sobald Ihre Nummer verbunden ist, schreibt Ihr Assistent jeden neuen Lead in wenigen Minuten an. Alle Gespräche
            sehen Sie hier, und können jederzeit selbst antworten.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {selfConnect ? (
              <Link href="/buyer/einrichtung?schritt=whatsapp#whatsapp" className={buttonClass("primary")}>
                WhatsApp verbinden
              </Link>
            ) : ctx.teamRole === "owner" ? (
              <Link href="/buyer/einrichtung" className={buttonClass("primary")}>
                Zur Einrichtung
              </Link>
            ) : null}
          </div>
          {!selfConnect ? (
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              {ctx.teamRole === "owner" ? "Wir verbinden WhatsApp gemeinsam mit Ihnen bei der Einrichtung." : "Die Verbindung richtet der Inhaber ein."}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const activeId = sp.c ?? null;
  const error = sp.err ? (ERRORS[sp.err] ?? null) : null;
  const now = nowMs();

  const filter = sp.f === "attention" ? "attention" : "all";
  const q = (sp.q ?? "").trim();
  const qDigits = q.replace(/\D/g, "");
  // Links in der Liste behalten Filter + Suche.
  const listQs = new URLSearchParams({
    ...(filter === "attention" ? { f: "attention" } : {}),
    ...(q ? { q } : {}),
  }).toString();
  const attentionTotal = await prisma.conversation.count({
    where: { ...conversationScope(ctx), needsAttention: true },
  });

  const conversations = await prisma.conversation.findMany({
    where: {
      ...conversationScope(ctx),
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
      lead: { select: { status: true } },
      messages: {
        where: { direction: { in: ["inbound", "outbound"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true, sentBy: true },
      },
    },
  });

  // Hinweis „Neue Nachricht“, wenn in einem anderen Chat etwas eingeht (components/live-refresh.tsx)
  const inbound = await lastInboundAt(conversations.map((c) => c.id));
  const hintItems = conversations.map((c) => ({
    id: c.id,
    name: c.contactName ?? formatPhone(c.contactPhone),
    href: `/buyer/chats?c=${c.id}${listQs ? `&${listQs}` : ""}`,
    inboundAt: inbound.get(c.id) ?? null,
  }));

  // Aktiven Chat NUR mit customerId laden (Mandantentrennung).
  const active = activeId
    ? await prisma.conversation.findFirst({
        where: { id: activeId, ...conversationScope(ctx) },
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
          qualificationData: true,
          windowExpiresAt: true,
          optedOutAt: true,
          lead: {
            select: { id: true, name: true, source: true, status: true, formData: true, createdAt: true, followUpAt: true, followUpNote: true },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, direction: true, kind: true, body: true, sentBy: true, sentByUserId: true, status: true, createdAt: true },
          },
        },
      })
    : null;

  const terminWhere = active
    ? { ...appointmentScope(ctx), OR: [{ conversationId: active.id }, ...(active.lead ? [{ leadId: active.lead.id }] : [])] }
    : null;
  const [alleTermine, stepState, ergebnisTermin] = !active
    ? ([[], "none", null] as const)
    : await Promise.all([
        prisma.appointment.findMany({
          where: terminWhere!,
          orderBy: { startsAt: "asc" },
          select: { id: true, status: true, startsAt: true, endsAt: true, mode: true, meetUrl: true, confirmedAt: true, komplettcheck: true, preparedAt: true },
        }),
        active.lead ? nextStepStateOf(active.lead.id, new Date(now)) : ("none" as const),
        active.lead
          ? prisma.appointment.findFirst({ where: { leadId: active.lead.id, ...pastOpenAppointmentWhere(new Date(now)) }, orderBy: { startsAt: "desc" }, select: { id: true } })
          : null,
      ]);
  // Gebuchte Termine, die noch nicht zu Ende sind (Karte „Termin“ und nächster Schritt)
  const appointments = alleTermine.filter((a) => a.status === "booked" && (a.endsAt?.getTime() ?? a.startsAt.getTime() + TERMIN_DAUER_MS) > now);
  const terminZeiten = new Map(alleTermine.map((a) => [a.id, a.startsAt]));

  // Gesundheitsangaben vertraulich nur im Kontakt (lib/gesundheitsdaten.ts)
  const { normal: formAnswers, health: healthAnswers } = splitHealthAnswers(parseFormAnswers(active?.lead?.formData));
  const windowOpen = !!active?.windowExpiresAt && active.windowExpiresAt.getTime() > now;
  const followup = active && !windowOpen ? await chooseFollowup(active.id) : null;
  // „Anrufen“ wie im Kontakt (Ole, 17.11.2026): Assistent pausiert, danach „Wie lief es?“ (components/call-outcome.tsx)
  const anrufLead =
    active?.lead && (await isNewUi(ctx.customerId))
      ? { id: active.lead.id, name: active.contactName ?? active.lead.name ?? "Lead", source: active.lead.source, followUp: !!active.lead.followUpAt }
      : null;

  const name = active ? (active.contactName ?? formatPhone(active.contactPhone)) : "";
  // Handy-Kopfzeile: „Termin heute 11:00“ und „Vorbereiten“ (24 Stunden vorher bzw. während des Termins)
  const kopfTermin = chatKopfTermin(appointments[0] ?? null, now);
  // Hinweis „Wenn Sie schreiben, pausiert …“: am Handy weg, sobald der Vermittler hier schon selbst geschrieben hat
  const selbstGeschrieben = !!active?.messages.some((m) => m.sentBy === "agent" && (!ctx.userId || m.sentByUserId === ctx.userId));
  const schritt: ChatSchritt | null = active
    ? chatNaechsterSchritt({
        leadId: active.lead?.id ?? null,
        status: active.lead?.status ?? null,
        stepState,
        botActive: active.botActive,
        wartet: active.needsAttention ? { grund: waOhneMarker(active.attentionReason) ?? null } : null,
        fensterOffen: windowOpen,
        optOut: !!active.optedOutAt,
        termin: appointments[0] ?? null,
        ergebnisTerminId: ergebnisTermin?.id ?? null,
        wiedervorlage: active.lead?.followUpAt ? { at: active.lead.followUpAt, note: active.lead.followUpNote } : null,
        nachfassenBereit: followup?.kind === "ok" && !!followup.approved,
        now,
      })
    : null;

  // Angaben fürs Angebot: Leadformular, dann Angaben des Assistenten (ohne Doppeltes, wie im Kontakt)
  const qPoints = qualificationPoints(active?.qualificationData);
  const formWerte = new Set(formAnswers.map((a) => a.value.trim().toLowerCase()));
  const angaben = [
    ...formAnswers.map((a) => ({ key: `f:${a.label}`, label: a.label, value: a.value })),
    ...qPoints.filter((p) => p.key !== "interesse" && !formWerte.has(p.value.trim().toLowerCase())).map((p) => ({ key: `q:${p.key}`, label: p.label, value: p.value })),
  ];
  const chips = active?.lead
    ? [
        ...(active.lead.source ? [{ label: displayProduct(active.lead.source), gruen: false }] : []),
        ...sparten(qPoints.find((p) => p.key === "interesse")?.value, active.lead.source ? displayProduct(active.lead.source) : null).map((s) => ({ label: s, gruen: false })),
        ...(appointments.some((a) => a.komplettcheck) ? [{ label: "Komplettcheck", gruen: true }] : []),
      ]
    : [];

  /** Hauptknopf des nächsten Schritts. kompakt: Handy-Leiste oben im Chat. */
  const schrittKnopf = (s: ChatSchritt, kompakt: boolean) => {
    if (!active || !s.knopf) return null;
    const cls = kompakt ? buttonClass("primary", "sm", "shrink-0") : buttonClass("primary", "md", "w-full");
    switch (s.art) {
      case "lead_uebernehmen":
        return (
          <form action={takeAsLeadBuyerAction} className={kompakt ? "shrink-0" : ""}>
            <input type="hidden" name="conversationId" value={active.id} />
            <SubmitButton pendingLabel="…" className={cls}>
              {s.knopf}
            </SubmitButton>
          </form>
        );
      case "ergebnis":
      case "festlegen":
        return active.lead ? (
          <NextStepButton
            leadId={active.lead.id}
            name={name}
            source={active.lead.source}
            appointmentId={s.art === "ergebnis" ? (ergebnisTermin?.id ?? null) : null}
            resultMissing={s.art === "ergebnis"}
            label={s.knopf}
            className={cn(cls, "border-transparent sm:px-4 sm:py-0 [&>svg]:hidden", kompakt ? "sm:h-8" : "sm:h-10 sm:text-sm")}
          />
        ) : null;
      case "antworten":
        return (
          <SprungKnopf ziel="antwort" className={cls}>
            {s.knopf}
          </SprungKnopf>
        );
      case "nachfassen_senden":
        return (
          <SprungKnopf ziel="nachfassen" className={cls}>
            {s.knopf}
          </SprungKnopf>
        );
      case "anrufen":
        return (
          <AnrufLink lead={anrufLead} href={`tel:+${active.contactPhone}`} className={cls}>
            <Phone className="h-4 w-4" />
            {s.knopf}
          </AnrufLink>
        );
      case "termin_buchen":
        return active.lead ? (
          <TerminBuchenKnopf leadId={active.lead.id} name={name} className={cls}>
            {s.knopf}
          </TerminBuchenKnopf>
        ) : null;
      default:
        return s.href ? (
          <a href={s.href} className={cls} {...(s.art === "videocall" ? { target: "_blank", rel: "noreferrer" } : {})}>
            {s.knopf}
          </a>
        ) : null;
    }
  };

  const erledigt = active?.needsAttention ? (
    <form action={markChatDoneBuyerAction}>
      <input type="hidden" name="conversationId" value={active.id} />
      <SubmitButton pendingLabel="…" className="min-h-10 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:underline sm:min-h-0 sm:text-xs">
        Als erledigt markieren
      </SubmitButton>
    </form>
  ) : null;

  // Rechte Spalte ohne „Nächster Schritt“ (der steht am Handy immer sichtbar oben im Chat).
  // handy: Blatt hinter dem Namen, dort zusätzlich „Vorbereiten“ am Termin (die Termin-Leiste gibt es am Handy nicht mehr).
  const detailsInhalt = (handy: boolean) =>
    active ? (
    <>
      <Karte titel="Termin">
        {appointments.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--muted)]">
            <span>Kein Termin geplant.</span>
            {active.lead && schritt?.art !== "termin_buchen" && schritt?.art !== "keiner" ? (
              <TerminBuchenKnopf leadId={active.lead.id} name={name} className="min-h-10 font-semibold text-[color:var(--brand)] hover:underline sm:min-h-0">
                Termin buchen
              </TerminBuchenKnopf>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((a) => {
              const blatt = kalenderblatt(a.startsAt);
              const kuenftig = a.startsAt.getTime() > now;
              return (
                <div key={a.id} data-chat-termin>
                  <div className="flex items-center gap-3">
                    <span className="flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand)] text-white" aria-hidden>
                      <span className="text-[10px] font-semibold leading-none opacity-85">{blatt.wochentag}</span>
                      <span className="mt-1 text-lg font-bold leading-none">{blatt.tag}</span>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold">
                        {uhrzeit(a.startsAt)} Uhr · {terminArtKurz(a.mode)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] font-medium text-[color:var(--brand)]">
                        {a.meetUrl ? (
                          <a href={a.meetUrl} target="_blank" rel="noreferrer" className="min-h-10 content-center hover:underline sm:min-h-0">
                            Video-Link
                          </a>
                        ) : null}
                        {handy ? (
                          <Link href={`/buyer/termine/${a.id}/vorbereitung?von=kontakt`} className="min-h-10 content-center hover:underline sm:min-h-0" data-chat-details-vorbereiten>
                            Vorbereiten
                          </Link>
                        ) : null}
                        {kuenftig ? (
                          <RescheduleButton appointmentId={a.id} className="min-h-10 hover:underline sm:min-h-0">
                            Verschieben
                          </RescheduleButton>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-[color:var(--muted)]">
                    {a.confirmedAt ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700" data-termin-zugesagt>
                        Zugesagt <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span>Noch nicht zugesagt</span>
                    )}
                    {kuenftig ? (
                      <>
                        <span aria-hidden>·</span>
                        <RescheduleButton appointmentId={a.id} initialStep="cancel" className="min-h-10 hover:text-[color:var(--foreground)] hover:underline sm:min-h-0">
                          Absagen
                        </RescheduleButton>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Karte>

      {active.lead ? (
        <Karte titel="Anfrage">
          {chips.length ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    c.gruen ? "bg-emerald-50 text-emerald-700" : "bg-[color:var(--surface-sunken)] text-[color:var(--foreground)] ring-1 ring-inset ring-[color:var(--border)]",
                  )}
                >
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className={cn("flex flex-col items-start gap-0.5 text-xs text-[color:var(--muted)]", chips.length ? "mt-3" : "")}>
            {active.lead.status ? <StatusPunkt farbe={phasenPunkt(active.lead.status)}>{statusLabel(active.lead.status, true)}</StatusPunkt> : null}
            <span>Eingang {formatDateTime(active.lead.createdAt)}</span>
          </div>
        </Karte>
      ) : null}

      {angaben.length || active.qualificationSummary ? (
        <Karte titel="Angaben fürs Angebot">
          {angaben.length ? (
            <dl className="space-y-1.5 text-sm" data-lead-angaben>
              {angaben.map((a) => (
                <div key={a.key} className="flex items-baseline justify-between gap-3">
                  {/* Lange Begriffe („Versicherungsinteresse“) umbrechen statt unter den Wert zu laufen */}
                  <dt className="min-w-0 flex-1 hyphens-auto text-[color:var(--muted)] [overflow-wrap:anywhere]" lang="de">{a.label}</dt>
                  <dd className="min-w-0 max-w-[60%] break-words text-right font-medium">{a.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {healthAnswers.length ? <p className="mt-2 text-xs text-[color:var(--muted)]">Gesundheitsangaben: vertraulich im Kontakt.</p> : null}
          {active.qualificationSummary ? (
            <details className={cn("group/q", angaben.length ? "mt-3 border-t border-[color:var(--border)] pt-2" : "")} open={!angaben.length}>
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-[color:var(--brand)] sm:min-h-0 [&::-webkit-details-marker]:hidden">
                Zusammenfassung des Assistenten
                <ChevronDown className="h-3.5 w-3.5 transition group-open/q:rotate-180" />
              </summary>
              <p className="mt-1.5 text-sm leading-relaxed">{active.qualificationSummary}</p>
            </details>
          ) : null}
        </Karte>
      ) : null}

      <Karte titel="Kontakt">
        <div className="space-y-1 text-sm">
          <AnrufLink lead={anrufLead} href={`tel:+${active.contactPhone}`} className="block min-h-10 content-center hover:text-[color:var(--brand)] sm:min-h-0">
            {formatPhone(active.contactPhone)}
          </AnrufLink>
          {active.contactEmail ? (
            <a href={`mailto:${active.contactEmail}`} className="block break-all hover:text-[color:var(--brand)]">
              {active.contactEmail}
            </a>
          ) : null}
          {active.lead ? (
            <Link href={`/buyer/leads/${active.lead.id}`} className="inline-flex min-h-10 items-center gap-0.5 pt-1 text-xs font-semibold text-[color:var(--brand)] hover:underline sm:min-h-0">
              Kontakt öffnen <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </Karte>
    </>
    ) : null;
  const details = detailsInhalt(false);
  // Handy: Leiste „Nächster Schritt“ nur, wenn der Schritt nicht schon in der Kopfzeile steht
  const leisteHandy = !!schritt && schritt.art !== "keiner" && !KOPF_STATT_LEISTE.has(schritt.art);

  // Handy: zweite Kopfzeile „● Assistent aktiv · Termin heute 11:00“ (Ole, 18.11.2026). Stehen rechts zwei Knöpfe
  // („Vorbereiten“ bzw. „Assistent an“ und „Anrufen“), rückt sie unter die ganze Kopfzeile, damit der Termin lesbar bleibt.
  const statusUnten = !!active && !!kopfTermin && (!!kopfTermin.vorbereiten || (!!active.lead && !active.botActive));
  const statusHandy = active ? (
    <div
      className={cn(
        "mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs md:hidden",
        !active.lead && !active.botActive ? "font-medium text-sky-800" : active.botActive ? "text-emerald-700" : "text-[color:var(--muted)]",
      )}
      data-chat-status-handy
    >
      <span
        className={cn(
          "h-[7px] w-[7px] shrink-0 rounded-full",
          !active.lead && !active.botActive ? "bg-sky-500" : active.botActive ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" : "bg-[color:var(--brand)]",
        )}
      />
      {/* Wird es eng, kürzt der Status, der Termin bleibt ganz lesbar */}
      <span className="min-w-0 truncate">{!active.lead && !active.botActive ? "Neuer Kontakt" : active.botActive ? "Assistent aktiv" : "Assistent pausiert"}</span>
      {kopfTermin ? <span className="shrink-0 text-[color:var(--muted)]">· {kopfTermin.text}</span> : null}
    </div>
  ) : null;

  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-0 py-0 sm:px-6 sm:py-6 lg:px-8">
      {/* Chat übernommen bzw. Ergebnis nach „Anrufen“: fragen, wie es mit dem Lead weitergeht (falls kein Schritt) */}
      {active?.lead ? (
        <NextStepPrompt key={active.lead.id} leadId={active.lead.id} name={active.contactName ?? "Lead"} source={active.lead.source} autoOpen={sp.schritt === "1"} />
      ) : null}
      <div className="hidden sm:block">
        <PageHeader title="Nachrichten" subtitle="WhatsApp-Gespräche mit Ihren Kontakten" />
      </div>

      {error ? (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {error}
        </div>
      ) : null}

      <div className="relative flex h-[calc(100dvh-56px-64px)] overflow-hidden border-[color:var(--border)] bg-white sm:h-[calc(100dvh-56px-140px)] sm:min-h-[560px] sm:rounded-[20px] sm:border sm:shadow-[var(--shadow-md)]">
        <NewMessageHint key={listQs || "alle"} items={hintItems} activeId={active?.id ?? null} />
        {/* Liste: auf dem Handy ausgeblendet, sobald ein Chat offen ist */}
        <aside className={`${active ? "hidden md:flex" : "flex"} w-full flex-none flex-col border-r border-[color:var(--border)] md:w-[280px] xl:w-[264px] 2xl:w-[330px]`}>
          <div className="space-y-2.5 px-3 pb-2.5 pt-3 sm:px-4 sm:pt-4">
            {/* Handy: Seitentitel wie auf den anderen Seiten (UX Runde 4, Vorschlag 6) */}
            <h1 className="px-1 text-[22px] font-bold tracking-tight sm:hidden">Nachrichten</h1>
            <div className="flex gap-1.5 text-sm font-semibold xl:text-[13px] 2xl:text-sm">
              <Link
                href={`/buyer/chats${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                className={cn(
                  "flex min-h-10 flex-1 items-center justify-center rounded-[10px] px-2",
                  filter === "all" ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]",
                )}
              >
                Alle
              </Link>
              <Link
                href={`/buyer/chats?f=attention${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={cn(
                  "flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-2",
                  filter === "attention" ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]",
                )}
                data-chats-wartet
              >
                Wartet auf Sie
                {attentionTotal > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--brand)] px-1.5 text-xs font-semibold text-white">{attentionTotal}</span>
                ) : null}
              </Link>
            </div>
            <form action="/buyer/chats" className="relative">
              {filter === "attention" ? <input type="hidden" name="f" value="attention" /> : null}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Name, Nummer oder E-Mail"
                aria-label="Chats durchsuchen"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white pl-9 pr-3 text-sm focus:border-[color:var(--brand)] focus:outline-none"
              />
            </form>
          </div>
          <div className="flex-1 overflow-y-auto pb-2">
            {conversations.length === 0 ? (
              <div className="px-5 py-6 text-sm text-[color:var(--muted)]">
                {q ? (
                  <>
                    Keine Treffer.{" "}
                    <Link href={`/buyer/chats${filter === "attention" ? "?f=attention" : ""}`} className="font-semibold text-[color:var(--brand)] hover:underline">
                      Suche zurücksetzen
                    </Link>
                  </>
                ) : filter === "attention" ? (
                  <>
                    Niemand wartet gerade auf Sie.{" "}
                    <Link href="/buyer/chats" className="font-semibold text-[color:var(--brand)] hover:underline">
                      Alle Chats
                    </Link>
                  </>
                ) : (
                  "Noch keine Nachrichten. Sobald der Assistent einen Lead anschreibt, steht das Gespräch hier."
                )}
              </div>
            ) : (
              conversations.map((c) => {
                const last = c.messages[0];
                const isActive = c.id === activeId;
                const cname = c.contactName ?? formatPhone(c.contactPhone);
                const von = last?.direction === "outbound" ? (last.sentBy === "agent" || last.sentBy === "app" ? "Sie: " : "Assistent: ") : "";
                return (
                  <Link
                    key={c.id}
                    href={`/buyer/chats?c=${c.id}${listQs ? `&${listQs}` : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex gap-3 border-l-[3px] px-4 py-3",
                      isActive ? "border-l-[color:var(--brand)] bg-[#f5f8ff]" : "border-l-transparent hover:bg-[color:var(--surface-sunken)]",
                    )}
                  >
                    <ChatAvatar name={cname} dot={c.needsAttention} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[15px]", c.needsAttention ? "font-bold" : "font-semibold")}>{cname}</span>
                        <span className="shrink-0 text-xs text-[color:var(--muted)]">{c.lastMessageAt ? listenZeit(c.lastMessageAt, now) : ""}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-[color:var(--muted)]">{last ? `${von}${waOhneMarker(last.body ?? "")}` : ""}</p>
                      <div className="mt-1 flex min-w-0 items-center">
                        {c.needsAttention ? (
                          <StatusPunkt farbe="bg-rose-500" className="font-semibold text-rose-700">
                            Wartet auf Sie
                          </StatusPunkt>
                        ) : !c.lead ? (
                          // Ohne Lead: der Vermittler entscheidet (lib/whatsapp/nur-leads.ts), kein Assistent
                          <StatusPunkt farbe="bg-sky-500" className="text-sky-800">
                            <span data-neuer-kontakt>Neuer Kontakt</span>
                          </StatusPunkt>
                        ) : c.lead.status ? (
                          <StatusPunkt farbe={phasenPunkt(c.lead.status)}>{statusLabel(c.lead.status, true)}</StatusPunkt>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat */}
        <section className={`${active ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#fafbfd]`}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-[color:var(--muted)]">
              <span className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="font-medium text-[color:var(--foreground)]">Wählen Sie links ein Gespräch aus</span>
                {attentionTotal > 0 && filter !== "attention" ? (
                  <Link href="/buyer/chats?f=attention" className="font-semibold text-[color:var(--brand)] hover:underline">
                    {attentionTotal === 1 ? "1 Chat wartet auf Sie" : `${attentionTotal} Chats warten auf Sie`}
                  </Link>
                ) : null}
              </span>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-x-1.5 border-b border-[color:var(--border)] bg-white px-3 py-2.5 sm:gap-x-3 sm:px-5 sm:py-3 md:flex-nowrap">
                <Link href={`/buyer/chats${listQs ? `?${listQs}` : ""}`} aria-label="Zurück" className="-ml-1 rounded-full p-1.5 text-[color:var(--brand)] md:hidden">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="min-w-0 flex-1">
                  {/* Handy: Name öffnet die Details (Termin, Angaben, Kontakt) als Blatt */}
                  <div className="flex min-w-0 md:hidden">
                    <ChatDetailsKnopf name={name} titel={name}>
                      {erledigt}
                      {detailsInhalt(true)}
                    </ChatDetailsKnopf>
                  </div>
                  {/* UX Runde 4: Name öffnet den Kontakt */}
                  {active.lead ? (
                    <Link href={`/buyer/leads/${active.lead.id}`} className="hidden min-w-0 items-center gap-0.5 text-[17px] font-semibold hover:underline md:flex" data-chat-kontakt>
                      <span className="truncate">{name}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                    </Link>
                  ) : (
                    <div className="hidden truncate text-[17px] font-semibold md:block">{name}</div>
                  )}
                  {statusUnten ? null : statusHandy}
                  {!active.lead && !active.botActive ? (
                    <div className="mt-0.5 hidden min-w-0 items-center whitespace-nowrap gap-1.5 text-[13px] font-medium text-sky-800 md:flex">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      Neuer Kontakt
                    </div>
                  ) : active.botActive ? (
                    <div className="mt-0.5 hidden min-w-0 items-center whitespace-nowrap gap-1.5 text-[13px] text-emerald-700 md:flex" data-chat-status="assistent">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                      <span className="truncate">Assistent antwortet für Sie</span>
                    </div>
                  ) : (
                    <div className="mt-0.5 hidden min-w-0 items-center whitespace-nowrap gap-1.5 text-[13px] text-[color:var(--muted)] md:flex" data-chat-status="selbst">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[color:var(--brand)]" />
                      Sie schreiben
                    </div>
                  )}
                </div>
                {/* Handy: Termin in den nächsten 24 Stunden → kleiner Knopf statt eigener Leiste */}
                {kopfTermin?.vorbereiten ? (
                  <Link href={kopfTermin.vorbereiten} className={buttonClass("primary", "sm", "shrink-0 px-2.5 text-[12px] md:hidden")} data-chat-vorbereiten>
                    Vorbereiten
                  </Link>
                ) : null}
                <AnrufLink
                  lead={anrufLead}
                  href={`tel:+${active.contactPhone}`}
                  aria-label="Anrufen"
                  title={formatPhone(active.contactPhone)}
                  className={buttonClass("secondary", "md", "w-10 shrink-0 px-0 sm:w-auto sm:px-4 xl:w-10 xl:px-0 2xl:w-auto 2xl:px-4")}
                  data-chat-anrufen
                >
                  <Phone className="h-4 w-4" />
                  <span className="hidden sm:inline xl:hidden 2xl:inline">Anrufen</span>
                </AnrufLink>
                {/* Handy: Schreiben übernimmt automatisch; dort nur „Assistent an“ zum Zurückgeben */}
                {active.lead ? (
                  <form
                    action={toggleBotBuyerAction}
                    className={active.botActive ? "hidden shrink-0 sm:block" : "shrink-0"}
                    title={active.botActive ? "Selbst schreiben, der Assistent pausiert in diesem Chat" : "Der Assistent antwortet wieder für Sie"}
                  >
                    <input type="hidden" name="conversationId" value={active.id} />
                    <SubmitButton pendingLabel="…" className={buttonClass("secondary", "md", "px-3 sm:px-4")}>
                      {active.botActive ? (
                        "Übernehmen"
                      ) : (
                        <>
                          <Bot className="h-4 w-4" />
                          {/* Handy mit „Vorbereiten“: nur das Symbol, damit der Name Platz behält */}
                          <span className={kopfTermin?.vorbereiten ? "sr-only md:not-sr-only" : ""}>Assistent an</span>
                        </>
                      )}
                    </SubmitButton>
                  </form>
                ) : null}
                {/* Neben zwei Knöpfen wäre die zweite Zeile zu eng: dann über die ganze Breite, unter dem Namen */}
                {statusUnten ? <div className="-mt-1.5 basis-full pl-[38px] md:hidden">{statusHandy}</div> : null}
              </header>

              {/* Schmale Fenster: nächster Schritt immer sichtbar, Details zum Aufklappen. Handy: Details hinter dem Namen,
                  Termin-Schritt als „Vorbereiten“ in der Kopfzeile (Ole, 18.11.2026). */}
              <div className={cn("border-b border-[color:var(--border)] bg-white xl:hidden", leisteHandy ? "" : "max-md:hidden")} data-chat-details-mobil>
                {schritt && schritt.art !== "keiner" ? (
                  <div
                    className={cn("flex items-center gap-3 bg-gradient-to-b to-white px-4 py-2.5", schritt.dringend ? "from-rose-50" : "from-[#f5f8ff]", leisteHandy ? "" : "max-md:hidden")}
                    data-chat-schritt
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm font-semibold", schritt.dringend ? "text-rose-800" : "")}>{schritt.titel}</div>
                      {schritt.text ? <div className={cn("text-xs text-[color:var(--muted)]", schritt.dringend ? "line-clamp-2" : "truncate")}>{schritt.text}</div> : null}
                    </div>
                    {schrittKnopf(schritt, true)}
                  </div>
                ) : null}
                <details className="group/d max-md:hidden">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 border-t border-[color:var(--border)] px-4 text-xs font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 truncate">
                      Details
                      <span className="font-normal text-[color:var(--muted)]">
                        {appointments[0] ? ` · Termin ${terminKurz(appointments[0].startsAt, now)}` : ""}
                        {angaben.length ? " · Angaben" : ""}
                        {" · Kontakt"}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 transition group-open/d:rotate-180" />
                  </summary>
                  {/* Ole, 16.11.2026: am Handy unten abgeschnitten (fester Chat-Rahmen). Eigener Scrollbereich. */}
                  <div className="max-h-[55dvh] space-y-3 overflow-y-auto overscroll-contain bg-[color:var(--surface-sunken)] p-3" data-lead-infos>
                    {erledigt}
                    {details}
                  </div>
                </details>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-4 sm:px-6" data-messages>
                <ChatVerlauf
                  messages={active.messages}
                  now={now}
                  termine={terminZeiten}
                  fuss={(m) => (m.direction === "outbound" && m.status === "failed" ? <NichtZugestellt /> : null)}
                />
                <StickToBottom count={active.messages.length} chatId={active.id} />
              </div>

              {active.optedOutAt ? (
                <p className="border-t border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900" data-chat-optout>
                  Der Kontakt hat „STOPP“ geschrieben. Er bekommt keine WhatsApp-Nachrichten mehr, auch nicht vom Assistenten. Schreibt er selbst wieder, können Sie antworten.
                </p>
              ) : windowOpen ? (
                <MerkFormular action={sendReplyBuyerAction} className="border-t border-[color:var(--border)] bg-white px-3 py-2.5 sm:px-5 sm:py-3">
                  <input type="hidden" name="conversationId" value={active.id} />
                  <div className="flex items-end gap-2 rounded-[14px] border border-[color:var(--border-strong)] bg-white py-1.5 pl-4 pr-1.5 focus-within:border-[color:var(--brand)]">
                    <textarea
                      id="antwort"
                      name="body"
                      rows={1}
                      required
                      placeholder="Nachricht schreiben"
                      aria-label="Nachricht schreiben"
                      className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[1.5] focus:outline-none [field-sizing:content]"
                    />
                    <SubmitButton
                      pendingLabel="…"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)] disabled:opacity-50"
                    >
                      <SendHorizontal className="h-4 w-4" />
                    </SubmitButton>
                  </div>
                  {active.botActive ? (
                    <SchreibHinweis chatId={active.id} schonGeschrieben={selbstGeschrieben}>
                      Wenn Sie schreiben, pausiert der Assistent in diesem Chat.
                    </SchreibHinweis>
                  ) : null}
                </MerkFormular>
              ) : (
                <div id="nachfassen" className="border-t border-[color:var(--border)] bg-white px-4 py-3 sm:px-5">
                  <p className="text-xs text-[color:var(--muted)]">Freies Schreiben geht erst wieder, wenn der Lead antwortet. Jetzt: anrufen oder nachfassen.</p>
                  {followup?.kind === "blocked" ? (
                    <p className="mt-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">{followup.reason}</p>
                  ) : followup?.kind === "ok" ? (
                    <form action={followupBuyerAction} className="mt-2 space-y-2">
                      <input type="hidden" name="conversationId" value={active.id} />
                      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Vorschau · {followup.label}</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{waFormatKnoten(followup.preview)}</p>
                      </div>
                      {followup.approved ? (
                        <div className="flex justify-end">
                          <SubmitButton pendingLabel="Sendet …" className={buttonClass("primary", "md")}>
                            Nachfassen senden
                          </SubmitButton>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-700">Nachfassen ist noch nicht freigeschaltet. Bis dahin: anrufen.</p>
                      )}
                    </form>
                  ) : null}
                </div>
              )}
            </>
          )}
        </section>

        {active ? (
          <aside className="hidden w-[296px] flex-none space-y-3 overflow-y-auto border-l border-[color:var(--border)] bg-white p-3.5 xl:block 2xl:w-[340px] 2xl:p-5" data-chat-seite>
            {schritt && schritt.art !== "keiner" ? (
              <section
                className={cn("rounded-[var(--radius-lg)] border bg-gradient-to-b to-white p-4", schritt.dringend ? "border-rose-200 from-rose-50" : "border-[#dbe6ff] from-[#f5f8ff]")}
                data-chat-schritt
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Nächster Schritt</h3>
                <div className={cn("text-base font-semibold", schritt.dringend ? "text-rose-800" : "")}>{schritt.titel}</div>
                {schritt.text ? <p className="mt-0.5 text-[13px] text-[color:var(--muted)]">{schritt.text}</p> : null}
                <div className="mt-3">{schrittKnopf(schritt, false)}</div>
                {erledigt ? <div className="mt-1 text-center">{erledigt}</div> : null}
              </section>
            ) : null}
            {details}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{titel}</h3>
      {children}
    </section>
  );
}
