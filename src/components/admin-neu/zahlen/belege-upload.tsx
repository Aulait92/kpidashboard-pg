"use client";

// Belege hochladen, Datei für Datei (Ole, 23.11.2026: mehrere große Dateien zusammen über 100 MB wurden abgelehnt,
// der Knopf „reagierte nicht“). Zeigt den Fortschritt; Dateien über 95 MB werden übersprungen (ZIP bitte aufteilen).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { belegEinzelnHochladenAction, belegeUploadFertigAction } from "@/app/admin/neu/zahlen/kosten/belege/actions";

const MAX_BYTES = 95 * 1024 * 1024;
const ZIEL = "/admin/neu/zahlen/kosten/belege";

export function BelegeUpload({ primaer }: { primaer: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function hochladen() {
    const dateien = Array.from(input.current?.files ?? []).slice(0, 50);
    if (!dateien.length) {
      setStatus("Bitte zuerst Dateien auswählen.");
      return;
    }
    setLaeuft(true);
    const summe = { neu: 0, doppelt: 0, fehlerhaft: 0 };
    const zuGross: string[] = [];
    for (let i = 0; i < dateien.length; i++) {
      const f = dateien[i];
      setStatus(`Lädt hoch: ${i + 1} von ${dateien.length}`);
      if (f.size > MAX_BYTES) {
        zuGross.push(f.name);
        continue;
      }
      const fd = new FormData();
      fd.append("datei", f);
      try {
        const r = await belegEinzelnHochladenAction(fd);
        summe.neu += r.neu;
        summe.doppelt += r.doppelt;
        summe.fehlerhaft += r.fehlerhaft;
      } catch {
        summe.fehlerhaft++;
      }
    }
    await belegeUploadFertigAction().catch(() => undefined);
    setLaeuft(false);
    if (zuGross.length) {
      setStatus(`Zu groß (über 95 MB), bitte aufteilen: ${zuGross.join(", ")}`);
    } else {
      setStatus(null);
    }
    if (input.current) input.current.value = "";
    const q = new URLSearchParams({ hochgeladen: String(summe.neu), doppelt: String(summe.doppelt), fehlerhaft: String(summe.fehlerhaft), imHintergrund: "1" });
    router.push(`${ZIEL}?${q.toString()}`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          multiple
          disabled={laeuft}
          accept="application/pdf,image/jpeg,image/png,image/webp,application/zip,.zip"
          className="min-w-0 flex-1 basis-56 text-sm file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[color:var(--surface-sunken)] file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <Button type="button" onClick={hochladen} disabled={laeuft} variant={primaer ? "primary" : "secondary"} size="md" icon={Upload}>
          {laeuft ? "Lädt hoch …" : "Belege hochladen"}
        </Button>
      </div>
      {status ? <p className="mt-2 text-sm text-[color:var(--muted)]" aria-live="polite">{status}</p> : null}
    </div>
  );
}
