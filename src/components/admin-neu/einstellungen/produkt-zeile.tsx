"use client";

import { useActionState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { saveCatalogItemAction, type CatalogState } from "@/app/admin/einstellungen/produkte/actions";
import { Badge, Button } from "@/components/ui";
import type { CatalogItem } from "@/lib/produkt-buchen-shared";

// Eine Sparte im Produktkatalog (neuer Admin): Zeile mit Stand (buchbar, bewährt), zum Bearbeiten aufklappen.
// Dieselbe Server Action wie /admin/einstellungen/produkte (CatalogItemForm), nur kompakter und am Handy lesbar.
export function ProduktZeile({ item }: { item: CatalogItem }) {
  const [state, action, pending] = useActionState<CatalogState, FormData>(saveCatalogItemAction, {});
  return (
    <details className="group" data-catalog-item={item.key}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-sm font-medium">{item.name}</span>
        {item.enabled ? <Badge tone="success">buchbar</Badge> : <Badge>aus</Badge>}
        {item.enabled ? item.proven ? <Badge tone="brand">bewährt</Badge> : <Badge tone="info">neu</Badge> : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <form action={action} className="space-y-3 px-5 pb-4">
        <input type="hidden" name="key" value={item.key} />
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={item.enabled} className="h-4 w-4" /> buchbar
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="proven" defaultChecked={item.proven} className="h-4 w-4" /> bewährt (zeigt den Leadpreis aus dem Rechner)
          </label>
        </div>
        <label className="block text-sm">
          <span className="label">Nutzen für Kunden</span>
          <textarea name="benefit" defaultValue={item.benefit} rows={3} maxLength={240} className="input w-full" />
        </label>
        <div className="flex items-center gap-3">
          <Button size="md" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern
          </Button>
          {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
          {state.ok ? <span className="text-sm text-emerald-700">Gespeichert.</span> : null}
        </div>
      </form>
    </details>
  );
}
