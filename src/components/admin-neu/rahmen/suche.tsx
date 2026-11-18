"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, KeyRound, ListChecks, MessageCircle, Search, User, UserRound } from "lucide-react";
import { SearchDialog, useSearchShortcut, useShortcutLabel, type SearchHit } from "@/components/search-dialog";
import { SUCH_SEITEN } from "@/lib/admin-neu/navigation";
import { normSuche, sucheFunktionen, type SuchFunktion } from "@/lib/admin-neu/funktionen";
import { neuerPfad } from "@/lib/admin-neu/umzug";

// Globale Suche im neuen Admin (⌘K / Strg K): Kontakte, Kunden, Leads und Logins vom Server
// (dieselbe Admin-Suche wie in der alten Oberfläche, /api/admin/search), Seiten aus navigation.ts und seit Admin v2
// (Paket A3) alle Funktionen aus dem Funktionsinventar mit neuem Ort (/api/admin/funktionen, beim ersten Öffnen geladen).

const ICON = { kunde: Building2, kontakt: User, lead: UserRound, login: KeyRound, chat: MessageCircle, seite: ArrowRight, funktion: ListChecks };

const seitenFuer = (term: string, funktionen: SuchFunktion[]): SearchHit[] => {
  const t = normSuche(term.trim());
  const seiten = t ? SUCH_SEITEN.filter((s) => t.split(/\s+/).every((w) => normSuche(s.suchtext).includes(w))).slice(0, 5) : SUCH_SEITEN.slice(0, 8);
  const treffer: SearchHit[] = seiten.map((s) => ({ kind: "seite", id: s.href, title: s.titel, subtitle: s.bereich, href: s.href }));
  if (!t) return treffer;
  for (const f of sucheFunktionen(funktionen, t)) treffer.push({ kind: "funktion", id: f.id, title: f.titel, subtitle: f.ort, href: f.href });
  return treffer;
};

export function Suche({ variante }: { variante: "breit" | "kopf" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [funktionen, setFunktionen] = useState<SuchFunktion[]>([]);
  const geladen = useRef(false);
  const knopf = useRef<HTMLButtonElement>(null);
  // Funktions-Index einmal beim ersten Öffnen holen; ohne Index findet die Suche weiter Seiten und Datensätze
  useEffect(() => {
    if (!open || geladen.current) return;
    geladen.current = true;
    fetch("/api/admin/funktionen")
      .then((r) => (r.ok ? r.json() : { funktionen: [] }))
      .then((d: { funktionen?: Omit<SuchFunktion, "suchtext">[] }) => setFunktionen((d.funktionen ?? []).map((f) => ({ ...f, suchtext: normSuche(`${f.titel} ${f.ort}`) }))))
      .catch(() => (geladen.current = false));
  }, [open]);
  const extra = useCallback((term: string) => seitenFuer(term, funktionen), [funktionen]);
  const kuerzel = useShortcutLabel();
  // Zwei Knöpfe (Rechner, Handy): nur der sichtbare reagiert auf das Kürzel.
  useSearchShortcut(() => setOpen((o) => !o), knopf);

  return (
    <>
      <button
        ref={knopf}
        type="button"
        onClick={() => setOpen(true)}
        data-funktion="command-palette--befehlspalette-mit-seiten-spruengen-35-ziele route-get--suche-nach-kunden-kontakten-leads-api route-get--suche-findet-interne-und-test-kunden-mit-badge page--login-liste-aller-kunden-suche-nach-e-mail"
        className={
          variante === "breit"
            ? "flex h-10 w-full max-w-[520px] items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 text-left text-sm text-[color:var(--muted)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--border-strong)]"
            : "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 text-left text-sm text-[color:var(--muted)]"
        }
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{variante === "breit" ? "Suchen: Kunden, Leads, Seiten, Funktionen" : "Suchen"}</span>
        {variante === "breit" ? (
          <kbd className="rounded border border-[color:var(--border)] px-1.5 text-[11px] font-medium" data-funktion="search-dialog-usesearchshortcut--tastenkuerzel-cmd-strg-k-oeffnet-suche-pfeile">
            {kuerzel}
          </kbd>
        ) : null}
      </button>

      <SearchDialog
        open={open}
        onClose={() => setOpen(false)}
        // Treffer zeigen auf die heutigen Seiten; ist die neue Seite fertig, geht es dorthin.
        onSelect={(h) => router.push(neuerPfad(h.href) ?? h.href)}
        endpoint="/api/admin/search"
        placeholder="Kontakt, Kunde, Lead, Login, Seite oder Funktion"
        icons={ICON}
        extraHits={extra}
        extraTitle={(t) => (t.trim() ? "Seiten und Funktionen" : "Seiten")}
        fullScreenMobile
        label="Suche"
      />
    </>
  );
}
