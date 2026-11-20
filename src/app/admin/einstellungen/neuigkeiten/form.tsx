"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Sparkles, Trash2, ChevronDown } from "lucide-react";
import { UpdateEntry } from "@/components/neuigkeiten";
import { AUDIENCE_LABEL, KIND_LABEL, UPDATE_AUDIENCES, UPDATE_KINDS, asKind, type UpdateView } from "@/lib/neuigkeiten-shared";
import { deleteUpdateAction, draftUpdateAction, saveUpdateAction, type UpdateFormState } from "./actions";

const EMPTY: UpdateView = { id: "", title: "", body: "", kind: "neu", audience: "alle", publishedAt: null };
const input = "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px]";

// UX-Umbau 20.11.2026: Einträge entstehen meist automatisch (Migration je Änderung). Darum zuerst die Liste mit EINER
// Hauptaktion „Neuer Eintrag“; der Editor (mit KI-Entwurf eingeklappt und Vorschau) öffnet sich erst beim Anlegen oder
// Bearbeiten. Die Liste zeigt die neuesten Einträge, der Rest hinter „Alle zeigen“.
const ERSTE = 12;

export function NeuigkeitenAdmin({ items }: { items: UpdateView[] }) {
  const [edit, setEdit] = useState<UpdateView | null>(null);
  const [key, setKey] = useState(0);
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? items : items.slice(0, ERSTE);
  const oeffnen = (u: UpdateView) => {
    setEdit(u);
    setKey((k) => k + 1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className={edit ? "grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]" : "max-w-3xl"}>
      {edit ? <Editor key={key} initial={edit} onDone={() => setEdit(null)} /> : null}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[color:var(--muted)]">
            Alle Einträge <span className="font-normal">{items.length}</span>
          </h2>
          {edit ? null : (
            <button
              type="button"
              onClick={() => oeffnen(EMPTY)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" /> Neuer Eintrag
            </button>
          )}
        </div>
        {!items.length ? <p className="text-sm text-[color:var(--muted)]">Noch keine Einträge. Neue entstehen automatisch mit jeder Änderung für Kunden.</p> : null}
        <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white">
          {sichtbar.map((u) => (
            <li key={u.id} className="flex items-center gap-1 pl-4 pr-2">
              <button type="button" className="min-w-0 flex-1 py-3 text-left" aria-label={`${u.title} bearbeiten`} onClick={() => oeffnen(u)}>
                <span className="block truncate text-sm font-medium">{u.title}</span>
                <span className="block text-sm text-[color:var(--muted)]">
                  {KIND_LABEL[u.kind]} · {AUDIENCE_LABEL[u.audience]} ·{" "}
                  {u.publishedAt ? new Date(u.publishedAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : <span className="text-amber-700">Entwurf</span>}
                </span>
              </button>
              <Pencil className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden="true" />
              <form
                action={deleteUpdateAction}
                onSubmit={(e) => {
                  if (!confirm(`„${u.title}“ löschen?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={u.id} />
                <button className="flex h-10 w-10 items-center justify-center rounded text-[color:var(--muted)] hover:text-rose-600" aria-label={`${u.title} löschen`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
        {items.length > ERSTE && !alle ? (
          <button type="button" onClick={() => setAlle(true)} className="h-10 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white text-sm font-medium">
            Alle zeigen ({items.length - ERSTE} weitere)
          </button>
        ) : null}
      </section>
    </div>
  );
}

function Editor({ initial, onDone }: { initial: UpdateView; onDone: () => void }) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [kind, setKind] = useState(initial.kind);
  const [audience, setAudience] = useState(initial.audience);
  const [notes, setNotes] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [state, action, saving] = useActionState<UpdateFormState, FormData>(saveUpdateAction, {});
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);
  const published = !!initial.publishedAt;

  return (
    <section className="space-y-4">
      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4">
        <summary className="flex min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[color:var(--brand)]" /> Text mit KI aus Stichworten
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
        <div className="pb-4">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Stichworte: Was ist neu? Wo finden Kunden es?" className={`${input} h-20`} />
        {aiError ? <p className="mt-1 text-sm text-rose-600">{aiError}</p> : null}
        <button
          type="button"
          disabled={drafting || notes.trim().length < 5}
          onClick={() =>
            startDraft(async () => {
              setAiError(null);
              const r = await draftUpdateAction(notes);
              if (!r.ok) return setAiError(r.error);
              setTitle(r.title);
              setBody(r.body);
              setKind(asKind(r.kind));
            })
          }
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm font-medium disabled:opacity-50"
        >
          {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Text vorschlagen
        </button>
        </div>
      </details>

      <form action={action} className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
        <h2 className="font-semibold">{initial.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h2>
        <input type="hidden" name="id" value={initial.id} />
        <label className="block text-sm font-medium">
          Titel
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={`${input} mt-1`} required />
        </label>
        <label className="block text-sm font-medium">
          Text <span className="font-normal text-[color:var(--muted)]">(Absätze mit Leerzeile, **fett** möglich)</span>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} className={`${input} mt-1 h-32`} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            Art
            <select name="kind" value={kind} onChange={(e) => setKind(asKind(e.target.value))} className={`${input} mt-1`}>
              {UPDATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Für
            <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className={`${input} mt-1`}>
              {UPDATE_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="push" /> Kunden per Push benachrichtigen{published ? " (nur, falls noch nicht geschehen)" : ""}
        </label>
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
        {state.ok && state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button name="intent" value="publish" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {published ? "Speichern" : "Veröffentlichen"}
          </button>
          <button name="intent" value="draft" disabled={saving} className="inline-flex h-10 items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] px-4 text-sm font-medium disabled:opacity-50">
            {published ? "Zurück auf Entwurf" : "Als Entwurf speichern"}
          </button>
          <button type="button" onClick={onDone} className="h-10 px-2 text-sm text-[color:var(--muted)] hover:underline">
            Abbrechen
          </button>
        </div>
      </form>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--muted)]">Vorschau im Kundenbereich</h2>
        <ul>
          <UpdateEntry u={{ id: "vorschau", title: title || "Titel", body: body || "Text …", kind, audience, publishedAt: initial.publishedAt ?? new Date().toISOString() }} />
        </ul>
      </div>
    </section>
  );
}
