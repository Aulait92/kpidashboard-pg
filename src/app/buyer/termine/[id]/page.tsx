import { notFound, redirect } from "next/navigation";
import { Calculator, Check, MessageCircle, UserRound, UserX, Video } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ButtonLink, Card } from "@/components/ui";
import { TerminAnwesenheit } from "@/components/termin-anwesenheit";
import { getBuyerContext } from "@/lib/buyer-context";
import { isNewUi } from "@/lib/new-ui";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { prisma } from "@/lib/prisma";
import { anwesenheitsFrage, asAnwesenheit, leadLabel, terminArtWort } from "@/lib/showup";
import { appointmentScope } from "@/lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termin | performancegrowth" };

const wann = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

// Terminansicht und Entscheidungsblatt (Show-up-Paket, Ole 17.11.2026): Ziel des Pushes „Ist Frau Becker da?“ (der Push
// hat keine Knöpfe). Hauptzweck: die eine Frage beantworten. Videocall, Vorbereitung und Kontakt als kleine Wege daneben.
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
      leadId: true,
      conversationId: true,
      lead: { select: { name: true, phone: true, formData: true, contactOverrides: true } },
    },
  });
  if (!t) notFound();
  const conv = t.conversationId ? await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactName: true, contactPhone: true } }) : null;
  const newUi = await isNewUi(ctx.customerId);
  const label = leadLabel(kontaktFromLead(t.lead, conv?.contactName ?? null), t.lead?.name ?? conv?.contactName);
  const phone = t.lead?.phone ?? conv?.contactPhone ?? null;
  const frage = anwesenheitsFrage(t, new Date());
  const att = asAnwesenheit(t.attendance);
  const video = t.mode === "video";

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader title={label} back="/buyer" />
      <Card className="p-5" tone={frage ? "attention" : "default"}>
        <p className="text-sm text-[color:var(--muted)]" data-termin-zeit>
          {terminArtWort(t.mode)} · {wann(t.startsAt)} Uhr
        </p>
        <div className="mt-3">
          {frage ? (
            <TerminAnwesenheit appointmentId={t.id} label={label} stand={frage} phone={phone} gross />
          ) : t.status === "no_show" || att === "nicht_erschienen" ? (
            <p className="flex items-center gap-2 text-lg font-semibold">
              <UserX className="h-5 w-5 text-rose-600" /> Nicht erschienen
            </p>
          ) : att === "erschienen" ? (
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold">
                <Check className="h-5 w-5 text-emerald-600" /> Erschienen
              </p>
              {t.status === "booked" ? <p className="mt-1 text-sm text-[color:var(--muted)]">Das Ergebnis tragen Sie nach dem Termin auf „Heute“ ein.</p> : null}
            </div>
          ) : t.status === "cancelled" ? (
            <p className="text-lg font-semibold">Abgesagt</p>
          ) : (
            <p className="text-lg font-semibold">{video ? "Zum Terminbeginn fragt die App hier, ob alle da sind." : "Telefontermin: Sie rufen zur vereinbarten Zeit an."}</p>
          )}
        </div>
      </Card>
      <div className="mt-4 flex flex-wrap gap-2">
        {video && t.meetUrl && t.status === "booked" ? (
          <ButtonLink href={t.meetUrl} icon={Video}>
            Videocall starten
          </ButtonLink>
        ) : null}
        {t.leadId ? (
          <ButtonLink href={`/buyer/termine/${t.id}/vorbereitung`} icon={Calculator}>
            Vorbereitung
          </ButtonLink>
        ) : null}
        {t.conversationId ? (
          <ButtonLink href={`/buyer/chats?c=${t.conversationId}`} icon={MessageCircle}>
            Chat
          </ButtonLink>
        ) : null}
        {t.leadId ? (
          <ButtonLink href={`${newUi ? "/buyer/kontakte/" : "/buyer/leads/"}${t.leadId}`} icon={UserRound}>
            Kontakt
          </ButtonLink>
        ) : null}
      </div>
    </main>
  );
}
