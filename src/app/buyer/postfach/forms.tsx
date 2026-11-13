"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { deleteVorlageAction, saveSmtpAction, saveVorlageAction, testPostfachAction, type PostfachResult } from "./actions";

const input =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

function Msg({ s }: { s: PostfachResult }) {
  if (s.error) return <p className="text-sm font-medium text-rose-700">{s.error}</p>;
  if (s.info) return <p className="text-sm font-medium text-emerald-700">{s.info}</p>;
  return null;
}

export function SmtpForm({ readOnly }: { readOnly: boolean }) {
  const [state, action, pending] = useActionState<PostfachResult, FormData>(saveSmtpAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" data-smtp-form>
      <label className="text-sm font-medium">
        Absender-Adresse
        <input name="email" type="email" required className={`${input} mt-1`} placeholder="info@ihre-agentur.de" />
      </label>
      <label className="text-sm font-medium">
        Absendername (optional)
        <input name="fromName" className={`${input} mt-1`} placeholder="Agentur Muster" />
      </label>
      <label className="text-sm font-medium">
        SMTP-Server
        <input name="host" required className={`${input} mt-1`} placeholder="smtp.ionos.de" />
      </label>
      <label className="text-sm font-medium">
        Port
        <select name="port" defaultValue="587" className={`${input} mt-1`}>
          <option value="587">587 (STARTTLS, üblich)</option>
          <option value="465">465 (SSL)</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Benutzername
        <input name="user" required autoComplete="off" className={`${input} mt-1`} placeholder="meist die E-Mail-Adresse" />
      </label>
      <label className="text-sm font-medium">
        Passwort
        <input name="password" type="password" required autoComplete="new-password" className={`${input} mt-1`} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" size="md" disabled={pending || readOnly}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Prüfen und verbinden
        </Button>
        <Msg s={state} />
      </div>
      <p className="text-xs text-[color:var(--muted)] sm:col-span-2">Das Passwort wird verschlüsselt gespeichert und nur zum Senden genutzt.</p>
    </form>
  );
}

export function TestButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="md"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await testPostfachAction();
          toast.show(r.error ? { message: r.error, tone: "error" } : { message: r.info ?? "Gesendet." });
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Test-E-Mail an mich
    </Button>
  );
}

type V = { id: string; name: string; subject: string; body: string };

function VorlageForm({ v, onDone, readOnly }: { v: V | null; onDone: () => void; readOnly: boolean }) {
  const [state, action, pending] = useActionState<PostfachResult, FormData>(async (prev, fd) => {
    const r = await saveVorlageAction(prev, fd);
    if (r.ok) onDone();
    return r;
  }, {});
  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-vorlage-form>
      {v ? <input type="hidden" name="id" value={v.id} /> : null}
      <label className="block text-sm font-medium">
        Name
        <input name="name" defaultValue={v?.name ?? ""} required className={`${input} mt-1`} placeholder="z. B. Angebot" />
      </label>
      <label className="block text-sm font-medium">
        Betreff
        <input name="subject" defaultValue={v?.subject ?? ""} required className={`${input} mt-1`} />
      </label>
      <label className="block text-sm font-medium">
        Text
        <textarea name="body" defaultValue={v?.body ?? ""} required rows={8} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-[15px] outline-none focus:border-[color:var(--brand)]" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="md" disabled={pending || readOnly}>
          Speichern
        </Button>
        <button type="button" onClick={onDone} className={buttonClass("ghost", "md")}>
          Abbrechen
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function VorlagenListe({ vorlagen, readOnly }: { vorlagen: V[]; readOnly: boolean }) {
  const [edit, setEdit] = useState<string | "neu" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
        {vorlagen.map((v) =>
          edit === v.id ? (
            <li key={v.id} className="p-3">
              <VorlageForm v={v} onDone={() => setEdit(null)} readOnly={readOnly} />
            </li>
          ) : (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{v.name}</div>
                <div className="truncate text-sm text-[color:var(--muted)]">{v.subject}</div>
              </div>
              {!readOnly ? (
                <>
                  <button type="button" onClick={() => setEdit(v.id)} aria-label={`${v.name} bearbeiten`} className="rounded-full p-1.5 text-[color:var(--muted)] hover:text-[color:var(--brand)]">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => window.confirm(`Vorlage „${v.name}“ löschen?`) && start(() => deleteVorlageAction(v.id))}
                    aria-label={`${v.name} löschen`}
                    className="rounded-full p-1.5 text-[color:var(--muted)] hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {edit === "neu" ? (
        <VorlageForm v={null} onDone={() => setEdit(null)} readOnly={readOnly} />
      ) : !readOnly ? (
        <button type="button" onClick={() => setEdit("neu")} className={buttonClass("secondary", "md", "gap-1.5")}>
          <Plus className="h-4 w-4" /> Neue Vorlage
        </button>
      ) : null}
    </div>
  );
}
