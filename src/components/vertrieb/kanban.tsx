"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import clsx from "clsx";

export type KanbanColumn = {
  id: string;
  label: string;
  color: string;
  hint: string;
  count: number; // Gesamtzahl laut Datenbank (kann größer sein als die gezeigten Karten)
  top?: ReactNode; // fester Inhalt oben in der Spalte (z.B. Hinweis bei "Neu")
  bottom?: ReactNode; // z.B. Link "+ 120 weitere"
};

export type KanbanCard = { id: string; column: string; value?: number | null; node: ReactNode };

type Props = {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  move: (id: string, to: string, reason?: string) => Promise<void>;
  /** Spalte, bei der vor dem Verschieben ein Grund abgefragt wird (z.B. Verloren) */
  reasonColumn?: string;
  reasons?: { id: string; label: string }[];
  showValue?: boolean;
  /** Platz über dem Board (Navigation, Überschrift …) in px, damit es genau bis zum Bildschirmrand reicht */
  topOffset?: number;
};

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function Kanban({ columns, cards, move, reasonColumn, reasons, showValue, topOffset = 150 }: Props) {
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]); // zuletzt verschobene Karten zuerst
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ id: string; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const colOf = (c: KanbanCard) => moved[c.id] ?? c.column;
  const byColumn = useMemo(() => {
    const map: Record<string, KanbanCard[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const c of cards) map[colOf(c)]?.push(c);
    for (const id in map) {
      map[id].sort((a, b) => {
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, moved, order, columns]);

  function countFor(col: KanbanColumn) {
    let n = col.count;
    for (const c of cards) {
      const to = moved[c.id];
      if (!to || to === c.column) continue;
      if (c.column === col.id) n--;
      if (to === col.id) n++;
    }
    return n;
  }

  function apply(id: string, to: string, reason?: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || colOf(card) === to) return;
    const prev = moved[id];
    setMoved((m) => ({ ...m, [id]: to }));
    setOrder((o) => [id, ...o.filter((x) => x !== id)]);
    setError(null);
    startTransition(async () => {
      try {
        await move(id, to, reason);
      } catch {
        setMoved((m) => {
          const next = { ...m };
          if (prev) next[id] = prev;
          else delete next[id];
          return next;
        });
        setError("Verschieben hat nicht geklappt – bitte nochmal versuchen.");
      }
    });
  }

  function onDrop(to: string) {
    const id = dragId;
    setOver(null);
    setDragId(null);
    if (!id) return;
    if (reasonColumn && to === reasonColumn && reasons?.length) setAsk({ id, to });
    else apply(id, to);
  }

  return (
    <>
      {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}
      <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2" style={{ height: `calc(100vh - ${topOffset}px)` }}>
        {columns.map((col) => {
          const items = byColumn[col.id] ?? [];
          const value = showValue ? items.reduce((a, c) => a + (c.value ?? 0), 0) : 0;
          return (
            <section
              key={col.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== col.id) setOver(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col.id ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(col.id);
              }}
              className={clsx(
                "flex min-w-[190px] flex-1 basis-0 flex-col rounded-xl p-2 transition-colors",
                over === col.id ? "bg-sky-100 ring-2 ring-sky-400" : "bg-slate-100/80",
              )}
            >
              <header className="flex items-center justify-between px-1 pb-1">
                <span className={`badge ${col.color}`}>{col.label}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {countFor(col).toLocaleString("de-DE")}
                  {value ? ` · ${eur(value)}/M` : ""}
                </span>
              </header>
              <p className="px-1 pb-2 text-xs text-slate-500">{col.hint}</p>
              <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 pb-1">
                {col.top}
                {items.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    className={clsx("cursor-grab active:cursor-grabbing", dragId === c.id && "opacity-40")}
                  >
                    {c.node}
                  </div>
                ))}
                {col.bottom}
              </div>
            </section>
          );
        })}
      </div>

      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setAsk(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium">Warum verloren?</h3>
            <div className="mt-3 grid gap-2">
              {reasons!.map((r) => (
                <button
                  key={r.id}
                  className="btn-ghost justify-start"
                  onClick={() => {
                    apply(ask.id, ask.to, r.id);
                    setAsk(null);
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button className="mt-3 text-sm text-slate-500 hover:underline" onClick={() => setAsk(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </>
  );
}
