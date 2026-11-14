"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Presentation, Trash2, Upload } from "lucide-react";
import { Button, ButtonLink, Card } from "@/components/ui";

type Audience = "vertreter" | "makler";
type Format = "pdf" | "pptx";
export type UnterlagenSlot = { audience: Audience; format: Format; file: { fileName: string; size: number; uploadedAt: string } | null };

const AUDIENCE_LABEL: Record<Audience, string> = { vertreter: "Vertreter-Präsentation", makler: "Makler-Präsentation" };
const FORMAT_LABEL: Record<Format, string> = { pdf: "PDF", pptx: "PowerPoint (PPTX)" };
const ACCEPT: Record<Format, string> = {
  pdf: ".pdf,application/pdf",
  pptx: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function UnterlagenGrid({ slots }: { slots: UnterlagenSlot[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(["vertreter", "makler"] as const).map((a) => (
        <Card key={a} className="p-4 sm:p-5">
          <h2 className="mb-3 text-base font-semibold">{AUDIENCE_LABEL[a]}</h2>
          <div className="space-y-3">
            {slots.filter((s) => s.audience === a).map((s) => (
              <Slot key={s.format} slot={s} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Slot({ slot }: { slot: UnterlagenSlot }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = `audience=${slot.audience}&format=${slot.format}`;
  const Icon = slot.format === "pdf" ? FileText : Presentation;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/praesentationen?${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "Hochladen fehlgeschlagen.");
      else router.refresh();
    } catch {
      setError("Hochladen fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!confirm(`${FORMAT_LABEL[slot.format]} wirklich entfernen?`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/praesentationen?${q}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("Entfernen fehlgeschlagen.");
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-unterlage={`${slot.audience}-${slot.format}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--muted)]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{FORMAT_LABEL[slot.format]}</div>
          {slot.file ? (
            <div className="truncate text-sm text-[color:var(--muted)]" title={slot.file.fileName}>
              {slot.file.fileName} · {size(slot.file.size)} · {when(slot.file.uploadedAt)}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">Noch keine Datei hinterlegt</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={ACCEPT[slot.format]}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button icon={Upload} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Lädt …" : slot.file ? "Ersetzen" : "Hochladen"}
        </Button>
        {slot.file ? (
          <>
            <ButtonLink href={`/api/admin/praesentationen/${slot.audience}/${slot.format}`} external icon={Download}>Herunterladen</ButtonLink>
            <Button icon={Trash2} variant="ghost" disabled={busy} className="text-rose-600 hover:bg-rose-50" onClick={remove}>
              Entfernen
            </Button>
          </>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
