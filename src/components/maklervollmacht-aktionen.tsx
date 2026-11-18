"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Download, ExternalLink, Mail } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { vollmachtAnfordernAction, vollmachtPerMailAction, vollmachtSchreibenGesendetAction, vollmachtWiderrufenAction } from "@/app/buyer/vollmacht-actions";

type Stand = { versicherer: { name: string; vertraege: number; gesendetAm: string | null }[]; offen: number; zeile: string };
type V = {
  id: string;
  status: string;
  link: string;
  abgelaufen: boolean;
  gesendet: boolean;
  unterschrieben: string;
  /** Kopie an den Kunden: gesendet | fehlgeschlagen | keine_adresse | null (alt bzw. unbekannt) */
  kopie: string | null;
  stand: Stand;
};

const KOPIE: Record<string, string> = {
  gesendet: "Kopie an den Kunden per E-Mail gesendet",
  fehlgeschlagen: "Kopie per E-Mail fehlgeschlagen, bitte das PDF selbst schicken",
  keine_adresse: "Ohne E-Mail-Adresse, Kopie bitte selbst schicken",
};
const kurzDatum = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

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
        <Uebertragung id={v.id} leadId={leadId} stand={v.stand} readOnly={readOnly} unterschrieben={v.unterschrieben} kopie={v.kopie} />
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

/**
 * Nach der Unterschrift (Ole, 18.11.2026): klare Aufgabe statt Statuszeile. Eine Hauptaktion „Schreiben an Versicherer
 * herunterladen“ (alle noch offenen in einer Datei), je Versicherer offen/gesendet zum Abhaken (gespeichert).
 */
function Uebertragung({ id, leadId, stand, readOnly, unterschrieben, kopie }: { id: string; leadId: string; stand: Stand; readOnly: boolean; unterschrieben: string; kopie: string | null }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [gesendet, setGesendet] = useState<Record<string, string | null>>(() => Object.fromEntries(stand.versicherer.map((g) => [g.name, g.gesendetAm])));
  const zeilen = stand.versicherer.map((g) => ({ ...g, gesendetAm: gesendet[g.name] ?? null }));
  const offen = zeilen.filter((g) => !g.gesendetAm);
  const gesamt = zeilen.reduce((s, g) => s + g.vertraege, 0);
  const offenVertraege = offen.reduce((s, g) => s + g.vertraege, 0);
  const vt = (n: number) => `${n} ${n === 1 ? "Vertrag" : "Verträge"}`;
  // Zeile wie uebertragungsStand (lib/maklervollmacht/regeln.ts), hier mit dem abgehakten Stand ohne Neuladen
  const zeile = offenVertraege === 0 ? `${vt(gesamt)}, alle Schreiben gesendet` : offenVertraege === gesamt ? `${vt(gesamt)}, noch nicht übertragen` : `${vt(offenVertraege)} von ${gesamt} noch nicht übertragen`;

  const abhaken = (name: string, an: boolean) => {
    const vorher = gesendet[name] ?? null;
    setGesendet((s) => ({ ...s, [name]: an ? new Date().toISOString() : null }));
    start(async () => {
      const r = await vollmachtSchreibenGesendetAction(id, leadId, name, an);
      if (!r.ok) {
        setGesendet((s) => ({ ...s, [name]: vorher }));
        toast.show({ message: r.error, tone: "error" });
      }
    });
  };

  return (
    <>
      <div>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold" data-vv-stand>
          {offen.length === 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
          {zeile}
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Unterschrieben am {unterschrieben}
          {kopie && KOPIE[kopie] ? <span className={kopie === "gesendet" ? undefined : "text-amber-700"}> · {KOPIE[kopie]}</span> : null}
        </p>
      </div>
      {offen.length ? (
        <a href={`/buyer/vollmacht/${id}/pdf?offen=1`} target="_blank" rel="noopener" className={buttonClass("primary", "md", "w-full sm:w-auto")} data-vv-alle-schreiben>
          <Download className="h-4 w-4 shrink-0" /> Schreiben an Versicherer herunterladen
        </a>
      ) : null}
      <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
        {zeilen.map((g) => (
          <li key={g.name} className="flex items-center gap-3 px-3 py-1.5 text-sm" data-vv-versicherer-zeile>
            <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[color:var(--brand)]"
                checked={!!g.gesendetAm}
                disabled={readOnly || busy}
                onChange={(e) => abhaken(g.name, e.target.checked)}
                aria-label={`Schreiben an ${g.name} gesendet`}
                data-vv-gesendet
              />
              <span className="min-w-0">
                <span className={`block truncate font-medium ${g.gesendetAm ? "text-[color:var(--muted)]" : ""}`}>{g.name}</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {vt(g.vertraege)} · {g.gesendetAm ? `gesendet am ${kurzDatum(g.gesendetAm)}` : "offen"}
                </span>
              </span>
            </label>
            <a
              href={`/buyer/vollmacht/${id}/pdf?v=${encodeURIComponent(g.name)}`}
              target="_blank"
              rel="noopener"
              className={buttonClass("ghost", "sm", "shrink-0")}
              aria-label={`Schreiben an ${g.name} herunterladen`}
              title="Nur dieses Schreiben"
              data-vv-schreiben
            >
              <Download className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
