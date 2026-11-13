"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { UpdateEntry } from "@/components/neuigkeiten";
import { AUDIENCE_LABEL, KIND_LABEL, UPDATE_AUDIENCES, UPDATE_KINDS, asKind, type UpdateView } from "@/lib/neuigkeiten-shared";
import { deleteUpdateAction, draftUpdateAction, saveUpdateAction, type UpdateFormState } from "./actions";

const EMPTY: UpdateView = { id: "", title: "", body: "", kind: "neu", audience: "alle", publishedAt: null };
const input = "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px]";

export function NeuigkeitenAdmin({ items }: { items: UpdateView[] }) {
  const [edit, setEdit] = useState<UpdateView>(EMPTY);
  const [key, setKey] = useState(0);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Editor key={key} initial={edit} onDone={() => (setEdit(EMPTY), setKey((k) => k + 1))} />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--muted)]">Alle Einträge</h2>
        {!items.length ? <p className="text-sm text-[color:var(--muted)]">Noch keine Einträge.</p> : null}
        <ul className="space-y-2">
          {items.map((u) => (
            <li key={u.id} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{u.title}</div>
                <div className="text-xs text-[color:var(--muted)]">
                  {KIND_LABEL[u.kind]} · {AUDIENCE_LABEL[u.audience]} ·{" "}
                  {u.publishedAt ? new Date(u.publishedAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : <span className="text-amber-700">Entwurf</span>}
                </div>
              </div>
              <button type="button" className="rounded p-1.5 text-[color:var(--muted)] hover:text-[color:var(--brand)]" aria-label={`${u.title} bearbeiten`} onClick={() => (setEdit(u), setKey((k) => k + 1))}>
                <Pencil className="h-4 w-4" />
              </button>
              <form
                action={deleteUpdateAction}
                onSubmit={(e) => {
                  if (!confirm(`„${u.title}“ löschen?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={u.id} />
                <button className="rounded p-1.5 text-[color:var(--muted)] hover:text-rose-600" aria-label={`${u.title} löschen`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
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
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-[color:var(--brand)]" /> Entwurf mit KI
        </h2>
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
          {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Entwurf erstellen
        </button>
      </div>

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
          {initial.id ? (
            <button type="button" onClick={onDone} className="h-10 px-2 text-sm text-[color:var(--muted)] hover:underline">
              Abbrechen
            </button>
          ) : null}
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
