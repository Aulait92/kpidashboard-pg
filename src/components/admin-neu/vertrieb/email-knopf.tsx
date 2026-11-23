"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { sendKontaktMailAction } from "@/app/admin/neu/vertrieb/crm-mail-actions";
import { vorlageFuellen, type CrmVorlage, type CrmWerte } from "@/lib/vertrieb/crm-vorlagen";
import { cn } from "@/lib/utils";

// Kontaktakte (Ole, 23.11.2026): „E-Mail“ öffnet ein Fenster statt mailto. Wer: Ole bzw. ein Admin am Kontakt, Aufgabe:
// schnell eine Mail mit Vorlage schreiben, die aus dem eigenen Postfach rausgeht und im Verlauf steht.
// Aufbau: Vorlage und Sie/Du in einer Zeile, An (Auswahl nur bei mehreren Adressen), Betreff, Text, unten „Senden“.
// Ohne verbundenes Postfach: leerer Zustand mit „Mit Microsoft verbinden“ (Google, wenn eingerichtet), dazu der alte
// Weg übers Mailprogramm als Link. Rücksprung nach dem Verbinden öffnet das Fenster wieder (?postfach=verbunden).

export type EmailKnopfDaten = {
  postfach: { provider: string; email: string; status: string } | null;
  empfaenger: string[];
  vorlagen: CrmVorlage[];
  werte: { sie: CrmWerte; du: CrmWerte };
  gesperrt: string | null;
  anbieter: ("microsoft" | "google")[];
  freigabeUrl: string | null;
};

const VERBINDEN = "/api/admin/crm-postfach/verbinden";

export function EmailKnopf({
  contactId,
  daten,
  variant = "secondary",
  label = "E-Mail",
  meldung,
}: {
  contactId: string;
  daten: EmailKnopfDaten;
  variant?: "primary" | "secondary";
  label?: string;
  /** Rücksprung vom Verbinden (?postfach=…): Fenster öffnen und Meldung zeigen */
  meldung?: { ok: boolean; text: string } | null;
}) {
  const [offen, setOffen] = useState(!!meldung);
  useEffect(() => {
    if (!meldung) return;
    // ?postfach=… aus der Adresse nehmen, damit Neuladen das Fenster nicht wieder öffnet
    const u = new URL(window.location.href);
    u.searchParams.delete("postfach");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }, [meldung]);
  const erste = daten.empfaenger[0] ?? "";
  return (
    <>
      <button type="button" onClick={() => setOffen(true)} className={buttonClass(variant, "md")} aria-label="E-Mail schreiben" data-email-knopf>
        <Mail className="h-4 w-4" /> <span className={variant === "primary" ? undefined : "hidden sm:inline"}>{label}</span>
      </button>
      {offen ? (
        <EmailFenster contactId={contactId} daten={daten} meldung={meldung ?? null} onClose={() => setOffen(false)} mailto={erste ? `mailto:${erste}` : null} />
      ) : null}
    </>
  );
}

function EmailFenster({ contactId, daten, meldung, onClose, mailto }: { contactId: string; daten: EmailKnopfDaten; meldung: { ok: boolean; text: string } | null; onClose: () => void; mailto: string | null }) {
  const toast = useToast();
  const [vorlageId, setVorlageId] = useState("");
  const [du, setDu] = useState(false);
  const [to, setTo] = useState(daten.empfaenger[0] ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fehler, setFehler] = useState<string | null>(meldung && !meldung.ok ? meldung.text : null);
  const [pending, start] = useTransition();
  // Zuletzt automatisch gefüllter Text: nur den überschreibt ein Wechsel von Sie/Du, eigene Änderungen bleiben
  const auto = useRef({ subject: "", body: "" });

  function fuellen(id: string, alsDu: boolean, immer: boolean) {
    const v = daten.vorlagen.find((x) => x.id === id);
    if (!v) return;
    const f = vorlageFuellen(v, alsDu ? daten.werte.du : daten.werte.sie, alsDu);
    const unveraendert = subject === auto.current.subject && body === auto.current.body;
    if (!immer && !unveraendert) return;
    auto.current = f;
    setSubject(f.subject);
    setBody(f.body);
  }

  function senden() {
    setFehler(null);
    start(async () => {
      const r = await sendKontaktMailAction(contactId, { to, subject, body }).catch(() => ({ ok: false as const, error: "Senden hat nicht geklappt. Bitte noch einmal versuchen." }));
      if (!r.ok) {
        setFehler(r.error);
        return;
      }
      toast.show({ message: r.hinweis });
      onClose();
    });
  }

  const titel = "E-Mail schreiben";
  if (daten.gesperrt) {
    return (
      <Sheet open onClose={onClose} title={titel}>
        <p className="px-5 py-5 text-sm text-[color:var(--muted)]" data-email-gesperrt>
          {daten.gesperrt} Es wird keine E-Mail gesendet.
        </p>
      </Sheet>
    );
  }

  if (!daten.postfach) {
    return (
      <Sheet open onClose={onClose} title={titel}>
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center" data-email-ohne-postfach>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">
            <Mail className="h-5 w-5" />
          </span>
          <div className="text-sm font-semibold">Postfach verbinden</div>
          <p className="max-w-sm text-sm text-[color:var(--muted)]">Dann gehen E-Mails aus Ihrem Postfach raus und liegen im Gesendet-Ordner.</p>
          {fehler ? <p className="max-w-sm text-sm text-rose-700">{fehler}</p> : null}
          {daten.anbieter.length ? (
            <div className="flex w-full max-w-xs flex-col gap-2">
              {daten.anbieter.map((a, i) => (
                <a key={a} href={`${VERBINDEN}?anbieter=${a}`} className={buttonClass(i === 0 ? "primary" : "secondary", "md", "w-full justify-center")}>
                  {a === "google" ? "Mit Google verbinden" : "Mit Microsoft verbinden"}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-800">Anmeldung bei Microsoft bzw. Google ist auf dem Server nicht eingerichtet.</p>
          )}
          {meldung && !meldung.ok && daten.freigabeUrl ? (
            <a href={daten.freigabeUrl} className="text-sm text-[color:var(--brand)] hover:underline" target="_blank" rel="noreferrer">
              Microsoft-Freigabe öffnen
            </a>
          ) : null}
          {mailto ? (
            <a href={mailto} className="text-sm text-[color:var(--muted)] hover:underline">
              Stattdessen im Mailprogramm schreiben
            </a>
          ) : null}
        </div>
      </Sheet>
    );
  }

  const footer = (
    <div className="flex shrink-0 gap-2 border-t border-[color:var(--border)] px-5 py-3">
      <button type="button" onClick={onClose} className={buttonClass("secondary", "md", "flex-1 justify-center")}>
        Abbrechen
      </button>
      <button type="submit" form="kontakt-mail" disabled={pending || !to} className={buttonClass("primary", "md", "flex-1 justify-center")} data-email-senden>
        {pending ? "Wird gesendet …" : "Senden"}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={titel} message={`Von ${daten.postfach.email}`} footer={footer}>
      <form
        id="kontakt-mail"
        className="space-y-3 px-5 pb-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          senden();
        }}
      >
        {meldung?.ok ? <p className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{meldung.text}</p> : null}
        <div className="flex items-end gap-2">
          <label className="block min-w-0 flex-1">
            <span className="label">Vorlage</span>
            <select
              className="input w-full"
              value={vorlageId}
              onChange={(e) => {
                setVorlageId(e.target.value);
                fuellen(e.target.value, du, true);
              }}
              data-email-vorlage
            >
              <option value="">Ohne Vorlage</option>
              {daten.vorlagen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex h-10 shrink-0 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-0.5 text-sm" role="group" aria-label="Ansprache">
            {[false, true].map((x) => (
              <button
                key={String(x)}
                type="button"
                aria-pressed={du === x}
                onClick={() => {
                  setDu(x);
                  fuellen(vorlageId, x, false);
                }}
                className={cn("rounded-[calc(var(--radius-md)-2px)] px-3 font-medium", du === x ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)]")}
              >
                {x ? "Du" : "Sie"}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label">An</span>
          {daten.empfaenger.length > 1 ? (
            <select className="input w-full" value={to} onChange={(e) => setTo(e.target.value)}>
              {daten.empfaenger.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <input className="input w-full" value={to} readOnly />
          )}
        </label>
        <label className="block">
          <span className="label">Betreff</span>
          <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
        </label>
        <label className="block">
          <span className="label">Text</span>
          <textarea className="input w-full" rows={10} value={body} onChange={(e) => setBody(e.target.value)} required />
        </label>
        {fehler ? (
          <p className="text-sm text-rose-700" role="alert">
            {fehler}
            {/neu verbinden/i.test(fehler) ? (
              <>
                {" "}
                <a href={`${VERBINDEN}?anbieter=${daten.postfach.provider === "google" ? "google" : "microsoft"}`} className="font-medium underline">
                  Jetzt neu verbinden
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
