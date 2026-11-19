import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, MessageCircle, UserRound, UserX } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Card } from "@/components/ui";
import { TerminAnwesenheit } from "@/components/termin-anwesenheit";
import { TerminKarte } from "@/components/termin-karte";
import { getBuyerContext } from "@/lib/buyer-context";
import { isNewUi } from "@/lib/new-ui";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { anwesenheitsFrage, asAnwesenheit, leadLabel } from "@/lib/showup";
import { appointmentScope } from "@/lib/team";
import { wartetStand } from "@/lib/showup-server";
import { angebotOffen, terminKartenAktionen, terminPhase } from "@/lib/termin-karte";
import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { erinnerungsZeilen, terminBestaetigung } from "@/lib/termin-seite";
import { WieLiefEs } from "./wie-lief-es";
import { ErinnerungenBox } from "./erinnerungen-box";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termin | performancegrowth" };

const wann = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

// Terminseite (Show-up-Paket, Ole 17.11.2026; UX-Runde Team C, 19.11.2026). Ziel der Pushes „Ist Frau Becker da?“ und
// „Ist … noch gekommen?“ und Heimat eines Termins. Eine Frage bzw. eine Hauptaktion je Zeitpunkt:
//   vorher   Terminkarte wie im Kontakt (Vorbereiten bzw. Präsentation) + „Zusage und Erinnerungen“ (Show-up sichtbar)
//   Beginn   „Ist Frau Becker da?“ (Videotermin), Terminkarte ruhig darunter
//   nachher  „Wie lief der Termin?“ mit Abschluss als Hauptaktion (vorher Sackgasse: „tragen Sie auf Heute ein“)
// Chat und Kontakt als kleine Wege am Ende.
export default async function TerminPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const t = await prisma.appointment.findFirst({
    where: { id, ...appointmentScope(ctx) },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      mode: true,
      status: true,
      meetUrl: true,
      attendance: true,
      attendanceAt: true,
      leadId: true,
      conversationId: true,
      confirmedAt: true,
      komplettcheck: true,
      preparedAt: true,
      reminderSentAt: true,
      soonReminderSentAt: true,
      startReminderSentAt: true,
      rescheduleRequestedAt: true,
      lead: { select: { name: true, phone: true, formData: true, contactOverrides: true, source: true, status: true } },
    },
  });
  if (!t) notFound();
  const now = new Date(nowMs());
  const [conv, newUi, wa, plan] = await Promise.all([
    t.conversationId ? prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactName: true, contactPhone: true } }) : null,
    isNewUi(ctx.customerId),
    wartetStand(t),
    t.leadId && t.status === "booked" ? loadNachrichtenPlan(t.leadId, now).catch(() => []) : [],
  ]);
  const label = leadLabel(kontaktFromLead(t.lead, conv?.contactName ?? null), t.lead?.name ?? conv?.contactName);
  const name = t.lead?.name ?? conv?.contactName ?? label;
  const phone = t.lead?.phone ?? conv?.contactPhone ?? null;
  const frage = anwesenheitsFrage(t, now);
  const att = asAnwesenheit(t.attendance);
  const gebucht = t.status === "booked";
  const phase = terminPhase(t, now);
  // Nach dem Termin, Anwesenheit geklärt (bzw. Telefontermin): Ergebnis festhalten
  const wieLief = gebucht && !!t.leadId && phase === "nachher" && !frage && att !== "nicht_erschienen";
  // Ergebnis schon eingetragen: dieselbe Komponente an derselben Stelle zeigt „Ergebnis eingetragen“. So bleibt nach
  // „Abschluss“ das Blatt mit Beitrag und Glückwunsch stehen, wenn die Seite nach dem Speichern neu lädt.
  const erledigt = t.status === "completed" && !!t.leadId;
  // Zusage: „zugesagt“ steht schon in der Terminkarte; hier nur, was zu tun ist (offen, möchte verschieben), solange der Termin ansteht
  const b = gebucht && phase !== "nachher" ? terminBestaetigung(t, now) : null;
  const bestaetigung = b && b.ton !== "ok" ? b : null;
  const erinnerungen = gebucht && phase === "vorher" ? erinnerungsZeilen(t, plan, now) : [];
  const kontaktHref = t.leadId ? `${newUi ? "/buyer/kontakte/" : "/buyer/leads/"}${t.leadId}` : null;
  const karte =
    // Nach dem Termin übernehmen „Ist … noch gekommen?“ bzw. „Wie lief der Termin?“ (keine zweite Karte mit „Ergebnis eintragen“)
    gebucht && t.leadId && phase !== "nachher" ? (
      <TerminKarte
        t={{
          id: t.id,
          wann: wann(t.startsAt),
          mode: t.mode,
          meetUrl: t.meetUrl,
          zugesagt: !!t.confirmedAt,
          komplettcheck: !!t.komplettcheck,
          erschienen: att === "erschienen",
          begonnen: t.startsAt.getTime() <= now.getTime(),
          vorbereitet: !!t.preparedAt,
        }}
        // Während der Frage „Ist … da?“ ist deren Antwort die Hauptaktion: Karte ruhig
        a={{ ...terminKartenAktionen(t, { now, telefon: !!phone, angebotOffen: angebotOffen(t.lead?.status), vorbereitet: !!t.preparedAt }), ...(frage ? { ruhig: true } : {}) }}
        leadId={t.leadId}
        name={name}
        source={t.lead?.source ?? null}
        phone={phone}
      />
    ) : null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader title={label} back="/buyer" />

      {frage ? (
        <Card className="mb-4 p-5" tone="attention">
          <TerminAnwesenheit appointmentId={t.id} label={label} stand={frage} phone={phone} wa={wa} gross readOnly={ctx.preview} />
        </Card>
      ) : null}

      {wieLief || erledigt ? (
        <div className="mb-4">
          <WieLiefEs
            appointmentId={t.id}
            leadId={t.leadId!}
            label={label}
            name={name}
            angebotOffen={angebotOffen(t.lead?.status)}
            readOnly={ctx.preview}
            erledigt={erledigt ? { zeit: `${wann(t.startsAt)} Uhr` } : null}
          />
        </div>
      ) : null}

      {karte}

      {!erledigt && (!gebucht || !t.leadId || (phase === "nachher" && !frage && !wieLief)) ? (
        <Card className="mb-5 p-5">
          <p className="text-sm text-[color:var(--muted)]" data-termin-zeit>
            {wann(t.startsAt)} Uhr
          </p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold" data-termin-stand>
            {t.status === "no_show" || att === "nicht_erschienen" ? (
              <>
                <UserX className="h-5 w-5 text-rose-600" /> Nicht erschienen
              </>
            ) : t.status === "cancelled" ? (
              "Abgesagt"
            ) : t.status === "completed" ? (
              <>
                <Check className="h-5 w-5 text-emerald-600" /> Ergebnis eingetragen
              </>
            ) : (
              "Gebucht"
            )}
          </p>
        </Card>
      ) : null}

      {/* Show-up sichtbar (Ole, 19.11.2026): Zusage und Erinnerungen an den Kunden, solange der Termin ansteht */}
      {(bestaetigung || erinnerungen.length) && t.leadId ? (
        <ErinnerungenBox leadId={t.leadId} label={label} bestaetigung={bestaetigung} zeilen={erinnerungen} readOnly={ctx.preview} />
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {t.conversationId ? (
          <Link href={`/buyer/chats?c=${t.conversationId}`} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-[color:var(--brand)] hover:underline">
            <MessageCircle className="h-4 w-4" /> Chat
          </Link>
        ) : null}
        {kontaktHref ? (
          <Link href={kontaktHref} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-[color:var(--brand)] hover:underline" data-termin-kontakt>
            <UserRound className="h-4 w-4" /> Kontakt
          </Link>
        ) : null}
      </div>
    </main>
  );
}
