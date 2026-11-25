"use client";

// Knopf „Support-Zugriff“ an einer Datei im Admin-Chat (Ole, 25.11.2026, lib/support-zugriff.ts). Fragt den Grund ab
// (Pflicht, mindestens 10 Zeichen), protokolliert, informiert den Vermittler und öffnet die Datei in einem neuen Tab
// (Link 15 Minuten gültig). Das Fenster wird vor dem Serveraufruf geöffnet, damit der Browser es nicht blockiert.

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { GRUND_MAX, GRUND_MIN } from "@/lib/chat-dateien";
import { supportZugriffAction } from "@/app/admin/whatsapp/support-zugriff-actions";

export function SupportZugriffKnopf({ messageId, titel }: { messageId: string; titel: string }) {
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const laenge = grund.replace(/\s+/g, " ").trim().length;
  const fehlt = Math.max(0, GRUND_MIN - laenge);

  const schliessen = () => {
    setOffen(false);
    setFehler(null);
    setLink(null);
    setGrund("");
  };

  const oeffnen = () => {
    if (fehlt > 0) {
      setFehler(`Bitte einen Grund mit mindestens ${GRUND_MIN} Zeichen angeben.`);
      return;
    }
    const fenster = window.open("", "_blank");
    start(async () => {
      const r = await supportZugriffAction(messageId, grund);
      if (!r.ok) {
        fenster?.close();
        setFehler(r.error);
        return;
      }
      if (fenster) {
        fenster.opener = null;
        fenster.location.href = r.url;
        toast.show({ message: "Geöffnet und protokolliert. Der Vermittler ist informiert." });
        schliessen();
      } else {
        setLink(r.url);
      }
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOffen(true)} className={buttonClass("secondary", "sm", "w-full")} data-support-zugriff={messageId}>
        <Eye className="h-3.5 w-3.5" /> Support-Zugriff
      </button>
      <Sheet open={offen} onClose={schliessen} title="Dokument öffnen" message="Der Vermittler wird informiert und sieht den Zugriff im Protokoll.">
        <div className="space-y-3 px-5 py-4">
          <p className="truncate text-sm font-medium" title={titel}>
            {titel}
          </p>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={schliessen} className={buttonClass("primary", "md", "w-full")}>
              Dokument jetzt öffnen
            </a>
          ) : (
            <>
              <label className="block text-sm font-medium" htmlFor={`grund-${messageId}`}>
                Grund
              </label>
              <textarea
                id={`grund-${messageId}`}
                value={grund}
                maxLength={GRUND_MAX}
                rows={3}
                autoFocus
                onChange={(e) => {
                  setGrund(e.target.value);
                  setFehler(null);
                }}
                placeholder="z. B. Vermittler bittet um Prüfung des Angebots"
                className="mt-1 w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-base sm:text-sm"
                aria-invalid={!!fehler}
                aria-describedby={`grund-hinweis-${messageId}`}
              />
              <p id={`grund-hinweis-${messageId}`} className={fehler ? "text-xs text-rose-700" : "text-xs text-[color:var(--muted)]"} aria-live="polite">
                {fehler ?? (fehlt > 0 ? `Noch ${fehlt} Zeichen` : "Link gilt 15 Minuten, nur für Sie.")}
              </p>
              <button type="button" onClick={oeffnen} disabled={pending} className={buttonClass("primary", "md", "w-full")}>
                {pending ? "Öffnet …" : "Dokument öffnen"}
              </button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
