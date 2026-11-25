// Admin-Sicht auf WhatsApp-Nachrichten: Absender-Etikett und Zustellhäkchen. Gemeinsam für den Admin-Chat
// (app/admin/whatsapp/chats-ansicht.tsx) und den WhatsApp-Verlauf in Kontakt- und Kundenakte
// (components/admin-neu/vertrieb/whatsapp-verlauf.tsx). Ohne Client-Code.

import { AlertCircle, Bot, Check, CheckCheck, FileText, Smartphone, UserRound } from "lucide-react";
import type { Absender } from "@/lib/chat-ansicht";
import type { Etikett } from "@/components/chat/chat-verlauf";
import type { DateiInfo } from "@/lib/chat-dateien";
import { SupportZugriffKnopf } from "@/components/chat/support-zugriff-knopf";
import { DateiKarteRahmen } from "@/components/chat/datei-karte";

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
export function DeliveryStatus({ status, erneut = false }: { status: string | null; erneut?: boolean }) {
  if (status === "failed") {
    // erneut: dieselbe Nachricht ging danach noch einmal raus (lib/chat-zustellung.ts)
    return (
      <span className={erneut ? "inline-flex items-center gap-0.5 text-[color:var(--muted)]" : "inline-flex items-center gap-0.5 text-rose-700"} title="Nicht zugestellt">
        <AlertCircle className="h-3.5 w-3.5" /> {erneut ? "nicht zugestellt, erneut gesendet" : "nicht zugestellt"}
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
  return (
    <DateiKarteRahmen
      titel={d.titel}
      details={d.details}
      art={d.art}
      geschuetzt={d.geschuetzt}
      aktion={d.zugriff === "moeglich" ? <SupportZugriffKnopf messageId={d.messageId} titel={d.titel} /> : null}
      hinweis={DATEI_HINWEIS[d.zugriff]}
      hinweisSchloss={d.zugriff === "gesperrt"}
      data={{ "data-zugriff": d.zugriff }}
    />
  );
}
