"use client";

// Einstellungen → Mail- und WhatsApp-Vorlagen: Vorlagen für E-Mails aus der Kontaktakte (Ole, 23.11.2026).
// Eine Zeile je Vorlage (Name, Betreff), Antippen klappt das Formular auf. Unten „+ Neue Vorlage“.

import { useState, useTransition } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { crmVorlageLoeschenAction, crmVorlageSpeichernAction } from "@/app/admin/neu/vertrieb/crm-mail-actions";
import { CRM_PLATZHALTER, type CrmVorlage } from "@/lib/vertrieb/crm-vorlagen";
import { cn } from "@/lib/utils";

function Formular({ v, onDone }: { v: CrmVorlage | null; onDone: () => void }) {
  const [name, setName] = useState(v?.name ?? "");
  const [subject, setSubject] = useState(v?.subject ?? "");
  const [body, setBody] = useState(v?.body ?? "{anrede},\n\n\n\nViele Grüße\n{ole}");
  const [bodyDu, setBodyDu] = useState(v?.bodyDu ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const speichern = () =>
    start(async () => {
      const r = await crmVorlageSpeichernAction({ id: v?.id ?? null, name, subject, body, bodyDu });
      if (!r.ok) return setFehler(r.error);
      setFehler(null);
      onDone();
    });
  const loeschen = () =>
    start(async () => {
      if (!v || !window.confirm(`Vorlage „${v.name}“ löschen?`)) return;
      await crmVorlageLoeschenAction(v.id);
      onDone();
    });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        speichern();
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </label>
      <label className="block">
        <span className="label">Betreff</span>
        <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
      </label>
      <label className="block">
        <span className="label">Text (Sie)</span>
        <textarea className="input w-full" rows={8} value={body} onChange={(e) => setBody(e.target.value)} required />
      </label>
      <label className="block">
        <span className="label">Text (Du), optional</span>
        <textarea className="input w-full" rows={6} value={bodyDu} onChange={(e) => setBodyDu(e.target.value)} placeholder="Leer: auch bei Du der Sie-Text" />
      </label>
      <p className="text-xs text-[color:var(--muted)]">Platzhalter: {CRM_PLATZHALTER.join(" ")}. Ohne Angebot entfällt die Zeile mit {"{angebotslink}"}.</p>
      {fehler ? <p className="text-sm text-rose-700">{fehler}</p> : null}
      <div className="flex justify-between gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          Speichern
        </button>
        {v ? (
          <button type="button" onClick={loeschen} disabled={pending} className={buttonClass("danger", "md")}>
            <Trash2 className="h-4 w-4" /> Löschen
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function CrmVorlagenListe({ vorlagen }: { vorlagen: CrmVorlage[] }) {
  const [offen, setOffen] = useState<string | null>(null);
  const zu = () => setOffen(null);
  return (
    <ul className="divide-y divide-[color:var(--border)]" data-crm-vorlagen>
      {vorlagen.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => setOffen((o) => (o === v.id ? null : v.id))}
            aria-expanded={offen === v.id}
            className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--surface-sunken)] sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{v.name}</span>
              <span className="block truncate text-xs text-[color:var(--muted)]">{v.subject}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-[color:var(--muted)] transition", offen === v.id && "rotate-180")} />
          </button>
          {offen === v.id ? (
            <div className="px-4 pb-4 sm:px-5">
              <Formular key={`${v.id}-${v.subject}-${v.body.length}`} v={v} onDone={zu} />
            </div>
          ) : null}
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => setOffen((o) => (o === "neu" ? null : "neu"))}
          aria-expanded={offen === "neu"}
          className="flex min-h-11 w-full items-center px-4 text-left text-sm font-medium text-[color:var(--brand)] sm:px-5"
        >
          + Neue Vorlage
        </button>
        {offen === "neu" ? (
          <div className="px-4 pb-4 sm:px-5">
            <Formular v={null} onDone={zu} />
          </div>
        ) : null}
      </li>
    </ul>
  );
}
