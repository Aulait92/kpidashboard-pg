// Admin-Sicht auf WhatsApp-Nachrichten: Absender-Etikett und Zustellhäkchen. Gemeinsam für den Admin-Chat
// (app/admin/whatsapp/chats-ansicht.tsx) und den WhatsApp-Verlauf in Kontakt- und Kundenakte
// (components/admin-neu/vertrieb/whatsapp-verlauf.tsx). Ohne Client-Code.

import { AlertCircle, Bot, Check, CheckCheck, FileText, Image as ImageIcon, Lock, Smartphone, UserRound, Video } from "lucide-react";
import type { Absender } from "@/lib/chat-ansicht";
import type { Etikett } from "@/components/chat/chat-verlauf";
import type { DateiInfo } from "@/lib/chat-dateien";
import { SupportZugriffKnopf } from "@/components/chat/support-zugriff-knopf";

export function etikettAdmin(m: { sentBy: string | null; kind: string | null }, a: Absender): Etikett {
  if (a === "lead") return null;
  const sentBy = m.sentBy;
  const kind = m.kind ?? "text";
  if (sentBy === "bot") return { label: "KI-Bot", icon: Bot };
  if (sentBy === "agent") return { label: "Agent", icon: UserRound };
  if (sentBy === "app") return { label: "WhatsApp-App", icon: Smartphone };
  if (sentBy === "system") return { label: kind === "template" ? "Vorlage" : "System", icon: FileText };
  return null;
}

/** Häkchen wie bei WhatsApp: gesendet, zugestellt, gelesen (fehlgeschlagen rot). */
export function DeliveryStatus({ status }: { status: string | null }) {
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-700" title="Nicht zugestellt">
        <AlertCircle className="h-3.5 w-3.5" /> nicht zugestellt
      </span>
    );
  }
  if (status === "read") return <CheckCheck className="h-4 w-4 text-sky-600" aria-label="Gelesen" />;
  if (status === "delivered") return <CheckCheck className="h-4 w-4" aria-label="Zugestellt" />;
  if (status === "sent") return <Check className="h-4 w-4" aria-label="Gesendet" />;
  return null;
}

const DATEI_HINWEIS: Partial<Record<DateiInfo["zugriff"], string>> = {
  gesperrt: "Kein Support-Zugriff, nur Break-Glass im Notfall",
  nicht_gespeichert: "Inhalt liegt nicht bei uns",
  abgelaufen: "Inhalt nicht mehr abrufbar (älter als 30 Tage)",
};

/**
 * Datei im Admin-Chat (Ole, 25.11.2026, lib/chat-dateien.ts): Name, Art, Größe, Absender, Zeit. Geschützte Unterlagen
 * ohne Namen; „Support-Zugriff“ nur, wo der Inhalt abrufbar und nicht gesperrt ist.
 */
export function DateiKarte({ d }: { d: DateiInfo }) {
  const Icon = d.geschuetzt ? Lock : d.art === "Bild" ? ImageIcon : d.art === "Video" ? Video : FileText;
  const hinweis = DATEI_HINWEIS[d.zugriff];
  return (
    <div
      className="flex w-[min(300px,100%)] flex-col gap-2 whitespace-normal rounded-[12px] bg-white p-2.5 text-left text-[color:var(--foreground)] ring-1 ring-inset ring-[color:var(--border)]"
      data-chat-datei={d.geschuetzt ? "geschuetzt" : "offen"}
      data-zugriff={d.zugriff}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={
            d.geschuetzt
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-50 text-amber-700"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--brand-soft)] text-[color:var(--brand)]"
          }
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-5 [overflow-wrap:anywhere]" title={d.titel}>
            {d.titel}
          </div>
          <div className="text-xs leading-5 text-[color:var(--muted)]">{d.details}</div>
        </div>
      </div>
      {d.zugriff === "moeglich" ? <SupportZugriffKnopf messageId={d.messageId} titel={d.titel} /> : null}
      {hinweis ? (
        <div className="flex items-start gap-1 text-xs leading-4 text-[color:var(--muted)]" data-datei-hinweis>
          {d.zugriff === "gesperrt" ? <Lock className="mt-px h-3 w-3 shrink-0" /> : null}
          {hinweis}
        </div>
      ) : null}
    </div>
  );
}
