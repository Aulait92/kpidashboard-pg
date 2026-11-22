"use client";

// Anzeige einer Nachrichten-Vorschau (lib/vertrieb/nachricht-vorschau.ts): E-Mail wie im Postfach (An, Betreff,
// Anhang, gerenderte Mail), WhatsApp als Sprechblase. Gemeinsam für „Geplante Nachrichten“ und Einstellungen → Vorlagen.

import { useState } from "react";
import { Info, Mail, MessageCircle, Paperclip } from "lucide-react";
import { vorschauDokument } from "@/components/vertrieb/angebot-mail-vorschau";
import type { MailTeil, VorschauTeil, WhatsAppTeil } from "@/lib/vertrieb/nachricht-vorschau";

function Hinweis({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-[color:var(--muted)]">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" /> {text}
    </p>
  );
}

function MailVorschau({ t }: { t: MailTeil }) {
  const [hoehe, setHoehe] = useState(360);
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]" data-vorschau-kanal="email">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 bg-[color:var(--surface-sunken)] px-4 py-3 text-sm">
        <dt className="text-[color:var(--muted)]">An</dt>
        <dd className="min-w-0 break-all">{t.an || "keine Adresse"}</dd>
        <dt className="text-[color:var(--muted)]">Betreff</dt>
        <dd className="min-w-0 font-medium">{t.betreff}</dd>
        {t.anhaenge.length ? (
          <>
            <dt className="text-[color:var(--muted)]">Anhang</dt>
            <dd className="flex min-w-0 items-center gap-1 break-all">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" /> {t.anhaenge.join(", ")}
            </dd>
          </>
        ) : null}
      </dl>
      {t.hinweis ? (
        <div className="border-t border-[color:var(--border)] px-4 py-2">
          <Hinweis text={t.hinweis} />
        </div>
      ) : null}
      <iframe
        title={`E-Mail: ${t.betreff}`}
        // Keine Skripte; gleiche Herkunft nur, um die Höhe zu messen; Links öffnen in neuem Tab
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={vorschauDokument(t.html)}
        className="block w-full border-t border-[color:var(--border)] bg-white"
        style={{ height: hoehe }}
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument;
          if (doc) setHoehe(Math.max(160, doc.documentElement.scrollHeight));
        }}
      />
    </div>
  );
}

function WhatsAppVorschau({ t }: { t: WhatsAppTeil }) {
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[#efeae2] p-3" data-vorschau-kanal="whatsapp">
      <div className="text-xs text-[#54656f]">An {t.an ? (/^\d/.test(t.an) ? `+${t.an}` : t.an) : "keine Handynummer"}</div>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm leading-relaxed text-[#111b21] shadow-sm">{t.text}</div>
      {t.hinweis ? (
        <div className="rounded bg-white/70 px-2 py-1.5">
          <Hinweis text={t.hinweis} />
        </div>
      ) : null}
    </div>
  );
}

/** Alle Teile einer Nachricht untereinander, je Kanal mit Überschrift (nur bei mehr als einem Kanal). */
export function NachrichtVorschauTeile({ teile }: { teile: VorschauTeil[] }) {
  const mehrere = teile.length > 1;
  return (
    <div className="space-y-4" data-nachricht-vorschau>
      {teile.map((t, i) => (
        <section key={i} className="space-y-2">
          {mehrere ? (
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              {t.kanal === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
              {t.kanal === "email" ? "E-Mail" : "WhatsApp"}
            </h3>
          ) : null}
          {t.kanal === "email" ? <MailVorschau t={t} /> : <WhatsAppVorschau t={t} />}
        </section>
      ))}
    </div>
  );
}
