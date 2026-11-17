"use client";

// „Meine Provisionen → Ihre eigenen Produkte“ (Ole, 14.11.2026): eigene Produkte mit ihren Standardsätzen,
// hier direkt anlegbar (Ole, 15.11.2026) oder beim Abschluss. Änderungen gelten für künftige Abschlüsse.
// Art (Ole, 17.11.2026: „Leben, Kranken und Sach … bei jedem muss die Berechnung passen“): Sach in % vom
// Jahresbeitrag, Leben in ‰ der Beitragssumme, Kranken in Monatsbeiträgen; Bestand jeweils % pro Jahr.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { abschlussAnzeige, abschlussAusEingabe, artInfo, PRODUKT_ARTEN, type EigenesProdukt, type ProduktArt } from "@/lib/eigene-produkte";
import { saveEigeneProdukteAction } from "./actions";

const pct = (n: number) => String(Math.round(n * 10000) / 100).replace(".", ",");
const inputCls = "h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm";
const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const zahl = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
// Übliche Werte beim Umschalten der Art
const STANDARD: Record<ProduktArt, { a: string; b: string }> = { sach: { a: "55", b: "10" }, leben: { a: "25", b: "1,5" }, kranken: { a: "6", b: "2" } };

type Zeile = { name: string; art: ProduktArt; rateAbschluss: string; rateBestand: string };

/** Beispielsatz je Art (wie bei den Standardprodukten). */
function beispiel(z: Zeile): string {
  const a = abschlussAusEingabe(z.art, z.rateAbschluss);
  const b = zahl(z.rateBestand);
  if (a === "invalid" || a == null || (z.rateBestand.trim() && b == null)) return "Bitte gültige Zahlen eintragen.";
  const bestand = (b ?? 0) / 100;
  if (z.art === "leben") {
    const summe = 50 * 12 * 30;
    return `Bei 50 € im Monat und 30 Jahren (${eur(summe)} Beitragssumme): ≈ ${eur((summe * a) / 1000)} Abschlussprovision, ≈ ${eur(600 * bestand)} Bestand pro Jahr`;
  }
  if (z.art === "kranken") return `Bei 30 € im Monat: ≈ ${eur(30 * a)} Abschlussprovision, ≈ ${eur(360 * bestand)} Bestand pro Jahr`;
  return `Bei 300 € Jahresbeitrag: ≈ ${eur(300 * a)} Abschlussprovision, ab dem 2. Jahr ≈ ${eur(300 * bestand)} Bestand pro Jahr`;
}

export function EigeneProdukte({ products, canEdit }: { products: EigenesProdukt[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Zeile[]>(
    products.map((p) => ({ name: p.name, art: p.art, rateAbschluss: abschlussAnzeige(p.art, p.rateAbschluss), rateBestand: pct(p.rateBestand) })),
  );
  const set = (i: number, patch: Partial<Zeile>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = () =>
    start(async () => {
      const r = await saveEigeneProdukteAction(rows);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      toast.show({ message: "Gespeichert" });
      router.refresh();
    });
  return (
    <Card className="mt-6" data-eigene-produkte>
      <CardHeader title="Ihre eigenen Produkte" icon={Package} />
      <div className="space-y-3 p-5 text-sm">
        <p className="text-[color:var(--muted)]">Weitere Produkte, die Sie verkaufen, mit Ihren eigenen Sätzen. Sie stehen beim Abschluss zur Auswahl, eingetragene Verträge behalten ihre Sätze.</p>
        {rows.length === 0 ? <p className="text-[color:var(--muted)]">Noch keine eigenen Produkte.</p> : null}
        {rows.map((r, i) => {
          const info = artInfo(r.art);
          return (
            <div key={i} className="space-y-2.5 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-eigenes-produkt-zeile>
              <div className="flex items-center gap-2">
                <input className={inputCls} value={r.name} placeholder="z. B. Zahnzusatz Premium" aria-label="Produkt" disabled={!canEdit} onChange={(e) => set(i, { name: e.target.value })} />
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`${r.name || "Produkt"} entfernen`}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--muted)] hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div role="radiogroup" aria-label="Rechnet wie" className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-1" data-produkt-art>
                {PRODUKT_ARTEN.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="radio"
                    aria-checked={r.art === a.key}
                    disabled={!canEdit}
                    onClick={() => r.art !== a.key && set(i, { art: a.key, rateAbschluss: STANDARD[a.key].a, rateBestand: STANDARD[a.key].b })}
                    className={`h-9 rounded-[var(--radius-sm)] text-sm font-medium ${r.art === a.key ? "bg-white shadow-sm" : "text-[color:var(--muted)]"}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {/* items-end: Felder bleiben auf einer Linie, auch wenn eine Beschriftung am Handy umbricht */}
              <div className="grid grid-cols-2 items-end gap-2">
                <label className="block min-w-0">
                  <span className="text-xs text-[color:var(--muted)]">Abschluss in {info.kurz === "MB" ? "Monatsbeiträgen" : info.einheit}</span>
                  <input className={`${inputCls} mt-1`} inputMode="decimal" aria-label={`Abschluss in ${info.kurz === "MB" ? "Monatsbeiträgen" : info.einheit}`} value={r.rateAbschluss} disabled={!canEdit} onChange={(e) => set(i, { rateAbschluss: e.target.value })} />
                </label>
                <label className="block min-w-0">
                  <span className="text-xs text-[color:var(--muted)]">Bestand in % pro Jahr</span>
                  <input className={`${inputCls} mt-1`} inputMode="decimal" aria-label="Bestand in % pro Jahr" value={r.rateBestand} disabled={!canEdit} onChange={(e) => set(i, { rateBestand: e.target.value })} />
                </label>
              </div>
              <p className="text-xs text-[color:var(--muted)]" data-eigenes-produkt-beispiel>
                {beispiel(r)}
              </p>
            </div>
          );
        })}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="md" data-eigenes-produkt-neu onClick={() => setRows([...rows, { name: "", art: "sach", rateAbschluss: STANDARD.sach.a, rateBestand: STANDARD.sach.b }])}>
              <Plus className="h-4 w-4" /> Produkt hinzufügen
            </Button>
            {rows.length > 0 || products.length > 0 ? (
              <Button variant="primary" size="md" disabled={pending} onClick={save}>
                {pending ? "Speichere …" : "Speichern"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
