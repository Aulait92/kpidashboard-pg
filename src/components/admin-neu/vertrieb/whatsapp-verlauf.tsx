import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { ChatVerlauf } from "@/components/chat/chat-verlauf";
import { DateiKarte, DeliveryStatus, etikettAdmin } from "@/components/chat/chat-admin";
import type { WhatsAppVerlauf } from "@/lib/vertrieb/whatsapp-verlauf";

// WhatsApp-Verlauf der Support-Nummer in Kontakt- und Kundenakte (Ole, 22.11.2026): die letzten Nachrichten wie im
// Chat, „Ganzer Chat“ öffnet den Chat zum Antworten. Nur sichtbar, wenn es einen Chat gibt (keine leere Karte).
// Daten: lib/vertrieb/whatsapp-verlauf.ts.

export const chatPfad = (chatId: string) => `/admin/neu/leads/chats/${encodeURIComponent(chatId)}`;

export function WhatsAppVerlaufKarte({ v, now }: { v: WhatsAppVerlauf; now: number }) {
  const aelter = v.anzahl - v.nachrichten.length;
  return (
    <Card id="whatsapp">
      <div data-whatsapp-verlauf data-funktion="whatsapp-verlauf--support-chat-in-kontakt-und-kundenakte">
        <CardHeader
          title="WhatsApp"
          count={v.anzahl}
          actions={
            <Link href={chatPfad(v.chatId)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
              Ganzer Chat <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="bg-[#fafbfd] px-3 pb-4 sm:px-5">
          {aelter > 0 ? (
            <Link href={chatPfad(v.chatId)} className="flex min-h-9 items-center justify-center pt-2 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:underline">
              {aelter} ältere Nachricht{aelter === 1 ? "" : "en"} im Chat
              {v.weitereChats ? `, ${v.weitereChats} weitere${v.weitereChats === 1 ? "r" : ""} Chat${v.weitereChats === 1 ? "" : "s"}` : ""}
            </Link>
          ) : null}
          <ChatVerlauf
            messages={v.nachrichten}
            now={now}
            sicht="admin"
            etikett={etikettAdmin}
            fuss={(m) => (m.direction === "outbound" ? <DeliveryStatus status={m.status} /> : null)}
            datei={(m) => (m.datei ? <DateiKarte d={m.datei} /> : null)}
          />
        </div>
      </div>
    </Card>
  );
}
