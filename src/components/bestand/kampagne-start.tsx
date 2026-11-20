"use client";

// Startknopf der Kampagne (Paket 2, 20.11.2026): klebt am Handy unten über der Navigation, nennt die Zahl
// („22 Kunden anschreiben“) und, wenn etwas fehlt, genau das („Erst Postfach verbinden“) als Link zum Beheben, statt
// grau zu sein. Vor der ersten Kampagne öffnet er die Bestätigung zum Agenturvertrag als eigenes Fenster (Sheet);
// Text und Version kommen unverändert aus lib/bestand/befugnis.ts. Felder im Fenster gehören per form="…" zum
// Kampagnen-Formular (das Fenster liegt per Portal außerhalb).

import { useState } from "react";
import { Send } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

export type StartBlocker = { label: string; href: string };

export function KampagneStart({
  formId,
  label,
  blocker,
  alt,
  confirm,
  hint,
  readOnly,
}: {
  formId: string;
  label: string;
  /** Fehlt etwas: Knopf wird zum Link, der genau das behebt */
  blocker?: StartBlocker | null;
  /** Ausweg neben dem Blocker (z. B. „Nur WhatsApp“) */
  alt?: StartBlocker | null;
  /** Bestätigung zum Agenturvertrag vor dem ersten Start */
  confirm?: { text: string; intro: string | null } | null;
  /** Ein Satz unter dem Knopf */
  hint?: string | null;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  return (
    <div
      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/95 px-3 py-3 shadow-[var(--shadow-md)] backdrop-blur md:bottom-4"
      data-campaign-startbar
    >
      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? (
          <Button type="button" variant="primary" size="md" icon={Send} disabled className="flex-1 sm:flex-none" data-campaign-start>
            Vorschau: Versand ist aus
          </Button>
        ) : blocker ? (
          <span className="flex flex-1 sm:flex-none" data-campaign-start data-campaign-blocker>
            <ButtonLink href={blocker.href} variant="primary" size="md" className="flex-1">
              {blocker.label}
            </ButtonLink>
          </span>
        ) : confirm ? (
          <Button type="button" variant="primary" size="md" icon={Send} className="flex-1 sm:flex-none" onClick={() => setOpen(true)} data-campaign-start>
            {label}
          </Button>
        ) : (
          <Button type="submit" form={formId} variant="primary" size="md" icon={Send} className="flex-1 sm:flex-none" disabled={sending} onClick={() => setTimeout(() => setSending(true), 0)} data-campaign-start>
            {sending ? "Wird gestartet …" : label}
          </Button>
        )}
        {alt && blocker && !readOnly ? (
          <ButtonLink href={alt.href} variant="secondary" size="md" data-campaign-alt>
            {alt.label}
          </ButtonLink>
        ) : null}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-[color:var(--muted)]">{hint}</p> : null}
      {confirm ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="Vor der ersten Kampagne">
          <div className="space-y-3 px-5 py-4 text-sm" data-agent-sheet>
            {confirm.intro ? <p className="text-[color:var(--muted)]">{confirm.intro}</p> : null}
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-3">
              <input type="checkbox" name="agentConfirm" form={formId} className="mt-0.5 h-5 w-5 shrink-0" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-agent-confirm />
              <span>{confirm.text}</span>
            </label>
            <Button type="submit" form={formId} variant="primary" size="md" icon={Send} className="w-full" disabled={!checked} data-agent-submit>
              {checked ? `Bestätigen und ${label.charAt(0).toLowerCase()}${label.slice(1)}` : "Bitte erst bestätigen"}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
