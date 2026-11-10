"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, CornerDownLeft, Search, User, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type Hit = { kind: "kunde" | "kontakt" | "lead" | "seite"; id: string; title: string; subtitle: string; href: string };

// Seiten und Schnellaktionen, die ohne Server gefunden werden.
const PAGES: Hit[] = [
  ["Heute", "/admin/vertrieb", "Vertrieb"],
  ["Neuer Kontakt", "/admin/vertrieb/kontakte/neu", "Vertrieb · anlegen"],
  ["Kontakte", "/admin/vertrieb/kontakte", "Vertrieb"],
  ["Akquise-Pipeline", "/admin/vertrieb/pipeline", "Vertrieb"],
  ["Aufgaben", "/admin/vertrieb/aufgaben", "Vertrieb"],
  ["Kunden", "/admin/kunden", "Kunden"],
  ["Kunden-Pipeline", "/admin/kunden/pipeline", "Kunden"],
  ["Leads", "/admin/leads", "Leads"],
  ["WhatsApp-Chats", "/admin/whatsapp", "Leads"],
  ["Dashboard", "/", "Zahlen"],
  ["Nutzung", "/admin/nutzung", "Zahlen"],
  ["Einstellungen", "/admin/einstellungen", "Einstellungen"],
  ["Lead-Eingang", "/admin/lead-eingang", "Einstellungen"],
  ["WhatsApp-Assistent", "/admin/whatsapp/settings", "Einstellungen"],
  ["Kunden-Logins", "/admin/buyers", "Einstellungen"],
  ["Import & Instantly", "/admin/vertrieb/import", "Einstellungen"],
  ["Sicherheit (Zwei-Faktor)", "/admin/einstellungen/sicherheit", "Einstellungen"],
  ["Änderungsprotokoll", "/admin/einstellungen/protokoll", "Einstellungen"],
].map(([title, href, subtitle]) => ({ kind: "seite" as const, id: href, title, subtitle, href }));

const ICON = { kunde: Building2, kontakt: User, lead: UserRound, seite: ArrowRight };

/** Globale Suche im Admin: Cmd+K / Strg+K. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  // Server-Suche mit kurzer Verzögerung beim Tippen.
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const json = (await res.json()) as { hits?: Hit[] };
        setHits(json.hits ?? []);
        setSel(0);
      } catch {
        /* abgebrochen */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = term ? PAGES.filter((p) => p.title.toLowerCase().includes(term)) : PAGES.slice(0, 8);
    return [...(term.length >= 2 ? hits : []), ...pages];
  }, [q, hits]);

  function close() {
    setOpen(false);
    setQ("");
    setHits([]);
    setSel(0);
  }
  function go(h: Hit | undefined) {
    if (!h) return;
    close();
    router.push(h.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm text-[color:var(--muted)] transition hover:border-[color:var(--border-strong)]"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Suchen</span>
        <kbd suppressHydrationWarning className="hidden rounded border border-[color:var(--border)] px-1.5 text-[11px] font-medium md:inline">{isMac ? "⌘K" : "Strg K"}</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
          <div className="ui-backdrop absolute inset-0 bg-slate-900/30" onClick={close} />
          <div className="ui-sheet relative w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-3 border-b border-[color:var(--border)] px-4">
              <Search className="h-5 w-5 shrink-0 text-[color:var(--muted)]" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                  if (e.target.value.trim().length < 2) setHits([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  else if (e.key === "ArrowDown") {
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
                placeholder="Kunde, Kontakt, Lead, Telefonnummer oder Seite"
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
              />
              <kbd className="rounded border border-[color:var(--border)] px-1.5 text-[11px] text-[color:var(--muted)]">Esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto py-2">
              {results.map((h, i) => {
                const Icon = ICON[h.kind];
                return (
                  <li key={`${h.kind}-${h.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setSel(i)}
                      onClick={() => go(h)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100",
                        i === sel ? "bg-[color:var(--brand-soft)]" : "",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        <span className="block truncate text-xs text-[color:var(--muted)]">{h.subtitle}</span>
                      </span>
                      {i === sel ? <CornerDownLeft className="h-4 w-4 shrink-0 text-[color:var(--muted)]" /> : null}
                    </button>
                  </li>
                );
              })}
              {results.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">{loading ? "Sucht …" : "Nichts gefunden."}</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
