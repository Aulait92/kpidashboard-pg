"use client";

// Karte „Ihre Buchungsseite“ unter Mein Kalender: Link zur eigenen Buchungsseite (/book/<slug>)
// mit Kopieren und Öffnen (Ole, 14.11.2026; auch für das Google-Demo-Video).
// Kurzname änderbar (Ole, 17.11.2026): „Ändern“ neben dem Link, nur Inhaber; der alte Link leitet weiter.

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Link2, Pencil } from "lucide-react";
import { Button, buttonClass, Card, CardHeader } from "@/components/ui";
import { setBookingSlugAction } from "@/app/buyer/kalender/actions";

export function BookingLinkCard({
  url: start,
  slug: startSlug,
  calendarConnected,
  kannAendern = false,
}: {
  url: string | null;
  slug?: string | null;
  calendarConnected: boolean;
  kannAendern?: boolean;
}) {
  const [url, setUrl] = useState(start);
  const [slug, setSlug] = useState(startSlug ?? null);
  const [copied, setCopied] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [eingabe, setEingabe] = useState(startSlug ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [pending, start2] = useTransition();
  // Fester Anfang des Links (alles vor dem Kurznamen)
  const anfang = url && slug && url.endsWith(slug) ? url.slice(0, url.length - slug.length) : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };
  const speichern = () =>
    start2(async () => {
      setFehler(null);
      const r = await setBookingSlugAction(eingabe);
      if (!r.ok || !r.slug || !r.url) return setFehler(r.error ?? "Das hat nicht geklappt.");
      setSlug(r.slug);
      setUrl(r.url);
      setEingabe(r.slug);
      setBearbeiten(false);
      setGespeichert(true);
    });

  return (
    <Card className="mb-6" data-buchungsseite>
      <CardHeader title="Ihre Buchungsseite" icon={Link2} />
      <div className="space-y-3 p-5 text-[15px]">
        <p className="text-[color:var(--muted)]">
          Über diesen Link buchen Interessenten selbst einen Termin bei Ihnen. Ideal für Ihre E-Mail-Signatur, WhatsApp und Ihre Website.
        </p>
        {url && bearbeiten && anfang ? (
          <div className="space-y-2" data-buchungslink-bearbeiten>
            <label className="flex min-w-0 items-center overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-strong)] bg-white font-mono text-sm focus-within:border-[color:var(--brand)]">
              <span className="shrink-0 truncate bg-[color:var(--surface-sunken)] px-3 py-2 text-[color:var(--muted)] max-sm:max-w-[45%]">{anfang}</span>
              <input
                autoFocus
                aria-label="Kurzname im Link"
                value={eingabe}
                maxLength={40}
                onChange={(e) => setEingabe(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") speichern();
                  if (e.key === "Escape") setBearbeiten(false);
                }}
                className="h-10 min-w-0 flex-1 bg-transparent px-1 outline-none"
              />
            </label>
            {fehler ? <p className="text-sm text-rose-700">{fehler}</p> : <p className="text-xs text-[color:var(--muted)]">Der bisherige Link leitet automatisch auf den neuen weiter.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" icon={Check} disabled={pending || !eingabe.trim()} onClick={speichern}>
                {pending ? "Speichert …" : "Speichern"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setBearbeiten(false);
                  setEingabe(slug ?? "");
                  setFehler(null);
                }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        ) : url ? (
          <>
            <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2">
              <span className="min-w-0 flex-1 break-all font-mono text-sm" data-buchungslink>
                {url}
              </span>
              {kannAendern && anfang ? (
                <button
                  type="button"
                  onClick={() => {
                    setBearbeiten(true);
                    setGespeichert(false);
                  }}
                  className="-my-1 inline-flex min-h-8 shrink-0 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline"
                  data-buchungslink-aendern
                >
                  <Pencil className="h-3.5 w-3.5" /> Ändern
                </button>
              ) : null}
            </div>
            {gespeichert ? <p className="text-sm text-emerald-700">Gespeichert. Der bisherige Link leitet weiter.</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={buttonClass("primary", "sm")}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Kopiert" : "Kopieren"}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                <ExternalLink className="h-4 w-4" /> Öffnen
              </a>
            </div>
          </>
        ) : null}
        {!calendarConnected ? (
          <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Verbinden Sie zuerst Ihren Kalender, dann zeigt die Seite nur Ihre freien Zeiten.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
