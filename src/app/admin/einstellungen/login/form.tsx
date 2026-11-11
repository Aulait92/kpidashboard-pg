"use client";

import { useActionState, useEffect, useState } from "react";
import { LoginInfoCard } from "@/components/login-info-card";
import { LOGIN_INFO_LIMITS, type LoginInfo } from "@/lib/login-info";
import { saveLoginInfoAction, type LoginInfoFormState } from "./actions";

const INPUT =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function LoginInfoForm({ info, imageUrl }: { info: LoginInfo; imageUrl: string | null }) {
  const [state, action, pending] = useActionState<LoginInfoFormState, FormData>(saveLoginInfoAction, {});
  const [enabled, setEnabled] = useState(info.enabled);
  const [badge, setBadge] = useState(info.badge ?? "");
  const [title, setTitle] = useState(info.title);
  const [text, setText] = useState(info.text ?? "");
  const [linkText, setLinkText] = useState(info.linkText ?? "");
  const [linkUrl, setLinkUrl] = useState(info.linkUrl ?? "");
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => () => {
    if (localImage) URL.revokeObjectURL(localImage);
  }, [localImage]);

  const previewImage = removeImage ? null : (localImage ?? imageUrl);
  const L = LOGIN_INFO_LIMITS;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Infokarte anzeigen</span>
            <span className="block text-sm text-[color:var(--muted)]">Aus: Die Login-Seite zeigt nur das Formular.</span>
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

        <Field label="Etikett" hint={`optional, z. B. „Neu“ oder „Termin“ – max. ${L.badge} Zeichen`}>
          <input name="badge" value={badge} maxLength={L.badge} onChange={(e) => setBadge(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Überschrift" hint={`max. ${L.title} Zeichen`}>
          <input name="title" value={title} required maxLength={L.title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Text" hint={`2–3 Zeilen, max. ${L.text} Zeichen (${text.length}/${L.text})`}>
          <textarea name="text" value={text} rows={3} maxLength={L.text} onChange={(e) => setText(e.target.value)} className={`${INPUT} resize-y`} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field label="Link-Text" hint="optional, z. B. „Mehr erfahren“">
            <input name="linkText" value={linkText} maxLength={L.linkText} onChange={(e) => setLinkText(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Link" hint="https://… oder ein Pfad wie /rechner">
            <input name="linkUrl" value={linkUrl} inputMode="url" onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" className={INPUT} />
          </Field>
        </div>

        <Field label="Bild" hint="optional, PNG/JPG/WebP bis 1,5 MB – am besten im Querformat (z. B. 1200 × 800)">
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setRemoveImage(false);
              setLocalImage(f ? URL.createObjectURL(f) : null);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[color:var(--brand-soft)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[color:var(--brand-dark)]"
          />
          {imageUrl || localImage ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-[color:var(--muted)]">
              <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} className="accent-[color:var(--brand)]" />
              Bild entfernen
            </label>
          ) : null}
          <input type="hidden" name="removeImage" value={removeImage ? "1" : ""} />
        </Field>

        {state.errors?.length ? (
          <ul role="alert" className="space-y-1 rounded-[var(--radius-md)] bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {state.ok ? <p role="status" className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">Gespeichert – die Login-Seite zeigt jetzt die neue Karte.</p> : null}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>

      <div className="space-y-2 self-start lg:sticky lg:top-20">
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Vorschau</p>
        {enabled ? (
          <LoginInfoCard
            info={{ badge: badge.trim() || null, title: title.trim() || "Überschrift", text: text.trim() || null, linkText: linkText.trim() || null, linkUrl: linkUrl.trim() || null }}
            imageSrc={previewImage}
          />
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-6 text-center text-sm text-[color:var(--muted)]">
            Infokarte ist aus.
          </div>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[color:var(--muted)]">{hint}</span> : null}
    </label>
  );
}
