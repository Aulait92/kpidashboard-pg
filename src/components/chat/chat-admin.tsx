// Admin-Sicht auf WhatsApp-Nachrichten: Absender-Etikett und Zustellhäkchen. Gemeinsam für den Admin-Chat
// (app/admin/whatsapp/chats-ansicht.tsx) und den WhatsApp-Verlauf in Kontakt- und Kundenakte
// (components/admin-neu/vertrieb/whatsapp-verlauf.tsx). Ohne Client-Code.

import { AlertCircle, Bot, Check, CheckCheck, FileText, Smartphone, UserRound } from "lucide-react";
import type { Absender } from "@/lib/chat-ansicht";
import type { Etikett } from "@/components/chat/chat-verlauf";

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
