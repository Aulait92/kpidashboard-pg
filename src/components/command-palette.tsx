"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Building2, Search, User, UserRound } from "lucide-react";
import { SearchDialog, useSearchShortcut, useShortcutLabel, type SearchHit } from "@/components/search-dialog";

type Hit = SearchHit & { kind: "kunde" | "kontakt" | "lead" | "seite" };

// Seiten und Schnellaktionen, die ohne Server gefunden werden.
const PAGES: Hit[] = [
  ["Heute", "/admin/heute", "Start"],
  ["Vertrieb: Übersicht", "/admin/vertrieb", "Vertrieb"],
  ["Neuer Kontakt", "/admin/vertrieb/kontakte/neu", "Vertrieb · anlegen"],
  ["Kontakte", "/admin/vertrieb/kontakte", "Vertrieb"],
  ["Akquise-Pipeline", "/admin/vertrieb/pipeline", "Vertrieb"],
  ["Aufgaben", "/admin/vertrieb/aufgaben", "Vertrieb"],
  ["Follow-ups", "/admin/vertrieb/follow-ups", "Vertrieb"],
  ["Angebote", "/admin/vertrieb/angebote", "Vertrieb"],
  ["Kunden", "/admin/kunden", "Kunden"],
  ["Kunden-Pipeline", "/admin/kunden/pipeline", "Kunden"],
  ["Leads", "/admin/leads", "Leads"],
  ["WhatsApp-Chats", "/admin/whatsapp", "Leads"],
  ["Pay-per-Lead", "/admin/ppl", "Leads"],
  ["Marketing", "/admin/marketing", "Marketing"],
  ["Zahlen (Investoren)", "/admin/zahlen", "Zahlen"],
  ["Dashboard Pay-per-Lead", "/", "Zahlen"],
  ["Laufende Kosten", "/admin/einstellungen/kosten", "Einstellungen"],
  ["Nutzung", "/admin/nutzung", "Zahlen"],
  ["Einstellungen", "/admin/einstellungen", "Einstellungen"],
  ["Lead-Eingang", "/admin/lead-eingang", "Einstellungen"],
  ["WhatsApp-Assistent", "/admin/whatsapp/settings", "Einstellungen"],
  ["Kunden-Logins", "/admin/buyers", "Einstellungen"],
  ["Anbindungen", "/admin/vertrieb/import", "Einstellungen"],
  ["Sicherheit (Zwei-Faktor)", "/admin/einstellungen/sicherheit", "Einstellungen"],
  ["Änderungsprotokoll", "/admin/einstellungen/protokoll", "Einstellungen"],
].map(([title, href, subtitle]) => ({ kind: "seite" as const, id: href, title, subtitle, href }));

const ICON = { kunde: Building2, kontakt: User, lead: UserRound, seite: ArrowRight };

const pagesFor = (term: string) => {
  const t = term.toLowerCase();
  return t ? PAGES.filter((p) => p.title.toLowerCase().includes(t)) : PAGES.slice(0, 8);
};

/** Globale Suche im Admin: Cmd+K / Strg+K (Bausteine in search-dialog.tsx). */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const shortcut = useShortcutLabel();
  // Der Knopf steckt in Seitenleiste und Handy-Kopfzeile: nur der sichtbare reagiert auf das Kürzel.
  useSearchShortcut(() => setOpen((o) => !o), button);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm text-[color:var(--muted)] transition hover:border-[color:var(--border-strong)]"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Suchen</span>
        <kbd className="hidden rounded border border-[color:var(--border)] px-1.5 text-[11px] font-medium md:inline">{shortcut}</kbd>
      </button>

      <SearchDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(h) => router.push(h.href)}
        endpoint="/api/admin/search"
        placeholder="Kunde, Kontakt, Lead, Telefonnummer oder Seite"
        icons={ICON}
        extraHits={pagesFor}
      />
    </>
  );
}
