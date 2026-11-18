"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { TaskForm } from "@/components/vertrieb/task-form";
import { BEREICHE, NEU_EINTRAEGE, type NeuEintrag } from "@/lib/admin-neu/navigation";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import { cn } from "@/lib/utils";

// „+ Neu“ oben rechts (Admin v2): nach Rollen geordnet, rechts steht die Rolle. Am Rechner als Menü unter dem Knopf
// (wie in der Demo v2), am Handy im Fenster von unten. Jeder Eintrag öffnet den bestehenden Ablauf (Aufgabe im Fenster)
// oder die bestehende Seite. Einträge stehen in NEU_EINTRAEGE (src/lib/admin-neu/navigation.ts).
// „Termin buchen“ öffnet das Fenster der Kontaktakte (Verkaufen), siehe waehlen().
// Bewusst kein Markenblau: die Hauptaktion einer Seite bleibt der einzige primäre Knopf.

const rolleVon = (e: NeuEintrag) => BEREICHE.find((b) => b.id === e.rolle)?.label ?? "";

/** Neuer Wert je Klick (öffnet das Termin-Fenster auch auf derselben Seite erneut). */
const schluessel = () => String(Date.now());

export function NeuMenue({ variante }: { variante: "breit" | "kopf" }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"aufgabe" | "termin" | null>(null);

  const schliessen = () => {
    setOpen(false);
    setDialog(null);
  };

  function waehlen(e: NeuEintrag) {
    if (e.art === "dialog") {
      setDialog(e.dialog);
      return;
    }
    schliessen();
    if (e.id === "termin") {
      // „Termin buchen“ (Vertrieb): in einer Kontaktakte gleich für diesen Kontakt, sonst erst Kontakt wählen.
      // Neuer Wert bei jedem Klick, damit sich das Fenster auch auf derselben Seite wieder öffnet.
      const akte = /^\/admin\/neu\/vertrieb\/kontakte\/(?!neu$)[^/]+$/.test(pathname ?? "");
      router.push(akte ? `${pathname}?termin=${schluessel()}` : `/admin/neu/vertrieb/termine?buchen=${schluessel()}`);
      return;
    }
    router.push(neuerPfad(e.href) ?? e.href);
  }

  // Menü am Rechner: schließt bei Klick daneben und mit Esc
  const box = useRef<HTMLDivElement>(null);
  const menue = open && !dialog && variante === "breit";
  useEffect(() => {
    if (!menue) return;
    const onDown = (ev: MouseEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menue]);

  const liste = (
    <ul className={cn(variante === "breit" ? "p-1.5" : "divide-y divide-[color:var(--border)]")} data-neu-menue="" role="menu">
      {NEU_EINTRAEGE.map((e) => (
        <li key={e.id} role="none">
          <button
            type="button"
            role="menuitem"
            onClick={() => waehlen(e)}
            data-neu={e.id}
            className={cn(
              "flex w-full items-center gap-3 text-left transition hover:bg-[color:var(--surface-sunken)]",
              variante === "breit" ? "min-h-10 rounded-[10px] px-3 py-2" : "min-h-12 px-5 py-2.5",
            )}
          >
            <span className="min-w-0 flex-1 text-[15px] font-medium">{e.label}</span>
            <span className="shrink-0 text-xs text-[color:var(--muted)]">{rolleVon(e)}</span>
            {variante === "kopf" ? <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" /> : null}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Neu anlegen"
        className={cn(
          "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-strong)] bg-white font-semibold text-[color:var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--surface-sunken)]",
          variante === "breit" ? "px-4 text-sm" : "w-10",
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        {variante === "breit" ? "Neu" : null}
      </button>

      {menue ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-[14px] border border-[color:var(--border)] bg-white shadow-[var(--shadow-lg)]">
          <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">Neu anlegen</div>
          {liste}
        </div>
      ) : null}

      {/* Per Portal an <body>: die Kopfzeile hat backdrop-blur und würde „fixed“ sonst an sich binden */}
      {(open && variante === "kopf") || dialog
        ? createPortal(
            <Sheet open onClose={schliessen} title={dialog === "aufgabe" ? "Neue Aufgabe" : dialog === "termin" ? "Neuer Termin" : "Neu anlegen"}>
              {dialog ? (
                <div
                  className="p-5"
                  // Formular schickt die bestehende Server Action (createTask); Fenster danach zu, Meldung unten.
                  onSubmit={(ev) => {
                    const form = ev.target as HTMLFormElement;
                    if (!form.checkValidity()) return;
                    setTimeout(() => {
                      schliessen();
                      toast.show({ message: dialog === "termin" ? "Termin eingetragen" : "Aufgabe angelegt" });
                    }, 0);
                  }}
                >
                  <TaskForm compact defaultType={dialog === "termin" ? "TERMIN" : "NACHFASSEN"} />
                </div>
              ) : (
                liste
              )}
            </Sheet>,
            document.body,
          )
        : null}
    </div>
  );
}
