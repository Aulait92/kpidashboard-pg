"use client";

// Logo für Präsentationen (Ole, 15.11.2026): von der Webseite holen oder hochladen, Verwendung bestätigen.

import { useRef, useState, useTransition } from "react";
import { Globe, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { istAllianzVertreterSeite } from "@/lib/vertreter-seite";
import { logoBestaetigenAction, logoEntfernenAction, logoHochladenAction, logoHolenAction } from "./actions";

export function LogoForm({ website: initialWebsite, dataUri, bestaetigt, canEdit }: { website: string; dataUri: string | null; bestaetigt: boolean; canEdit: boolean }) {
  const toast = useToast();
  const [website, setWebsite] = useState(initialWebsite);
  const [erlaubt, setErlaubt] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // Ole, 18.11.2026: Allianz-Vertreter-Seiten lassen sich vom Server nicht abrufen, dort gleich hochladen.
  const allianz = istAllianzVertreterSeite(website);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.show({ message: ok });
      else toast.show({ message: r.error, tone: "error" });
    });

  return (
    <div className="space-y-5 p-5" data-logo-form>
      <div>
        <label className="text-sm font-medium" htmlFor="logo-website">
          Ihre Webseite
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="logo-website"
            className="min-h-[40px] flex-1 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 text-sm"
            placeholder="z. B. agentur-mustermann.de"
            value={website}
            disabled={!canEdit || pending}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {allianz ? null : (
            <Button variant="primary" icon={Globe} disabled={!canEdit || pending || !website.trim()} onClick={() => run(() => logoHolenAction(website), "Logo geholt, bitte prüfen")}>
              Logo von der Webseite holen
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-[color:var(--muted)]" data-logo-hinweis>
          {allianz
            ? "Die Allianz lässt den automatischen Abruf Ihrer Vertreter-Seite nicht zu. Bitte laden Sie Ihr Logo selbst hoch."
            : "Wir nehmen das Logo, das auf Ihrer Webseite zu sehen ist. Bei einer Agentur ist das meist das Logo Ihres Versicherers."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("logo", f);
            run(() => logoHochladenAction(fd), "Logo hochgeladen, bitte prüfen");
            e.target.value = "";
          }}
        />
        <Button variant={allianz ? "primary" : undefined} icon={Upload} disabled={!canEdit || pending} onClick={() => fileRef.current?.click()}>
          Logo selbst hochladen
        </Button>
        <span className="text-xs text-[color:var(--muted)]">PNG, JPG oder SVG, höchstens 1 MB</span>
      </div>

      {dataUri ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-logo-preview>
          <div className="flex min-h-[96px] items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUri} alt="Ihr Logo" className="max-h-20 max-w-full object-contain" />
          </div>
          {bestaetigt ? (
            <p className="mt-3 text-sm text-emerald-700" data-logo-confirmed>
              Dieses Logo erscheint auf Ihren Präsentationen.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={erlaubt} disabled={!canEdit || pending} onChange={(e) => setErlaubt(e.target.checked)} />
                <span>Ich darf dieses Logo in meiner Beratung verwenden (z. B. als Agentur meiner Gesellschaft oder als eigenes Logo).</span>
              </label>
              <Button variant="primary" disabled={!canEdit || pending || !erlaubt} onClick={() => run(() => logoBestaetigenAction(erlaubt), "Logo übernommen")}>
                Logo verwenden
              </Button>
            </div>
          )}
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-[color:var(--muted)] hover:text-rose-600"
            disabled={!canEdit || pending}
            onClick={() => run(logoEntfernenAction, "Logo entfernt")}
          >
            <Trash2 className="h-3.5 w-3.5" /> Logo entfernen
          </button>
        </div>
      ) : null}
    </div>
  );
}
