"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GitMerge, Star, X } from "lucide-react";
import {
  addContactEmailAction,
  makePrimaryEmailAction,
  mergeContactsAction,
  removeContactEmailAction,
  searchMergeCandidatesAction,
  type ContactEmailState,
} from "@/app/admin/vertrieb/actions";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

export type MergeCandidate = { id: string; name: string; email: string; city: string | null; stage: string; createdAt: Date | string };

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** Haupt- und weitere E-Mail-Adressen eines Kontakts. */
export function ContactEmails({ contactId, email, altEmails }: { contactId: string; email: string; altEmails: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, adding] = useActionState<ContactEmailState, FormData>(async (prev, f) => {
    const r = await addContactEmailAction(prev, f);
    if (r?.ok) formRef.current?.reset();
    return r;
  }, null);
  const [pending, start] = useTransition();
  return (
    <div className={clsx("space-y-1.5", pending && "opacity-60")}>
      <div className="flex items-center gap-2">
        <a href={`mailto:${email}`} className="truncate text-sky-700 hover:underline">{email}</a>
        <span className="badge bg-slate-100 text-slate-600">Haupt</span>
      </div>
      {altEmails.map((e) => (
        <div key={e} className="flex items-center gap-2">
          <a href={`mailto:${e}`} className="truncate text-sky-700 hover:underline">{e}</a>
          <button type="button" title="Als Haupt-E-Mail" aria-label={`${e} als Haupt-E-Mail`} className="text-slate-400 hover:text-amber-600" onClick={() => start(() => makePrimaryEmailAction(fd({ contactId, email: e })))}>
            <Star className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Entfernen" aria-label={`${e} entfernen`} className="text-slate-400 hover:text-rose-600" onClick={() => start(() => removeContactEmailAction(fd({ contactId, email: e })))}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <form ref={formRef} action={action} className="flex gap-2 pt-1">
        <input type="hidden" name="contactId" value={contactId} />
        <input name="email" type="email" required placeholder="Weitere E-Mail hinzufügen" className="input h-8 min-w-0 flex-1 text-sm" />
        <button className="btn-ghost h-8 text-sm" disabled={adding}>Hinzufügen</button>
      </form>
      {state?.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
      <p className="text-xs text-slate-500">Weitere Adressen werden bei Calendly-Buchungen, Cold Mails und Anfragen diesem Kontakt zugeordnet.</p>
    </div>
  );
}

/** „Mit anderem Kontakt zusammenführen“: Suche, Auswahl, Bestätigung. Nur geöffnet rendern (Startzustand = preselect). */
export function MergeSheet({
  open,
  onClose,
  contactId,
  contactName,
  suggestions,
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  suggestions: MergeCandidate[];
  preselect?: MergeCandidate | null;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MergeCandidate[]>([]);
  const [picked, setPicked] = useState<MergeCandidate | null>(preselect ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Suche mit kurzer Verzögerung (nur das Ergebnis der Server-Action setzt State)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      searchMergeCandidatesAction(contactId, term)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, contactId]);
  const list = q.trim().length >= 2 ? results : suggestions;

  return (
    <Sheet open={open} onClose={onClose} title="Mit anderem Kontakt zusammenführen" message={`Der gewählte Kontakt wird in „${contactName}“ übernommen.`}>
      <div className="space-y-3 p-5">
        {picked ? (
          <>
            <div className="rounded-lg border border-[color:var(--border)] p-3 text-sm">
              <div className="font-medium">{picked.name}</div>
              <div className="text-slate-500">{picked.email}{picked.city ? ` · ${picked.city}` : ""} · angelegt {fmtDate(picked.createdAt)}</div>
            </div>
            <p className="text-sm text-slate-600">
              Verlauf, Aufgaben, Mails, Termine und Angebote von „{picked.name}“ wandern zu „{contactName}“. Leere Felder werden ergänzt, die E-Mail wird als weitere
              Adresse gespeichert. Danach wird „{picked.name}“ gelöscht.
            </p>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await mergeContactsAction(contactId, picked.id);
                  if (r && "error" in r) setError(r.error);
                })
              }
            >
              <GitMerge className="h-4 w-4" /> Zusammenführen
            </Button>
            <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => setPicked(null)}>
              Anderen Kontakt wählen
            </button>
          </>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Agentur oder E-Mail suchen" className="input w-full" autoFocus />
            {q.trim().length < 2 && suggestions.length ? <p className="text-xs font-medium text-slate-500">Mögliche Dubletten</p> : null}
            <ul className="divide-y divide-slate-100 rounded-lg border border-[color:var(--border)]">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setPicked(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-slate-500">{r.email}{r.city ? ` · ${r.city}` : ""}</div>
                  </button>
                </li>
              ))}
              {!list.length ? <li className="px-3 py-2 text-sm text-slate-500">{q.trim().length >= 2 ? "Nichts gefunden." : "Suchbegriff eingeben."}</li> : null}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Hinweis „Mögliche Dublette“ oben in der Kontaktakte. */
export function DuplicateHint({ contactId, contactName, duplicates }: { contactId: string; contactName: string; duplicates: MergeCandidate[] }) {
  const [pick, setPick] = useState<MergeCandidate | null>(null);
  if (!duplicates.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="font-medium">Mögliche Dublette:</span>{" "}
      {duplicates.map((d, i) => (
        <span key={d.id}>
          {i > 0 ? ", " : ""}
          <a href={`/admin/vertrieb/kontakte/${d.id}`} className="underline">{d.name}</a> ({d.email}){" "}
          <button type="button" className="font-semibold text-[color:var(--brand)] hover:underline" onClick={() => setPick(d)}>
            hier zusammenführen
          </button>
        </span>
      ))}
      {pick ? <MergeSheet key={pick.id} open onClose={() => setPick(null)} contactId={contactId} contactName={contactName} suggestions={duplicates} preselect={pick} /> : null}
    </div>
  );
}
