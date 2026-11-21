import { notFound } from "next/navigation";
import { Seite } from "@/components/admin-neu/ui/seite";
import { ChatsAnsicht, type ChatsSuche } from "@/app/admin/whatsapp/chats-ansicht";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Chat | performancegrowth Admin" };

// WhatsApp-Chats → ein Chat. Am Rechner bleibt die Liste links stehen, am Handy nur der Chat (Zurück oben).
// Übernehmen bzw. Bot wieder an, Nachricht mit Textbausteinen, freigegebene Vorlage (außerhalb 24 Stunden),
// Seitenleiste mit Kontakt, Formularangaben, Bot-Zusammenfassung, Terminen (verschieben, absagen), Support-Zuordnung.
const FUNKTIONEN = [
  "actions-togglebotaction--bot-pausieren-bzw-wieder-einschalten",
  "actions-takeoveraction--gespraech-uebernehmen",
  "actions-sendreplyaction--antwort-senden-enter-sendet-am-rechner-emoji",
  "actions-sendtemplateaction--freigegebene-vorlage-senden-ausserhalb-24",
  "appointment-actions-loadrescheduledialogadmin--termin-des-leads-verschieben-dialog-mit-freien",
  "appointment-actions-cancelappointmentadminaction--termin-des-leads-absagen",
  "page--seitenleiste-lead-kontaktdaten-formularangaben",
  "page-crmhref--anrufen-e-mail-zum-crm-kunden-aus-dem-chat",
  "page--hinweis-bot-kann-keine-termine-buchen-kalender",
  "actions-assignsupportcontactaction--support-chat-absender-einem-vertriebskontakt",
].join(" ");

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ChatsSuche> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const chat = await prisma.conversation.findUnique({ where: { id }, select: { contactName: true, contactPhone: true } });
  if (!chat) notFound();
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "c") as [string, string][]).toString();
  return (
    <Seite titel={chat.contactName ?? formatPhone(chat.contactPhone)} zurueck={{ href: `/admin/neu/leads/chats${qs ? `?${qs}` : ""}`, label: "Chats" }} breit>
      <div data-funktion={FUNKTIONEN}>
        <ChatsAnsicht sp={sp} basis="/admin/neu/leads/chats" chatId={id} neu />
      </div>
    </Seite>
  );
}
