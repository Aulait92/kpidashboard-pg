"use client";

// Angebote zum Termin (Ole, 15.11.2026): auslesen lassen oder eintragen, prüfen, Empfehlung markieren, bestätigen.
// Erst bestätigte Angebote kommen in die Präsentation.

import { useState, useTransition } from "react";
import { CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { AngebotItem } from "@/lib/angebote";
import { angeboteAuslesenAction, angeboteSpeichernAction } from "./actions";

type BRow = { name: string; beitrag: string; aktiv: boolean };
type Row = { sparte: string; gesellschaft: string; tarif: string; beitragMonat: string; selbstbeteiligung: string; leistungen: string; ausschluesse: string; empfohlen: boolean; bausteine: BRow[]; merkmale: string };
const toRow = (i: AngebotItem): Row => ({
  sparte: i.sparte,
  gesellschaft: i.gesellschaft ?? "",
  tarif: i.tarif ?? "",
  beitragMonat: i.beitragMonat != null ? String(i.beitragMonat).replace(".", ",") : "",
  selbstbeteiligung: i.selbstbeteiligung ?? "",
  leistungen: i.leistungen.join("\n"),
  ausschluesse: i.ausschluesse.join("\n"),
  empfohlen: i.empfohlen,
  bausteine: i.bausteine.map((b) => ({ name: b.name, beitrag: String(b.beitrag).replace(".", ","), aktiv: b.aktiv })),
  merkmale: i.merkmale.map((m) => `${m.name}: ${m.wert}`).join("\n"),
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
  merkmale: r.merkmale
    .split("\n")
    .map((l) => l.split(":"))
    .filter((x) => x[0]?.trim())
    .map(([name, ...w]) => ({ name: name.trim(), wert: w.join(":").trim() || "nein" })),
  bausteine: r.bausteine.filter((b) => b.name.trim() && b.beitrag.trim()).map((b) => ({ name: b.name.trim(), beitrag: b.beitrag.replace(",", "."), aktiv: b.aktiv })),
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
            <label className="block"><span className="text-xs text-[color:var(--muted)]">{r.bausteine.length ? "Grundbeitrag ohne Bausteine (€)" : "Beitrag pro Monat (€)"}</span><input className={input} inputMode="decimal" value={r.beitragMonat} disabled={p.readOnly} onChange={(e) => set(i, { beitragMonat: e.target.value })} /></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Wichtigste Leistungen (je Zeile eine)</span><textarea className={area} value={r.leistungen} disabled={p.readOnly} onChange={(e) => set(i, { leistungen: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Nicht versichert / Wartezeiten</span><textarea className={area} value={r.ausschluesse} disabled={p.readOnly} onChange={(e) => set(i, { ausschluesse: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-[color:var(--muted)]">Selbstbeteiligung</span><input className={input} value={r.selbstbeteiligung} disabled={p.readOnly} onChange={(e) => set(i, { selbstbeteiligung: e.target.value })} /></label>
          </div>
          <label className="mt-3 block">
            <span className="text-xs text-[color:var(--muted)]">Vergleich mit anderen Stufen (je Zeile „Merkmal: Wert“, z. B. Versicherungssumme: 75 Mio. € oder Neuwert: ja)</span>
            <textarea className={area} value={r.merkmale} disabled={p.readOnly} onChange={(e) => set(i, { merkmale: e.target.value })} />
          </label>
          <div className="mt-3" data-bausteine>
            <div className="text-xs text-[color:var(--muted)]">
              Bausteine mit eigenem Beitrag aus dem Tarifrechner (z. B. Zahnbehandlung +4,10 oder höhere Selbstbeteiligung −2,80). Im Termin schalten Sie sie per Klick an oder ab.
            </div>
            {r.bausteine.map((b, j) => {
              const setB = (patch: Partial<BRow>) => set(i, { bausteine: r.bausteine.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
              return (
                <div key={j} className="mt-2 flex items-center gap-2">
                  <input type="checkbox" title="Im Angebot enthalten" checked={b.aktiv} disabled={p.readOnly} onChange={(e) => setB({ aktiv: e.target.checked })} />
                  <input className={`${input} flex-1`} placeholder="Baustein" value={b.name} disabled={p.readOnly} onChange={(e) => setB({ name: e.target.value })} />
                  <input className={`${input} w-28`} placeholder="€ / Monat" inputMode="decimal" value={b.beitrag} disabled={p.readOnly} onChange={(e) => setB({ beitrag: e.target.value })} />
                  {!p.readOnly ? (
                    <button type="button" aria-label="Baustein entfernen" className="rounded p-2 text-[color:var(--muted)] hover:bg-rose-50 hover:text-rose-700" onClick={() => set(i, { bausteine: r.bausteine.filter((_, k) => k !== j) })}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!p.readOnly && r.bausteine.length < 6 ? (
              <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)]" onClick={() => set(i, { bausteine: [...r.bausteine, { name: "", beitrag: "", aktiv: true }] })}>
                <Plus className="h-3.5 w-3.5" /> Baustein hinzufügen
              </button>
            ) : null}
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
          <Button variant="ghost" size="md" icon={Plus} onClick={() => { setRows([...rows, { sparte: "", gesellschaft: "", tarif: "", beitragMonat: "", selbstbeteiligung: "", leistungen: "", ausschluesse: "", empfohlen: false, bausteine: [], merkmale: "" }]); setDirty(true); }}>
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
