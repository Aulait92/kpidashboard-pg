"use client";

// Eigener Text der Kampagnen-Mail (Paket 2, 20.11.2026): Platzhalter als Chips zum Einfügen, im Text lesbar als
// „[Anrede]“ statt roher „{anrede}“. Beim Start übersetzt die Aktion sie zurück (platzhalterAusAnzeige).

import { useRef } from "react";

const field = "mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]";

export function MailEditor({ subject, body, chips }: { subject: string; body: string; chips: { key: string; label: string }[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (label: string) => {
    const el = ref.current;
    if (!el) return;
    const token = `[${label}]`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.setRangeText(token, start, end, "end");
    el.focus();
  };
  return (
    <div className="space-y-3" data-mail-editor>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Betreff
        <input name="mailSubject" defaultValue={subject} maxLength={200} className={`${field} h-10`} />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Text
        <textarea ref={ref} name="mailBody" defaultValue={body} rows={8} maxLength={5000} className={`${field} py-2 leading-relaxed`} />
      </label>
      <div className="flex flex-wrap items-center gap-1.5" data-mail-chips>
        <span className="text-xs text-[color:var(--muted)]">Einfügen:</span>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => insert(c.label)}
            className="h-8 rounded-full border border-[color:var(--border)] bg-white px-3 text-xs font-medium hover:border-[color:var(--border-strong)]"
            data-mail-chip={c.key}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
