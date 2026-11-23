"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GitMerge, Pencil, Star, X } from "lucide-react";
import {
  addContactEmailAction,
  addContactPhoneAction,
  makePrimaryEmailAction,
  makePrimaryPhoneAction,
  mergeContactsAction,
  removeContactEmailAction,
  removeContactPhoneAction,
  updatePrimaryEmailAction,
  searchMergeCandidatesAction,
  type ContactEmailState,
} from "@/app/admin/vertrieb/actions";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

export type MergeCandidate = { id: string; name: string; email: string; city: string | null; stage: string; createdAt: Date | string; reason?: string };

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** Weitere Angaben: die ersten zwei sichtbar, der Rest eingeklappt. */
function Extras<T>({ items, render }: { items: T[]; render: (x: T) => React.ReactNode }) {
  const shown = items.slice(0, 2);
  const rest = items.slice(2);
  return (
    <>
      {shown.map(render)}
      {rest.length ? (
        <details className="group/mehr">
          <summary className="cursor-pointer list-none text-xs text-slate-500 hover:text-slate-700 group-open/mehr:hidden [&::-webkit-details-marker]:hidden">
            {rest.length} weitere anzeigen
          </summary>
          <div className="space-y-1.5">{rest.map(render)}</div>
        </details>
      ) : null}
    </>
  );
}

/** Eine weitere Angabe: Wert, Herkunft, „Als Haupt setzen“ und „Entfernen“ mit einem Klick. */
function ExtraRow({ href, value, badge, source, onPrimary, onRemove }: { href: string; value: string; badge?: string; source?: string; onPrimary: () => void; onRemove: () => void }) {
  // Wert und Knöpfe in einer Zeile, Typ und Herkunft klein darunter (passt auch auf 390 px)
  return (
    <div className="min-w-0" data-weitere-angabe>
      <div className="flex items-center gap-1.5">
        <a href={href} className="truncate text-sky-700 hover:underline">{value}</a>
        <button type="button" title="Als Haupt setzen" aria-label={`${value} als Haupt setzen`} className="shrink-0 p-1 text-slate-400 hover:text-amber-600" onClick={onPrimary}>
          <Star className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Entfernen" aria-label={`${value} entfernen`} className="shrink-0 p-1 text-slate-400 hover:text-rose-600" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {badge || source ? <div className="text-xs text-slate-400">{[badge, source].filter(Boolean).join(" · ")}</div> : null}
    </div>
  );
}

export type ExtraPhone = { id: string; phone: string; display: string; kind: string; source: string };

/** Haupt- und weitere Telefonnummern (automatisch erkannt aus Buchungen, Signaturen, Formularen). */
export function ContactPhones({ contactId, phone, extras }: { contactId: string; phone: string | null; extras: ExtraPhone[] }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [state, action, adding] = useActionState<ContactEmailState, FormData>(async (prev, f) => {
    const r = await addContactPhoneAction(prev, f);
    if (r?.ok) {
      formRef.current?.reset();
      if (detailsRef.current) detailsRef.current.open = false;
    }
    return r;
  }, null);
  return (
    <div className={clsx("space-y-1.5", pending && "opacity-60")} data-kontakt-telefon>
      {phone ? (
        <div className="flex items-center gap-2">
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="truncate text-sky-700 hover:underline">{phone}</a>
          <span className="badge bg-slate-100 text-slate-600">Haupt</span>
        </div>
      ) : (
        <span className="text-slate-400">keine Nummer</span>
      )}
      <Extras
        items={extras}
        render={(p) => (
          <ExtraRow
            key={p.id}
            href={`tel:${p.phone}`}
            value={p.display}
            badge={p.kind}
            source={p.source}
            onPrimary={() => start(() => makePrimaryPhoneAction(fd({ contactId, phoneId: p.id })))}
            onRemove={() => start(() => removeContactPhoneAction(fd({ contactId, phoneId: p.id })))}
          />
        )}
      />
      {/* Wie „+ Weitere E-Mail“: von Hand eine zusätzliche Nummer (Ole, 23.11.2026) */}
      <details ref={detailsRef} open={!!state?.error || undefined} data-weitere-telefon>
        <summary className="cursor-pointer list-none text-xs text-slate-500 hover:text-slate-700 [&::-webkit-details-marker]:hidden">+ Weitere Telefonnummer</summary>
        <form ref={formRef} action={action} className="flex flex-wrap gap-2 pt-1">
          <input type="hidden" name="contactId" value={contactId} />
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" required placeholder="z. B. 0171 1234567" className="input h-8 min-w-[11rem] flex-1 text-sm" />
          <button className="btn-ghost h-8 text-sm" disabled={adding}>Hinzufügen</button>
        </form>
        {state?.error ? <p className="mt-1 text-xs text-rose-600">{state.error}</p> : null}
      </details>
    </div>
  );
}

/** Haupt- und weitere E-Mail-Adressen eines Kontakts. `sources`: Herkunft je weiterer Adresse („aus Buchung 14.11.“). */
export function ContactEmails({ contactId, email, altEmails, sources = {} }: { contactId: string; email: string; altEmails: string[]; sources?: Record<string, string> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, adding] = useActionState<ContactEmailState, FormData>(async (prev, f) => {
    const r = await addContactEmailAction(prev, f);
    if (r?.ok) formRef.current?.reset();
    return r;
  }, null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editState, editAction, saving] = useActionState<ContactEmailState, FormData>(async (prev, f) => {
    const r = await updatePrimaryEmailAction(prev, f);
    if (r?.ok) setEditing(false);
    return r;
  }, null);
  return (
    <div className={clsx("space-y-1.5", pending && "opacity-60")}>
      {editing ? (
        <form action={editAction} className="flex gap-2" data-email-edit>
          <input type="hidden" name="contactId" value={contactId} />
          <input name="email" type="email" required defaultValue={email} autoFocus className="input h-8 min-w-0 flex-1 text-sm" />
          <button className="btn-primary h-8 text-sm" disabled={saving}>Speichern</button>
          <button type="button" className="btn-ghost h-8 text-sm" onClick={() => setEditing(false)}>Abbrechen</button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <a href={`mailto:${email}`} className="truncate text-sky-700 hover:underline">{email}</a>
          <span className="badge bg-slate-100 text-slate-600">Haupt</span>
          <button type="button" title="E-Mail korrigieren" aria-label="Haupt-E-Mail bearbeiten" className="-m-3 p-3 text-slate-400 hover:text-sky-700" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {editState?.error ? <p className="text-xs text-rose-600">{editState.error}</p> : null}
      {editing ? <p className="text-xs text-slate-500">Ersetzt die Adresse, auch in offenen Angeboten an diesen Kontakt.</p> : null}
      <Extras
        items={altEmails}
        render={(e) => (
          <ExtraRow
            key={e}
            href={`mailto:${e}`}
            value={e}
            source={sources[e]}
            onPrimary={() => start(() => makePrimaryEmailAction(fd({ contactId, email: e })))}
            onRemove={() => start(() => removeContactEmailAction(fd({ contactId, email: e })))}
          />
        )}
      />
      {/* Selten gebraucht: neue Adressen kommen meist automatisch aus Buchungen und Mails */}
      <details open={!!state?.error}>
        <summary className="cursor-pointer list-none text-xs text-slate-500 hover:text-slate-700 [&::-webkit-details-marker]:hidden">+ Weitere E-Mail</summary>
        <form ref={formRef} action={action} className="flex gap-2 pt-1">
          <input type="hidden" name="contactId" value={contactId} />
          <input name="email" type="email" required placeholder="Weitere E-Mail" className="input h-8 min-w-0 flex-1 text-sm" />
          <button className="btn-ghost h-8 text-sm" disabled={adding}>Hinzufügen</button>
        </form>
        {state?.error ? <p className="mt-1 text-xs text-rose-600">{state.error}</p> : null}
        <p className="mt-1 text-xs text-slate-500">Weitere Adressen werden Buchungen, Cold Mails und Anfragen zugeordnet.</p>
      </details>
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Agentur, E-Mail oder Telefon" className="input w-full" autoFocus />
            {q.trim().length < 2 && suggestions.length ? <p className="text-xs font-medium text-slate-500">Mögliche Dubletten</p> : null}
            <ul className="divide-y divide-slate-100 rounded-lg border border-[color:var(--border)]">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setPicked(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-slate-500">{r.email}{r.city ? ` · ${r.city}` : ""}</div>
                    {r.reason ? <div className="text-xs text-amber-700">{r.reason}</div> : null}
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

/** Hinweis „Mögliche Dublette“ oben in der Kontaktakte: höchstens 3, mit Grund. */
export function DuplicateHint({ contactId, contactName, duplicates }: { contactId: string; contactName: string; duplicates: MergeCandidate[] }) {
  const [pick, setPick] = useState<MergeCandidate | null>(null);
  if (!duplicates.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-medium">{duplicates.length === 1 ? "Mögliche Dublette" : "Mögliche Dubletten"}</div>
      <ul className="mt-1 space-y-1">
        {duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-x-2">
            <a href={`/admin/neu/vertrieb/kontakte/${d.id}`} className="underline">{d.name}</a>
            {d.reason ? <span className="text-amber-800">{d.reason}</span> : null}
            <button type="button" className="font-semibold text-[color:var(--brand)] hover:underline" onClick={() => setPick(d)}>
              Zusammenführen
            </button>
          </li>
        ))}
      </ul>
      {pick ? <MergeSheet key={pick.id} open onClose={() => setPick(null)} contactId={contactId} contactName={contactName} suggestions={duplicates} preselect={pick} /> : null}
    </div>
  );
}
