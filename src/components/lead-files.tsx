"use client";

// Dokumente am Lead (Ole, 13.11.2026): Angebot, Police oder Sonstiges hochladen und wiederfinden.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { formatBytes, MB } from "@/lib/file-upload";
import { cn } from "@/lib/utils";
import { ZweiFaktorHinweis } from "@/components/security/zwei-faktor-hinweis";

type Kind = "angebot" | "police" | "sonstiges";
const KINDS: { key: Kind; label: string }[] = [
  { key: "angebot", label: "Angebot" },
  { key: "police", label: "Police" },
  { key: "sonstiges", label: "Sonstiges" },
];
const LABEL: Record<Kind, string> = { angebot: "Angebot", police: "Police", sonstiges: "Dokument" };

export type LeadFileView = {
  id: string;
  kind: Kind;
  fileName: string;
  size: number;
  createdAt: string;
  /** Angebot nach dem Termin (Paket P3): „Angebot gesendet am 17.11. per WhatsApp und E-Mail“ bzw. „abgelegt am“ */
  stand?: string | null;
  /** Hochgeladene Police, deren Virenprüfung noch aussteht (lib/lead-files.ts) */
  wirdGeprueft?: boolean;
};
/** Unterlage, die der Kunde per WhatsApp geschickt hat (lib/policen/server.ts UnterlageView). */
export type UnterlageView = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  sparte: string | null;
  consentAt: string | null;
  ansehen: boolean;
  /** Zwei-Faktor-Login fehlt (AVV § 5) bzw. Virenprüfung steht aus */
  gesperrt: "zwei_faktor" | "pruefung" | null;
  loeschtAm: string | null;
  behaltenAt: string | null;
  behaltenVermerk: string | null;
  behaltenMoeglich: boolean;
};

/** Wie lib/lead-files.ts (Prüfung am Inhalt bleibt auf dem Server). */
export const LEAD_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,application/pdf,image/png,image/jpeg,image/webp";
export const LEAD_FILE_MAX_BYTES = 15 * MB;
const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export function LeadFiles({
  leadId,
  files,
  unterlagen = [],
  defaultKind = "angebot",
  readOnly = false,
}: {
  leadId: string;
  files: LeadFileView[];
  /** Vom Kunden per WhatsApp geschickt (Policen vor dem Termin, Ole 17.11.2026) */
  unterlagen?: UnterlageView[];
  defaultKind?: Kind;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [busy, setBusy] = useState<string | null>(null);

  // Mehrere Dateien auf einmal (z. B. vier Screenshots aus dem Tarifrechner), nacheinander hochgeladen
  async function upload(list: File[]) {
    setBusy("upload");
    let ok = 0;
    try {
      for (const file of list) {
        const res = await fetch(`/api/buyer/leads/${leadId}/dateien?kind=${kind}`, {
          method: "POST",
          headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
          body: file,
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(`${file.name}: ${j.error ?? "Hochladen hat nicht geklappt."}`);
        ok++;
      }
      toast.show({ message: ok === 1 ? `${LABEL[kind]} gespeichert` : `${ok} Dateien gespeichert` });
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "Hochladen hat nicht geklappt.", tone: "error" });
    } finally {
      setBusy(null);
      if (ok) router.refresh();
    }
  }

  // Widerruf, der den Vermittler anders erreicht hat (Telefon, E-Mail, Termin): alle Unterlagen vom Kunden löschen
  async function widerrufen() {
    if (!window.confirm("Einwilligung widerrufen und alle Unterlagen vom Kunden löschen?")) return;
    setBusy("widerruf");
    const res = await fetch(`/api/buyer/leads/${leadId}/unterlagen`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) return toast.show({ message: "Löschen hat nicht geklappt.", tone: "error" });
    toast.show({ message: "Widerruf vermerkt, Unterlagen gelöscht" });
    router.refresh();
  }

  // „Beratungsdokumentation behalten“: keine automatische Löschung nach dem Abschluss
  async function behalten(u: UnterlageView, ja: boolean) {
    setBusy(u.id);
    const res = await fetch(`/api/buyer/leads/${leadId}/unterlagen/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ behalten: ja }),
    });
    setBusy(null);
    if (!res.ok) return toast.show({ message: "Speichern hat nicht geklappt.", tone: "error" });
    toast.show({ message: ja ? "Wird behalten" : "Wird wieder automatisch gelöscht" });
    router.refresh();
  }

  async function remove(f: { id: string; fileName: string }, art: "dateien" | "unterlagen" = "dateien") {
    if (!window.confirm(`„${f.fileName}“ löschen?`)) return;
    setBusy(f.id);
    const res = await fetch(`/api/buyer/leads/${leadId}/${art}/${f.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) return toast.show({ message: "Löschen hat nicht geklappt.", tone: "error" });
    router.refresh();
  }

  return (
    <Card id="dokumente" className="mt-6" data-lead-files>
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
                  className={cn("rounded-full px-3 py-2.5 sm:py-1", kind === k.key ? "bg-white font-semibold shadow-sm" : "text-[color:var(--muted)]")}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="min-w-0" data-file-upload>
              <FileDrop
                variant="button"
                size="sm"
                instant
                icon={Paperclip}
                accept={LEAD_FILE_ACCEPT}
                maxBytes={LEAD_FILE_MAX_BYTES}
                label="Hochladen"
                pendingLabel="Lädt …"
                busy={busy === "upload"}
                multiple
                maxFiles={10}
                onFiles={(fs) => fs.length && void upload(fs)}
              />
            </div>
          </div>
        ) : null}
      </div>
      {unterlagen.length ? (
        <div data-unterlagen-vom-kunden>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-5 pt-3">
            <h3 className="text-[13px] font-semibold text-[color:var(--muted)]">Unterlagen vom Kunden</h3>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => void widerrufen()}
                disabled={busy === "widerruf"}
                className="py-1 text-xs font-medium text-[color:var(--muted)] hover:text-rose-700 hover:underline"
                data-widerruf
              >
                Einwilligung widerrufen / Unterlagen löschen
              </button>
            ) : null}
          </div>
          {!readOnly && unterlagen.some((u) => u.gesperrt === "zwei_faktor") ? <ZweiFaktorHinweis zurueck={`/buyer/leads/${leadId}#dokumente`} className="mx-5 mt-3" /> : null}
          <ul className="divide-y divide-[color:var(--border)]">
            {unterlagen.map((u) => {
              const kopf = (
                <>
                  <span className="block truncate text-[15px] font-medium">{u.fileName}</span>
                  <span className="text-xs text-[color:var(--muted)]">
                    {u.sparte ?? "Unterlage"} · per WhatsApp · {formatBytes(u.size)} · {day(u.createdAt)}
                    {u.gesperrt === "pruefung" ? " · wird auf Viren geprüft" : ""}
                  </span>
                </>
              );
              return (
                <li key={u.id} className="flex items-start gap-3 px-5 py-3" data-unterlage>
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />
                  <div className="min-w-0 flex-1">
                    {u.ansehen ? (
                      <a href={`/api/buyer/leads/${leadId}/unterlagen/${u.id}`} target="_blank" rel="noreferrer" className="block hover:text-[color:var(--brand)]">
                        {kopf}
                      </a>
                    ) : (
                      kopf
                    )}
                    {u.behaltenAt ? (
                      <p className="mt-1 text-xs text-[color:var(--muted)]" data-behalten>
                        Behalten seit {day(u.behaltenAt)}: {u.behaltenVermerk ?? "Beratungsdokumentation"}
                        {!readOnly ? (
                          <>
                            {" · "}
                            <button type="button" onClick={() => void behalten(u, false)} disabled={busy === u.id} className="font-medium hover:underline">
                              Aufheben
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : u.loeschtAm ? (
                      <p className="mt-1 text-xs text-[color:var(--muted)]" data-loescht-am>
                        Wird am {day(u.loeschtAm)} automatisch gelöscht
                        {u.behaltenMoeglich && !readOnly ? (
                          <>
                            {" · "}
                            <button type="button" onClick={() => void behalten(u, true)} disabled={busy === u.id} className="font-medium text-[color:var(--brand)] hover:underline">
                              Als Beratungsdokumentation behalten
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {u.consentAt ? (
                      <p className="mt-1 text-xs text-[color:var(--muted)]" data-einwilligung>
                        Mit Einwilligung vom {day(u.consentAt)}
                      </p>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => void remove(u, "unterlagen")}
                      disabled={busy === u.id}
                      aria-label={`${u.fileName} löschen`}
                      className="rounded-full p-1.5 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken,#f1f5f9)] hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {files.length ? <h3 className="border-t border-[color:var(--border)] px-5 pt-3 text-[13px] font-semibold text-[color:var(--muted)]">Von Ihnen hochgeladen</h3> : null}
        </div>
      ) : null}
      {files.length === 0 ? (
        unterlagen.length ? null : (
          <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch keine Dokumente. Laden Sie hier z. B. das Angebot hoch, das Sie geschickt haben.</p>
        )
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-3">
              <FileText className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
              <a href={`/api/buyer/leads/${leadId}/dateien/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-[color:var(--brand)]">
                <span className="block truncate text-[15px] font-medium">{f.fileName}</span>
                <span className="text-xs text-[color:var(--muted)]">
                  {LABEL[f.kind]} · {formatBytes(f.size)} · {day(f.createdAt)}
                  {f.wirdGeprueft ? " · wird auf Viren geprüft" : ""}
                </span>
                {f.stand ? (
                  <span className="mt-1 block text-xs font-medium text-emerald-700" data-angebot-stand>
                    {f.stand}
                  </span>
                ) : null}
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
