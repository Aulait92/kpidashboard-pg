"use client";

// E-Mail an den Lead aus dem eigenen Postfach (Ole, 13.11.2026): Vorlage wählen, anpassen,
// Dokumente (z. B. Angebot) anhängen, senden. Danach im Verlauf.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Paperclip, Pencil } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { sendLeadMailAction } from "@/app/buyer/postfach/actions";
import { fuelle, fuelleMitSignatur, werteFuer } from "@/lib/mail/platzhalter";
import { cn } from "@/lib/utils";

export const LEAD_MAIL_EVENT = "pg-lead-mail-open";

type Vorlage = { id: string; name: string; subject: string; body: string };
type Datei = { id: string; fileName: string; kind: string };

const input =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function LeadMailComposer({
  leadId,
  lead,
  to: initialTo,
  from,
  meinname,
  signatur = "",
  vorlagen,
  dateien,
}: {
  leadId: string;
  lead: { name: string | null; source: string | null };
  to: string | null;
  from: string;
  meinname: string;
  /** E-Mail-Signatur (Postfach-Einstellungen); steht unter jeder E-Mail */
  signatur?: string;
  vorlagen: Vorlage[];
  dateien: Datei[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [vorlage, setVorlage] = useState<string | null>(null);
  const [to, setTo] = useState(initialTo ?? "");
  const [subject, setSubject] = useState("");
  // Ohne Vorlage: Signatur schon unten im Text, darüber Platz zum Schreiben
  const leer = signatur.trim() ? `\n\n${signatur.trim()}` : "";
  const [text, setText] = useState(leer);
  const [files, setFiles] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const werte = { ...werteFuer(lead, meinname), signatur };

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(LEAD_MAIL_EVENT, onOpen);
    return () => window.removeEventListener(LEAD_MAIL_EVENT, onOpen);
  }, []);

  const pick = (v: Vorlage) => {
    setVorlage(v.id);
    setSubject(fuelle(v.subject, werte));
    setText(fuelleMitSignatur(v.body, werte));
    // Angebot-Vorlage: vorhandenes Angebot gleich anhängen
    if (/angebot/i.test(v.name)) {
      const angebot = dateien.find((d) => d.kind === "angebot");
      if (angebot) setFiles((s) => new Set(s).add(angebot.id));
    }
  };

  const send = () =>
    start(async () => {
      const res = await sendLeadMailAction({ leadId, to, subject, text, fileIds: [...files] });
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: `E-Mail an ${to} gesendet` });
      setOpen(false);
      setVorlage(null);
      setSubject("");
      setText(leer);
      setFiles(new Set());
      router.refresh();
    });

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="E-Mail schreiben" message={`Von ${from}`}>
      <div className="space-y-3 p-5" data-lead-mail>
        {vorlagen.length ? (
          <div className="flex flex-wrap gap-1.5">
            {vorlagen.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => pick(v)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  vorlage === v.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold text-[color:var(--brand)]" : "border-[color:var(--border)]",
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        ) : null}
        {/* Vorlagen/Signatur ändern direkt aus dem Fenster (Ole, 14.11.2026) */}
        <Link href="/buyer/postfach#vorlagen" className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline" data-mail-edit-templates>
          <Pencil className="h-3.5 w-3.5" /> Vorlagen & Signatur bearbeiten
        </Link>
        <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="An" aria-label="An" className={`${input} h-11`} />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Betreff" aria-label="Betreff" className={`${input} h-11`} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="Text" aria-label="Text" className={`${input} py-2.5`} />
        {dateien.length ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-[color:var(--muted)]">Anhängen</p>
            {dateien.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={files.has(d.id)}
                  onChange={(e) =>
                    setFiles((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(d.id);
                      else n.delete(d.id);
                      return n;
                    })
                  }
                />
                <Paperclip className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                <span className="truncate">{d.fileName}</span>
              </label>
            ))}
          </div>
        ) : null}
        <Button variant="primary" size="md" className="w-full" disabled={pending || !to.trim() || !subject.trim() || !text.trim()} onClick={send} data-lead-mail-send>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Senden
        </Button>
      </div>
    </Sheet>
  );
}
