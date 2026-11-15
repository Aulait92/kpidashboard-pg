"use client";

// Angebote zum Termin (Ole, 15.11.2026): auslesen lassen oder eintragen, prüfen, Empfehlung markieren, bestätigen.
// Erst bestätigte Angebote kommen in die Präsentation.

import { useState, useTransition } from "react";
import { CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { AngebotItem } from "@/lib/angebote";
import { angeboteAuslesenAction, angeboteSpeichernAction } from "./actions";

type Row = { sparte: string; gesellschaft: string; tarif: string; beitragMonat: string; selbstbeteiligung: string; leistungen: string; ausschluesse: string; empfohlen: boolean };
const toRow = (i: AngebotItem): Row => ({
  sparte: i.sparte,
  gesellschaft: i.gesellschaft ?? "",
  tarif: i.tarif ?? "",
  beitragMonat: i.beitragMonat != null ? String(i.beitragMonat).replace(".", ",") : "",
  selbstbeteiligung: i.selbstbeteiligung ?? "",
  leistungen: i.leistungen.join("\n"),
  ausschluesse: i.ausschluesse.join("\n"),
  empfohlen: i.empfohlen,
});
const fromRow = (r: Row) => ({
  sparte: r.sparte,
  gesellschaft: r.gesellschaft || null,
  tarif: r.tarif || null,
  beitragMonat: r.beitragMonat ? Number(r.beitragMonat.replace(",", ".")) : null,
  selbstbeteiligung: r.selbstbeteiligung || null,
  leistungen: r.leistungen.split("\n").map((x) => x.trim()).filter(Boolean),
  ausschluesse: r.ausschluesse.split("\n").map((x) => x.trim()).filter(Boolean),
  empfohlen: r.empfohlen,
});
const input = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm";
const area = "min-h-[84px] w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm";

export function AngeboteEditor(p: {
  id: string;
  items: AngebotItem[];
  bestaetigt: boolean;
  dateien: { id: string; fileName: string }[];
  auslesenErlaubt: boolean;
  readOnly?: boolean;
  leadHref: string | null;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(p.items.map(toRow));
  const [dirty, setDirty] = useState(false);
  const set = (i: number, patch: Partial<Row>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const save = (bestaetigen: boolean) =>
    start(async () => {
      const r = await angeboteSpeichernAction(p.id, { items: rows.map(fromRow) }, bestaetigen);
      if (!r.ok) return toast.show({ message: r.error ?? "Fehler", tone: "error" });
      setDirty(false);
      toast.show({ message: bestaetigen ? "Bestätigt, die Präsentation ist bereit" : "Gespeichert" });
    });
  const auslesen = () =>
    start(async () => {
      const r = await angeboteAuslesenAction(p.id);
      if (!r.ok) return toast.show({ message: r.error ?? "Fehler", tone: "error" });
      toast.show({ message: `${r.anzahl} ${r.anzahl === 1 ? "Angebot" : "Angebote"} ausgelesen. Bitte prüfen und bestätigen.` });
      window.location.reload();
    });

  return (
    <div className="space-y-4 px-5 py-4 text-sm" data-angebote-editor>
      <div className="flex flex-wrap items-center gap-3">
        {p.auslesenErlaubt ? (
          <Button variant="secondary" size="md" icon={Sparkles} disabled={pending || p.readOnly || !p.dateien.length} onClick={auslesen}>
            {p.dateien.length ? `Aus ${p.dateien.length} ${p.dateien.length === 1 ? "Angebot" : "Angeboten"} auslesen` : "Angebote auslesen"}
          </Button>
        ) : null}
        <span className="text-[color:var(--muted)]">
          {p.dateien.length
            ? `Hochgeladen: ${p.dateien.map((d) => d.fileName).join(", ")}`
            : "Noch kein Angebot hochgeladen."}{" "}
          {p.leadHref ? (
            <a className="font-medium text-[color:var(--brand)] underline" href={p.leadHref}>
              Im Kontakt hochladen
            </a>
          ) : null}
        </span>
      </div>
      {!p.auslesenErlaubt ? <p className="text-xs text-[color:var(--muted)]">Automatisches Auslesen ist noch im Test. Tragen Sie die Angebote hier ein.</p> : null}

      {rows.map((r, i) => (
        <div key={i} className={`rounded-[var(--radius-md)] border p-4 ${r.empfohlen ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]/40" : "border-[color:var(--border)]"}`}>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block sm:col-span-1"><span className="text-xs text-[color:var(--muted)]">Sparte</span><input className={input} value={r.sparte} disabled={p.readOnly} onChange={(e) => set(i, { sparte: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Gesellschaft</span><input className={input} value={r.gesellschaft} disabled={p.readOnly} onChange={(e) => set(i, { gesellschaft: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Tarif / Stufe</span><input className={input} value={r.tarif} disabled={p.readOnly} onChange={(e) => set(i, { tarif: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Beitrag pro Monat (€)</span><input className={input} inputMode="decimal" value={r.beitragMonat} disabled={p.readOnly} onChange={(e) => set(i, { beitragMonat: e.target.value })} /></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Wichtigste Leistungen (je Zeile eine)</span><textarea className={area} value={r.leistungen} disabled={p.readOnly} onChange={(e) => set(i, { leistungen: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Nicht versichert / Wartezeiten</span><textarea className={area} value={r.ausschluesse} disabled={p.readOnly} onChange={(e) => set(i, { ausschluesse: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Selbstbeteiligung</span><input className={input} value={r.selbstbeteiligung} disabled={p.readOnly} onChange={(e) => set(i, { selbstbeteiligung: e.target.value })} /></label>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label className="inline-flex items-center gap-2 font-medium">
              <input type="checkbox" checked={r.empfohlen} disabled={p.readOnly} onChange={(e) => set(i, { empfohlen: e.target.checked })} /> Das empfehle ich
            </label>
            {!p.readOnly ? (
              <button type="button" aria-label="Angebot entfernen" className="rounded p-2 text-[color:var(--muted)] hover:bg-rose-50 hover:text-rose-700" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }}>
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {!p.readOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="md" icon={Plus} onClick={() => { setRows([...rows, { sparte: "", gesellschaft: "", tarif: "", beitragMonat: "", selbstbeteiligung: "", leistungen: "", ausschluesse: "", empfohlen: false }]); setDirty(true); }}>
            Angebot hinzufügen
          </Button>
          {rows.length ? (
            <Button variant="primary" size="md" icon={CheckCircle2} disabled={pending} onClick={() => save(true)} data-angebote-bestaetigen>
              {p.bestaetigt && !dirty ? "Bestätigt" : "Prüfen und bestätigen"}
            </Button>
          ) : null}
          {dirty ? <span className="text-xs text-amber-700">Noch nicht gespeichert</span> : null}
        </div>
      ) : null}
    </div>
  );
}
