"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, CornerDownLeft, Plus, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Bausteine der Schnellsuche (Admin „Suchen Strg K“ und Kundenbereich „Kontakt suchen“):
// Tastenkürzel, Overlay mit Live-Treffern vom Server, Pfeiltasten/Enter/Esc.

export type SearchHit = {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Warum gefunden, z. B. „+49 152 58142143 · in E-Mail-Signatur vom 12.11.“ (Telefonsuche) */
  match?: string;
  /** Zusatzknopf unter dem Treffer, z. B. „Als weitere Nummer übernehmen“: POST (JSON) an url, Antwort { text } */
  action?: { label: string; url: string; body: Record<string, string> };
};

const noop = () => () => {};
/** true auf Mac/iPhone/iPad (⌘K statt Strg K). Auf dem Server false. */
export function useIsMac(): boolean {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/** Kürzel als Text: „⌘K“ bzw. „Strg K“. */
export function useShortcutLabel(): string {
  return useIsMac() ? "⌘K" : "Strg K";
}

/**
 * Strg+K / Cmd+K ruft `onToggle`. Mit `whenVisible` nur, wenn dieses Element sichtbar ist
 * (mehrere Suchknöpfe für Handy und Rechner, aber nur einer soll reagieren).
 */
export function useSearchShortcut(onToggle: () => void, whenVisible?: React.RefObject<HTMLElement | null>) {
  const cb = useRef(onToggle);
  useEffect(() => {
    cb.current = onToggle;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "k") return;
      if (whenVisible && !whenVisible.current?.offsetParent) return;
      e.preventDefault();
      cb.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [whenVisible]);
}

export function SearchDialog({
  open,
  onClose,
  onSelect,
  endpoint,
  placeholder,
  icons,
  extraHits,
  extraTitle,
  emptyText,
  label = "Suche",
  fullScreenMobile = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Treffer gewählt (Navigation übernimmt der Aufrufer). */
  onSelect: (hit: SearchHit) => void;
  /** Server-Suche, bekommt `?q=` angehängt und liefert `{ hits }`. */
  endpoint: string;
  placeholder: string;
  icons: Record<string, LucideIcon>;
  /** Zusätzliche Treffer ohne Server (Seiten, zuletzt geöffnet), hinter den Server-Treffern. */
  extraHits?: (term: string) => SearchHit[];
  /** Überschrift über den Zusatztreffern (z. B. „Zuletzt geöffnet“), null = keine. */
  extraTitle?: (term: string) => string | null;
  /** Text, wenn nichts in der Liste steht. */
  emptyText?: (term: string, loading: boolean) => string;
  label?: string;
  /** Handy: Vollbild statt schwebendem Fenster. */
  fullScreenMobile?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  // Ergebnis der Zusatzknöpfe je Treffer („Als weitere Nummer übernommen“)
  const [actionDone, setActionDone] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const term = q.trim();

  // Beim Öffnen: Fokus ins Feld, Seite dahinter nicht scrollen.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Server-Suche mit kurzer Verzögerung beim Tippen.
  useEffect(() => {
    if (!open || term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const sep = endpoint.includes("?") ? "&" : "?";
        const res = await fetch(`${endpoint}${sep}q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { hits?: SearchHit[] };
        setHits(json.hits ?? []);
        setSel(0);
      } catch {
        /* abgebrochen oder offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open, endpoint]);

  const extras = useMemo(() => extraHits?.(term) ?? [], [extraHits, term]);
  const server = term.length >= 2 ? hits : [];
  const results = [...server, ...extras];
  const extraHeading = extras.length ? (extraTitle?.(term) ?? null) : null;

  // Markierten Treffer im sichtbaren Bereich halten (Pfeiltasten).
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  async function runAction(h: SearchHit) {
    if (!h.action) return;
    const key = `${h.kind}-${h.id}`;
    setActionDone((d) => ({ ...d, [key]: "Wird übernommen …" }));
    try {
      const res = await fetch(h.action.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(h.action.body) });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      setActionDone((d) => ({ ...d, [key]: json.text ?? json.error ?? (res.ok ? "Erledigt" : "Hat nicht geklappt") }));
    } catch {
      setActionDone((d) => ({ ...d, [key]: "Hat nicht geklappt, bitte erneut versuchen" }));
    }
  }

  function close() {
    setActionDone({});
    setQ("");
    setHits([]);
    setSel(0);
    setLoading(false);
    onClose();
  }
  function go(h: SearchHit | undefined) {
    if (!h) return;
    close();
    onSelect(h);
  }

  if (!open || typeof document === "undefined") return null;
  const optionId = (i: number) => `${listId}-o${i}`;

  // Per Portal an <body>: Kopfzeilen mit backdrop-blur binden „fixed“ sonst an sich.
  return createPortal(
    <div
      className={cn("fixed inset-0 z-50 flex items-start justify-center", fullScreenMobile ? "md:px-4 md:pt-[12vh]" : "px-4 pt-[12vh]")}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-search-dialog=""
    >
      <div className="ui-backdrop absolute inset-0 bg-slate-900/30" onClick={close} />
      <div
        className={cn(
          "ui-sheet relative flex w-full flex-col overflow-hidden bg-white shadow-[var(--shadow-lg)]",
          fullScreenMobile
            ? "h-dvh pt-[env(safe-area-inset-top)] md:h-auto md:max-w-xl md:rounded-[var(--radius-lg)] md:pt-0"
            : "max-w-xl rounded-[var(--radius-lg)]",
        )}
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--border)] px-4">
          <Search className="h-5 w-5 shrink-0 text-[color:var(--muted)]" />
          <input
            ref={input}
            value={q}
            type="search"
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[sel] ? optionId(sel) : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
              if (e.target.value.trim().length < 2) {
                setHits([]);
                setLoading(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[sel]);
              }
            }}
            placeholder={placeholder}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {loading ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--brand)]" aria-hidden /> : null}
          <kbd className={cn("rounded border border-[color:var(--border)] px-1.5 font-sans text-[13px] text-[color:var(--muted)]", fullScreenMobile && "hidden md:inline")}>Esc</kbd>
          {fullScreenMobile ? (
            <button type="button" onClick={close} className="-mr-2 flex h-11 w-11 items-center justify-center text-[color:var(--muted)] md:hidden" aria-label="Suche schließen">
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Treffer"
          className={cn("overflow-y-auto py-2", fullScreenMobile ? "min-h-0 flex-1 md:max-h-[50vh] md:flex-none" : "max-h-[50vh]")}
        >
          {results.map((h, i) => {
            const Icon = icons[h.kind] ?? Search;
            return (
              <li key={`${h.kind}-${h.id}`} role="presentation">
                {i === server.length && extraHeading ? (
                  <div className="px-4 pb-1 pt-2 text-[13px] font-semibold text-[color:var(--muted)]">{extraHeading}</div>
                ) : null}
                <button
                  type="button"
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === sel}
                  data-index={i}
                  tabIndex={-1}
                  onMouseMove={() => setSel(i)}
                  onClick={() => go(h)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100",
                    i === sel ? "bg-[color:var(--brand-soft)]" : "",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{h.title}</span>
                    <span className="block truncate text-[13px] text-[color:var(--muted)]">{h.subtitle}</span>
                    {h.match ? <span className="block text-[13px] text-[color:var(--foreground)]">{h.match}</span> : null}
                  </span>
                  {i === sel ? <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-[color:var(--muted)] md:block" /> : null}
                </button>
                {h.action ? (
                  <div className="pb-2 pl-[60px] pr-4">
                    {actionDone[`${h.kind}-${h.id}`] ? (
                      <span className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-[color:var(--muted)]" role="status">
                        <Check className="h-4 w-4" />
                        {actionDone[`${h.kind}-${h.id}`]}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runAction(h)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[13px] font-medium transition hover:border-[color:var(--border-strong)]"
                      >
                        <Plus className="h-4 w-4" />
                        {h.action.label}
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-[15px] text-[color:var(--muted)]">
              {emptyText ? emptyText(term, loading) : loading ? "Sucht …" : "Nichts gefunden."}
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
