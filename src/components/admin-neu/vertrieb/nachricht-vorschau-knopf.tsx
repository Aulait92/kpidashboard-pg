"use client";

// Zeile von „Geplante Nachrichten“ antippen (Ole, 22.11.2026): öffnet die Nachricht, so wie sie mit den
// echten Daten rausgeht. Laden erst beim Öffnen; ohne Seiteneffekte (vorschau-actions.ts).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { NachrichtVorschauTeile } from "@/components/vertrieb/nachricht-vorschau";
import { geplanteVorschauAction, type GeplanteVorschauErgebnis } from "@/app/admin/vertrieb/vorschau-actions";
import type { Kanal } from "@/lib/vertrieb/geplante-nachrichten";

export function NachrichtVorschauKnopf({ nachricht }: { nachricht: { key: string; at: string; kanaele: Kanal[]; art: string; empfaenger: string; href: string } }) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="absolute inset-0 cursor-pointer"
        aria-label={`Vorschau: ${nachricht.art} an ${nachricht.empfaenger}`}
        data-nachricht-vorschau-knopf
      />
      {offen ? <VorschauFenster n={nachricht} onClose={() => setOffen(false)} /> : null}
    </>
  );
}

function VorschauFenster({ n, onClose }: { n: { key: string; at: string; kanaele: Kanal[]; art: string; empfaenger: string; href: string }; onClose: () => void }) {
  const [r, setR] = useState<GeplanteVorschauErgebnis | null>(null);
  const kanaele = n.kanaele.join(",");
  useEffect(() => {
    let aktuell = true;
    geplanteVorschauAction(n.key, n.at, kanaele.split(",") as Kanal[])
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Vorschau konnte nicht geladen werden." }))
      .then((x) => {
        if (aktuell) setR(x);
      });
    return () => {
      aktuell = false;
    };
  }, [n.key, n.at, kanaele]);
  return (
    <Sheet
      open
      onClose={onClose}
      title={n.art}
      footer={
        <div className="flex shrink-0 border-t border-[color:var(--border)] px-5 py-3">
          <Link href={n.href} className="inline-flex min-h-10 w-full items-center justify-center text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
            Akte von {n.empfaenger} öffnen
          </Link>
        </div>
      }
    >
      <div className="px-5 py-4">
        {!r ? (
          <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
          </div>
        ) : !r.ok ? (
          <div className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {r.error}
          </div>
        ) : (
          <NachrichtVorschauTeile teile={r.teile} />
        )}
      </div>
    </Sheet>
  );
}
