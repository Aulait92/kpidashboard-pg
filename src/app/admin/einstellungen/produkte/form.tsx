"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { CatalogItem } from "@/lib/produkt-buchen-shared";
import { saveCatalogItemAction, type CatalogState } from "./actions";

/** Eine Zeile im Katalog: an/aus, Bewährt/Test, Nutzen-Text. */
export function CatalogItemForm({ item }: { item: CatalogItem }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(saveCatalogItemAction, {});
  return (
    <form action={action} className="space-y-3 px-5 py-4" data-catalog-item={item.key}>
      <input type="hidden" name="key" value={item.key} />
      <div className="flex flex-wrap items-center gap-4">
        <span className="min-w-0 flex-1 font-medium">{item.name}</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={item.enabled} className="h-4 w-4" /> buchbar
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="proven" defaultChecked={item.proven} className="h-4 w-4" /> bewährt
        </label>
      </div>
      <textarea name="benefit" defaultValue={item.benefit} rows={2} maxLength={240} className="input w-full text-sm" aria-label={`Nutzen ${item.name}`} />
      <div className="flex items-center gap-3">
        <button className="btn-primary h-9 text-sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Speichern
        </button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-emerald-700">Gespeichert.</span> : null}
      </div>
    </form>
  );
}
