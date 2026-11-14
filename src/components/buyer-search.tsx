"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive, MessageCircle, Search, User } from "lucide-react";
import { SearchDialog, useSearchShortcut, useShortcutLabel, type SearchHit } from "@/components/search-dialog";
import { cn } from "@/lib/utils";

// Schnellsuche im Kundenbereich: ein Overlay je Seite (in der Shell), geöffnet
// per Strg+K / Cmd+K oder über die Suchknöpfe (Ereignis „pg-search-open“).

const OPEN_EVENT = "pg-search-open";
const ICONS = { kontakt: User, bestand: Archive, chat: MessageCircle };
const MAX_RECENT = 6;

function readRecent(key: string): SearchHit[] {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((h): h is SearchHit => !!h && typeof h.id === "string" && typeof h.href === "string" && h.href.startsWith("/buyer/")).slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(key: string, hit: SearchHit) {
  try {
    const next = [hit, ...readRecent(key).filter((h) => !(h.kind === hit.kind && h.id === hit.id))].slice(0, MAX_RECENT);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* privater Modus o. ä.: ohne Verlauf weiter */
  }
}

/** Overlay + Tastenkürzel. Genau einmal je Shell einbinden. */
export function BuyerSearch({ storageKey }: { storageKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<SearchHit[]>([]);
  const key = `pg-suche-zuletzt:${storageKey}`;

  const show = useCallback(() => {
    setRecent(readRecent(key));
    setOpen(true);
  }, [key]);
  useSearchShortcut(() => (open ? setOpen(false) : show()));
  useEffect(() => {
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, [show]);

  const extraHits = useCallback((term: string) => (term.length < 2 ? recent : []), [recent]);

  return (
    <SearchDialog
      open={open}
      onClose={() => setOpen(false)}
      onSelect={(h) => {
        writeRecent(key, h);
        router.push(h.href);
      }}
      endpoint="/api/buyer/search"
      placeholder="Name, Telefon oder E-Mail"
      label="Kontakt suchen"
      icons={ICONS}
      extraHits={extraHits}
      extraTitle={(term) => (term.length < 2 ? "Zuletzt geöffnet" : null)}
      emptyText={(term, loading) =>
        term.length < 2 ? "Mindestens 2 Zeichen eingeben: Name, Telefonnummer oder E-Mail." : loading ? "Sucht …" : "Kein Kontakt gefunden."
      }
      fullScreenMobile
    />
  );
}

export function openBuyerSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Suchknopf. `field` sieht aus wie ein Eingabefeld (Seitenleiste) und zeigt das Kürzel,
 * `icon` ist das Lupen-Symbol für die Kopfzeile auf dem Handy.
 */
export function BuyerSearchButton({ variant, className }: { variant: "field" | "icon"; className?: string }) {
  const shortcut = useShortcutLabel();
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openBuyerSearch}
        aria-label="Kontakt suchen"
        data-search-trigger=""
        className={cn("flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--foreground)] transition hover:bg-[color:var(--surface-sunken)]", className)}
      >
        <Search className="h-5 w-5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openBuyerSearch}
      aria-keyshortcuts="Control+K Meta+K"
      data-search-trigger=""
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 text-left text-sm text-[color:var(--muted)] transition hover:border-[color:var(--border-strong)]",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate whitespace-nowrap">Kontakt suchen</span>
      <kbd className="shrink-0 whitespace-nowrap rounded border border-[color:var(--border)] bg-white px-1 font-sans text-[13px] font-medium leading-5">{shortcut}</kbd>
    </button>
  );
}
