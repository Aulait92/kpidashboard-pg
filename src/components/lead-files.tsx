"use client";

// Dokumente am Lead (Ole, 13.11.2026): Angebot, Police oder Sonstiges hochladen und wiederfinden.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Kind = "angebot" | "police" | "sonstiges";
const KINDS: { key: Kind; label: string }[] = [
  { key: "angebot", label: "Angebot" },
  { key: "police", label: "Police" },
  { key: "sonstiges", label: "Sonstiges" },
];
const LABEL: Record<Kind, string> = { angebot: "Angebot", police: "Police", sonstiges: "Dokument" };

export type LeadFileView = { id: string; kind: Kind; fileName: string; size: number; createdAt: string };

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export function LeadFiles({ leadId, files, defaultKind = "angebot", readOnly = false }: { leadId: string; files: LeadFileView[]; defaultKind?: Kind; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy("upload");
    try {
      const res = await fetch(`/api/buyer/leads/${leadId}/dateien?kind=${kind}`, {
        method: "POST",
        headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
        body: file,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Hochladen hat nicht geklappt.");
      toast.show({ message: `${LABEL[kind]} gespeichert` });
      router.refresh();
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "Hochladen hat nicht geklappt.", tone: "error" });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(f: LeadFileView) {
    if (!window.confirm(`„${f.fileName}“ löschen?`)) return;
    setBusy(f.id);
    const res = await fetch(`/api/buyer/leads/${leadId}/dateien/${f.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) return toast.show({ message: "Löschen hat nicht geklappt.", tone: "error" });
    router.refresh();
  }

  return (
    <Card className="mt-6" data-lead-files>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Dokumente</h2>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] p-0.5 text-sm" role="radiogroup" aria-label="Art des Dokuments">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.key}
                  onClick={() => setKind(k.key)}
                  className={cn("rounded-full px-3 py-1", kind === k.key ? "bg-white font-semibold shadow-sm" : "text-[color:var(--muted)]")}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy === "upload"}
              onClick={() => input.current?.click()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 text-sm font-medium hover:border-[color:var(--brand)] disabled:opacity-60"
              data-file-upload
            >
              {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              Hochladen
            </button>
            <input
              ref={input}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </div>
        ) : null}
      </div>
      {files.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch keine Dokumente. Laden Sie hier z. B. das Angebot hoch, das Sie geschickt haben.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-3">
              <FileText className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
              <a href={`/api/buyer/leads/${leadId}/dateien/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-[color:var(--brand)]">
                <span className="block truncate text-[15px] font-medium">{f.fileName}</span>
                <span className="text-xs text-[color:var(--muted)]">
                  {LABEL[f.kind]} · {size(f.size)} · {day(f.createdAt)}
                </span>
              </a>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  disabled={busy === f.id}
                  aria-label={`${f.fileName} löschen`}
                  className="rounded-full p-1.5 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken,#f1f5f9)] hover:text-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
