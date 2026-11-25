// Dateikarte im Chat (Ole, 25.11.2026): gemeinsamer Rahmen für Admin (components/chat/chat-admin.tsx DateiKarte, mit
// Support-Zugriff) und Kundenbereich (VermittlerDateiKarte, mit „Öffnen“). Name, Art, Größe, Zeit; geschützte Unterlagen
// mit Schloss. Ohne Client-Code.
import Link from "next/link";
import { ExternalLink, FileText, FolderLock, Image as ImageIcon, Lock, Video } from "lucide-react";
import { buttonClass } from "@/components/ui";
import type { VermittlerDatei } from "@/lib/chat-dateien";

export function DateiKarteRahmen({
  titel,
  details,
  art,
  geschuetzt,
  aktion,
  hinweis,
  hinweisSchloss,
  data,
}: {
  titel: string;
  details: string;
  art: string;
  geschuetzt: boolean;
  aktion?: React.ReactNode;
  hinweis?: React.ReactNode;
  hinweisSchloss?: boolean;
  data?: Record<string, string>;
}) {
  const Icon = geschuetzt ? Lock : art === "Bild" ? ImageIcon : art === "Video" ? Video : FileText;
  return (
    <div
      className="flex w-[min(300px,100%)] flex-col gap-2 whitespace-normal rounded-[12px] bg-white p-2.5 text-left text-[color:var(--foreground)] ring-1 ring-inset ring-[color:var(--border)]"
      data-chat-datei={geschuetzt ? "geschuetzt" : "offen"}
      {...data}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={
            geschuetzt
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-50 text-amber-700"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--brand-soft)] text-[color:var(--brand)]"
          }
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-5 [overflow-wrap:anywhere]" title={titel}>
            {titel}
          </div>
          <div className="text-xs leading-5 text-[color:var(--muted)]">{details}</div>
        </div>
      </div>
      {aktion}
      {hinweis ? (
        <div className="flex items-start gap-1 text-xs leading-4 text-[color:var(--muted)]" data-datei-hinweis>
          {hinweisSchloss ? <Lock className="mt-px h-3 w-3 shrink-0" /> : null}
          {hinweis}
        </div>
      ) : null}
    </div>
  );
}

/** Abrufweg für den Vermittler (app/api/buyer/chats/datei/[id]/route.ts). */
export const vermittlerDateiPfad = (messageId: string) => `/api/buyer/chats/datei/${encodeURIComponent(messageId)}`;

/**
 * Datei im Kundenbereich (lib/chat-dateien.ts dateiFuerVermittler): „Öffnen“ (neuer Tab), bei Gesundheitsbezug mit
 * Zwei-Faktor-Login; Unterlagen der Policen-Ablage mit Verweis auf die Unterlagen im Kontakt.
 */
export function VermittlerDateiKarte({ d }: { d: VermittlerDatei }) {
  const aktion = d.oeffnen ? (
    <a
      href={vermittlerDateiPfad(d.messageId)}
      target="_blank"
      rel="noopener"
      className={buttonClass("secondary", "sm", "min-h-10 w-full sm:min-h-0")}
      data-datei-oeffnen={d.oeffnen}
    >
      <ExternalLink className="h-3.5 w-3.5" /> Öffnen
    </a>
  ) : d.kontaktHref ? (
    <Link href={d.kontaktHref} className={buttonClass("secondary", "sm", "min-h-10 w-full sm:min-h-0")} data-datei-kontakt>
      <FolderLock className="h-3.5 w-3.5" /> In den Unterlagen öffnen
    </Link>
  ) : null;
  const hinweis = d.oeffnen === "zwei_faktor" ? "Gesundheitsdaten: Öffnen mit Zwei-Faktor-Login" : d.kontaktHref ? null : d.hinweis;
  return (
    <DateiKarteRahmen
      titel={d.titel}
      details={d.details}
      art={d.art}
      geschuetzt={d.geschuetzt}
      aktion={aktion}
      hinweis={hinweis}
      hinweisSchloss={d.oeffnen === "zwei_faktor"}
      data={{ "data-oeffnen": d.oeffnen ?? "nein" }}
    />
  );
}
