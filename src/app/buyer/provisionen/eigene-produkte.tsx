"use client";

// „Meine Provisionen → Ihre eigenen Produkte“ (Ole, 14.11.2026): eigene Produkte mit ihren Standardsätzen,
// hier direkt anlegbar (Ole, 15.11.2026) oder beim Abschluss. Änderungen gelten für künftige Abschlüsse.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { EigenesProdukt } from "@/lib/eigene-produkte";
import { saveEigeneProdukteAction } from "./actions";

const pct = (n: number) => String(Math.round(n * 10000) / 100).replace(".", ",");
const inputCls = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm";

export function EigeneProdukte({ products, canEdit }: { products: EigenesProdukt[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(products.map((p) => ({ name: p.name, rateAbschluss: pct(p.rateAbschluss), rateBestand: pct(p.rateBestand) })));
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
        <p className="text-[color:var(--muted)]">
          Weitere Produkte, die Sie verkaufen, mit Ihren eigenen Sätzen. Sie stehen beim Abschluss zur Auswahl. Änderungen gelten für künftige Abschlüsse, eingetragene Verträge behalten ihre Sätze.
        </p>
        {rows.length === 0 ? (
          <p className="text-[color:var(--muted)]">Noch keine eigenen Produkte.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_90px_110px_36px] gap-2 text-xs text-[color:var(--muted)]">
              <span>Produkt</span>
              <span>Abschluss %</span>
              <span>Bestand % pro Jahr</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_110px_36px] items-center gap-2">
                <input className={inputCls} value={r.name} placeholder="z. B. Zahnzusatz" aria-label="Produkt" disabled={!canEdit} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={inputCls} inputMode="decimal" placeholder="z. B. 20" aria-label="Abschluss %" value={r.rateAbschluss} disabled={!canEdit} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rateAbschluss: e.target.value } : x)))} />
                <input className={inputCls} inputMode="decimal" placeholder="z. B. 10" aria-label="Bestand % pro Jahr" value={r.rateBestand} disabled={!canEdit} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rateBestand: e.target.value } : x)))} />
                {canEdit ? (
                  <button type="button" aria-label={`${r.name} entfernen`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--muted)] hover:bg-rose-50 hover:text-rose-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              data-eigenes-produkt-neu
              onClick={() => setRows([...rows, { name: "", rateAbschluss: "", rateBestand: "" }])}
            >
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
