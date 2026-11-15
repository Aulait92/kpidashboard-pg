"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, FileText, MonitorPlay, Presentation, Trash2 } from "lucide-react";
import { Button, ButtonLink, Card } from "@/components/ui";
import { FileDrop } from "@/components/ui/file-drop";
import { formatBytes, MB } from "@/lib/file-upload";

type Audience = "vertreter" | "makler";
type Format = "pdf" | "pptx";
export type UnterlagenSlot = { audience: Audience; format: Format; file: { fileName: string; size: number; uploadedAt: string } | null };

const AUDIENCE_LABEL: Record<Audience, string> = { vertreter: "Vertreter-Präsentation", makler: "Makler-Präsentation" };
const FORMAT_LABEL: Record<Format, string> = { pdf: "PDF", pptx: "PowerPoint (PPTX)" };
const ACCEPT: Record<Format, string> = {
  pdf: ".pdf,application/pdf",
  pptx: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
/** Wie lib/vertrieb/praesentationen.ts (der Server prüft weiterhin selbst). */
const MAX_BYTES: Record<Format, number> = { pdf: 25 * MB, pptx: 100 * MB };
const when = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function UnterlagenGrid({ slots, demo }: { slots: UnterlagenSlot[]; demo?: { haupt: string; app: string } }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {(["vertreter", "makler"] as const).map((a) => (
          <Card key={a} className="p-4 sm:p-5">
            <h2 className="mb-3 text-base font-semibold">{AUDIENCE_LABEL[a]}</h2>
            <div className="space-y-3">
              <WebPraesentation audience={a} />
              {slots.filter((s) => s.audience === a).map((s) => (
                <Slot key={s.format} slot={s} />
              ))}
            </div>
          </Card>
        ))}
      </div>
      {demo ? <DemoLink demo={demo} /> : null}
    </div>
  );
}

function useKopieren() {
  const [msg, setMsg] = useState<string | null>(null);
  const kopieren = (url: string) =>
    navigator.clipboard?.writeText(url).then(
      () => setMsg("Link kopiert"),
      () => setMsg("Bitte den Link markieren und kopieren."),
    );
  return { msg, kopieren };
}

/** Web-Präsentation zum Durchklicken (Listenpreise); mit Kontakt: Vertrieb → Kontakt → „Präsentation“. */
function WebPraesentation({ audience }: { audience: Audience }) {
  const { msg, kopieren } = useKopieren();
  const pfad = `/admin/marketing/unterlagen/praesentation/${audience}`;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-web-praesentation={audience}>
      <div className="flex items-start gap-3">
        <MonitorPlay className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--muted)]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Web-Präsentation zum Durchklicken</div>
          <div className="text-sm text-[color:var(--muted)]">{audience === "makler" ? "23" : "22"} Folien mit Live-Demo, Listenpreise. Mit Angebotspreisen über den Kontakt.</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ButtonLink href={pfad} icon={Presentation} variant="primary">
          Öffnen
        </ButtonLink>
        <Button icon={Copy} onClick={() => kopieren(`${window.location.origin}${pfad}`)}>
          Link kopieren
        </Button>
        {msg ? <span className="text-xs font-medium text-emerald-700">{msg}</span> : null}
      </div>
    </div>
  );
}

/** Öffentliche Live-Demo der Beratungspräsentation (ohne Login, Beispieldaten). */
function DemoLink({ demo }: { demo: { haupt: string; app: string } }) {
  const { msg, kopieren } = useKopieren();
  return (
    <Card className="p-4 sm:p-5" data-demo-link>
      <h2 className="text-base font-semibold">Live-Demo der Beratungspräsentation</h2>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        Öffentlich, ohne Login, mit Beispieldaten: Interessenten klicken selbst Tarife und Bausteine an. Zum Mitschicken oder für die Webseite.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={demo.haupt} onFocus={(e) => e.target.select()} className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 text-sm" aria-label="Link zur Live-Demo" />
        <div className="flex gap-2">
          <Button icon={Copy} variant="primary" onClick={() => kopieren(demo.haupt)}>
            Kopieren
          </Button>
          <ButtonLink href={demo.haupt} external icon={ExternalLink}>
            Öffnen
          </ButtonLink>
        </div>
      </div>
      {demo.app !== demo.haupt ? <p className="mt-2 text-xs text-[color:var(--muted)]">Auch erreichbar unter {demo.app}</p> : null}
      {msg ? <p className="mt-2 text-xs font-medium text-emerald-700">{msg}</p> : null}
    </Card>
  );
}

function Slot({ slot }: { slot: UnterlagenSlot }) {
  const router = useRouter();
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
              {slot.file.fileName} · {formatBytes(slot.file.size)} · {when(slot.file.uploadedAt)}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">Noch keine Datei hinterlegt</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <FileDrop
          variant="button"
          instant
          size="sm"
          accept={ACCEPT[slot.format]}
          maxBytes={MAX_BYTES[slot.format]}
          label={slot.file ? "Ersetzen" : "Hochladen"}
          pendingLabel="Lädt …"
          busy={busy}
          onFiles={(fs) => fs[0] && void upload(fs[0])}
        />
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
