"use client";

import { useActionState, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FileDrop } from "@/components/ui/file-drop";
import { LoginInfoCard, type LoginCardContent } from "@/components/login-info-card";
import { LOGIN_INFO_LIMITS } from "@/lib/login-info";
import type { LoginCardView } from "@/lib/login-karten-server";
import { deleteLoginCardAction, saveLoginCardAction, type LoginCardFormState } from "./actions";

const INPUT =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

/** Karte bearbeiten oder neu anlegen (card null), mit Live-Vorschau. */
/** `basis`: Seite, auf die nach dem Anlegen bzw. Löschen geleitet wird (neuer Admin: /admin/neu/einstellungen/login). */
export function LoginCardForm({ card, justCreated = false, basis }: { card: LoginCardView | null; justCreated?: boolean; basis?: string }) {
  const [state, action, pending] = useActionState<LoginCardFormState, FormData>(saveLoginCardAction, justCreated ? { ok: true } : {});
  const [enabled, setEnabled] = useState(card?.enabled ?? true);
  const [badge, setBadge] = useState(card?.badge ?? "");
  const [title, setTitle] = useState(card?.title ?? "");
  const [text, setText] = useState(card?.text ?? "");
  const [linkText, setLinkText] = useState(card?.linkText ?? "");
  const [linkUrl, setLinkUrl] = useState(card?.linkUrl ?? "");
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => () => {
    if (localImage) URL.revokeObjectURL(localImage);
  }, [localImage]);

  const imageUrl = card?.imageSrc ?? null;
  const previewImage = removeImage ? null : (localImage ?? imageUrl);
  const L = LOGIN_INFO_LIMITS;

  return (
    <form action={action} className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      {card ? <input type="hidden" name="id" value={card.id} /> : null}
      {basis ? <input type="hidden" name="basis" value={basis} /> : null}
      <div className="space-y-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Karte aktiv</span>
            <span className="block text-sm text-[color:var(--muted)]">Aktive Karten wechseln sich auf der Login-Seite ab.</span>
          </span>
          <input
            type="checkbox"
            name="enabled"
            value="1"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-[color:var(--brand)]"
          />
        </label>

        <Field label="Etikett" hint={`optional, z. B. „Neu“ oder „Termin“, max. ${L.badge} Zeichen`}>
          <input name="badge" value={badge} maxLength={L.badge} onChange={(e) => setBadge(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Überschrift" hint={`max. ${L.title} Zeichen`}>
          <input name="title" value={title} required maxLength={L.title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Text" hint={`2 bis 3 Zeilen, max. ${L.text} Zeichen (${text.length}/${L.text})`}>
          <textarea name="text" value={text} rows={3} maxLength={L.text} onChange={(e) => setText(e.target.value)} className={`${INPUT} resize-y`} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field label="Link-Text" hint="optional, z. B. „Mehr erfahren“">
            <input name="linkText" value={linkText} maxLength={L.linkText} onChange={(e) => setLinkText(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Link" hint="https://… oder ein Pfad wie /buyer/bestand (nach der Anmeldung geht es direkt dorthin)">
            <input name="linkUrl" value={linkUrl} inputMode="url" onChange={(e) => setLinkUrl(e.target.value)} placeholder="/buyer/…" className={INPUT} />
          </Field>
        </div>

        <div>
          <label htmlFor="login-card-image" className="mb-1 block text-sm font-medium">
            Bild
          </label>
          <FileDrop
            id="login-card-image"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            maxBytes={L.imageBytes}
            maxLabel="1,5 MB"
            label="Bild auswählen"
            hint="optional, PNG/JPG/WebP bis 1,5 MB, am besten im Querformat (z. B. 1200 × 700)"
            pendingLabel="Wird gespeichert …"
            onFiles={(fs) => {
              const f = fs[0];
              setRemoveImage(false);
              setLocalImage(f ? URL.createObjectURL(f) : null);
            }}
          />
          {imageUrl || localImage ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-[color:var(--muted)]">
              <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} className="accent-[color:var(--brand)]" />
              Bild entfernen
            </label>
          ) : null}
          <input type="hidden" name="removeImage" value={removeImage ? "1" : ""} />
        </div>

        {state.errors?.length ? (
          <ul role="alert" className="space-y-1 rounded-[var(--radius-md)] bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {state.ok ? <p role="status" className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">Gespeichert.</p> : null}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Speichern…" : card ? "Speichern" : "Karte anlegen"}
        </button>
      </div>

      <div className="space-y-2 self-start lg:sticky lg:top-20">
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Vorschau{enabled ? "" : " (Karte ist aus)"}</p>
        <div className={enabled ? undefined : "opacity-60"}>
          <LoginInfoCard
            info={{ badge: badge.trim() || null, title: title.trim() || "Überschrift", text: text.trim() || null, linkText: linkText.trim() || null, linkUrl: linkUrl.trim() || null }}
            imageSrc={previewImage}
          />
        </div>
      </div>
    </form>
  );
}

/** Vorschau der aktiven Karten zum Durchklicken (so wechseln sie auf der Login-Seite). */
export function LoginCardsPreview({ cards }: { cards: (LoginCardContent & { id: string; imageSrc: string | null })[] }) {
  const [i, setI] = useState(0);
  if (!cards.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-6 text-center text-sm text-[color:var(--muted)]">
        Keine Karte aktiv: Die Login-Seite zeigt nur das Formular.
      </div>
    );
  }
  const n = cards.length;
  const idx = i % n;
  const card = cards[idx];
  const btn = "flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:bg-[color:var(--surface-sunken)] disabled:opacity-40";
  return (
    <div className="space-y-3">
      <LoginInfoCard key={card.id} info={card} imageSrc={card.imageSrc} compact />
      <div className="flex items-center justify-between gap-3">
        <button type="button" className={btn} onClick={() => setI((idx - 1 + n) % n)} disabled={n < 2} aria-label="Vorherige Karte">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5" aria-label={`Karte ${idx + 1} von ${n}`}>
          {cards.map((c, k) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Karte ${k + 1}: ${c.title}`}
              aria-current={k === idx ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${k === idx ? "w-5 bg-[color:var(--brand)]" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
            />
          ))}
        </div>
        <button type="button" className={btn} onClick={() => setI((idx + 1) % n)} disabled={n < 2} aria-label="Nächste Karte">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-xs text-[color:var(--muted)]">
        Karte {idx + 1} von {n} · bei jedem Aufruf der Login-Seite kommt die nächste
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-sm text-[color:var(--muted)]">{hint}</span> : null}
    </label>
  );
}

/** Löschen mit Rückfrage. */
export function DeleteCardButton({ id, title, basis }: { id: string; title: string; basis?: string }) {
  return (
    <form
      action={deleteLoginCardAction}
      onSubmit={(e) => {
        if (!window.confirm(`Karte „${title}“ löschen? Das lässt sich nicht rückgängig machen.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {basis ? <input type="hidden" name="basis" value={basis} /> : null}
      <button type="submit" className="text-sm font-medium text-rose-700 hover:underline">
        Karte löschen
      </button>
    </form>
  );
}
