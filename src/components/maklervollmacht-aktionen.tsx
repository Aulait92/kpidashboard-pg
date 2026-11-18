"use client";

import { useState, useTransition } from "react";
import { Copy, Download, ExternalLink, Mail } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { vollmachtAnfordernAction, vollmachtPerMailAction, vollmachtWiderrufenAction } from "@/app/buyer/vollmacht-actions";

type V = { id: string; status: string; link: string; abgelaufen: boolean; gesendet: boolean; unterschrieben: string; vertraege: number; versicherer: string[] };

export function MaklervollmachtAktionen({ leadId, v, readOnly, hatEmail }: { leadId: string; v: V | null; readOnly: boolean; hatEmail: boolean }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [link, setLink] = useState<string | null>(v?.status === "offen" && !v.abgelaufen ? v.link : null);

  const anfordern = () =>
    start(async () => {
      const r = await vollmachtAnfordernAction(leadId);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setLink(r.link ?? null);
    });
  const kopieren = async () => {
    if (!link) return;
    await navigator.clipboard?.writeText(link).catch(() => {});
    toast.show({ message: "Link kopiert" });
  };

  if (v?.status === "unterschrieben") {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          <b>Unterschrieben am {v.unterschrieben}</b> · {v.vertraege} {v.vertraege === 1 ? "Vertrag" : "Verträge"}, Übertragung beantragen
        </p>
        <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
          {v.versicherer.map((name) => (
            <li key={name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{name}</span>
              <a href={`/buyer/vollmacht/${v.id}/pdf?v=${encodeURIComponent(name)}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")} data-vv-schreiben>
                <Download className="h-4 w-4" /> Schreiben
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a href={`/buyer/vollmacht/${v.id}/pdf`} target="_blank" rel="noopener" className="font-medium text-[color:var(--brand)] hover:underline">
            Alle Dokumente (PDF)
          </a>
          {!readOnly ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm("Hat der Kunde die Vollmacht widerrufen? Die Dokumente bleiben als Nachweis gespeichert.")) return;
                start(async () => {
                  const r = await vollmachtWiderrufenAction(v.id, leadId);
                  toast.show(r.ok ? { message: r.message ?? "Gespeichert" } : { message: r.error, tone: "error" });
                });
              }}
              className="text-[color:var(--muted)] hover:text-rose-700"
            >
              Widerruf eintragen
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (link && v) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[color:var(--muted)]">{v.gesendet ? "Link ist raus, wartet auf Unterschrift." : "Wartet auf Unterschrift. Link schicken oder im Termin öffnen."}</p>
        <div className="flex flex-wrap gap-2">
          {hatEmail && !readOnly ? (
            <Button
              variant="primary"
              size="md"
              icon={Mail}
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await vollmachtPerMailAction(v.id, leadId);
                  toast.show(r.ok ? { message: r.message ?? "Gesendet" } : { message: r.error, tone: "error" });
                })
              }
              data-vv-mail
            >
              {v.gesendet ? "Erneut senden" : "Per E-Mail senden"}
            </Button>
          ) : null}
          <Button variant={hatEmail ? "secondary" : "primary"} size="md" icon={Copy} onClick={kopieren} data-vv-kopieren>
            Link kopieren
          </Button>
          <a href={link} target="_blank" rel="noopener" className={buttonClass("ghost", "md")}>
            <ExternalLink className="h-4 w-4" /> Im Termin öffnen
          </a>
        </div>
      </div>
    );
  }

  if (link && !v) {
    // gerade angefordert (Seite lädt neu): Link schon zeigen
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md" icon={Copy} onClick={kopieren}>
          Link kopieren
        </Button>
        <a href={link} target="_blank" rel="noopener" className={buttonClass("ghost", "md")}>
          <ExternalLink className="h-4 w-4" /> Im Termin öffnen
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-sm text-[color:var(--muted)]">{v?.abgelaufen ? "Der Link ist abgelaufen." : "Bestehende Verträge des Kunden zu Ihnen holen."}</p>
      {!readOnly ? (
        <Button variant="primary" size="md" disabled={busy} onClick={anfordern} data-vv-anfordern>
          {v?.abgelaufen ? "Neuen Link" : "Vollmacht anfordern"}
        </Button>
      ) : null}
    </div>
  );
}
