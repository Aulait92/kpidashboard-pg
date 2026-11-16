"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Building2, KeyRound, Search, User, UserRound } from "lucide-react";
import { SearchDialog, useSearchShortcut, useShortcutLabel, type SearchHit } from "@/components/search-dialog";
import { SUCH_SEITEN } from "@/lib/admin-neu/navigation";
import { neuerPfad } from "@/lib/admin-neu/umzug";

// Globale Suche im neuen Admin (⌘K / Strg K): Kontakte, Kunden, Leads und Logins vom Server
// (dieselbe Admin-Suche wie in der alten Oberfläche, /api/admin/search), Seiten aus navigation.ts.

const ICON = { kunde: Building2, kontakt: User, lead: UserRound, login: KeyRound, seite: ArrowRight };

const seitenFuer = (term: string): SearchHit[] => {
  const t = term.trim().toLowerCase();
  const liste = t ? SUCH_SEITEN.filter((s) => t.split(/\s+/).every((w) => s.suchtext.includes(w))) : SUCH_SEITEN.slice(0, 8);
  return liste.map((s) => ({ kind: "seite", id: s.href, title: s.titel, subtitle: s.bereich, href: s.href }));
};

export function Suche({ variante }: { variante: "breit" | "kopf" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const kuerzel = useShortcutLabel();
  // Zwei Knöpfe (Rechner, Handy): nur der sichtbare reagiert auf das Kürzel.
  useSearchShortcut(() => setOpen((o) => !o), knopf);

  return (
    <>
      <button
        ref={knopf}
        type="button"
        onClick={() => setOpen(true)}
        data-funktion="command-palette--befehlspalette-mit-seiten-spruengen-35-ziele route-get--suche-nach-kunden-kontakten-leads-api page--login-liste-aller-kunden-suche-nach-e-mail"
        className={
          variante === "breit"
            ? "flex h-10 w-full max-w-[520px] items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 text-left text-sm text-[color:var(--muted)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--border-strong)]"
            : "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 text-left text-sm text-[color:var(--muted)]"
        }
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{variante === "breit" ? "Kontakt, Kunde, Lead, Login oder Seite suchen" : "Suchen"}</span>
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
        placeholder="Kontakt, Kunde, Lead, Login, Telefonnummer oder Seite"
        icons={ICON}
        extraHits={seitenFuer}
        extraTitle={() => "Seiten"}
        fullScreenMobile
        label="Suche"
      />
    </>
  );
}
