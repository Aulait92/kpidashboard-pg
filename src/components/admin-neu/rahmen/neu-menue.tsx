"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { TaskForm } from "@/components/vertrieb/task-form";
import { NEU_EINTRAEGE, type NeuEintrag } from "@/lib/admin-neu/navigation";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import { cn } from "@/lib/utils";

// „+ Neu“ oben rechts: jeder Eintrag öffnet den bestehenden Ablauf (Aufgabe, Termin im Fenster)
// oder die bestehende Seite. Einträge stehen in NEU_EINTRAEGE (src/lib/admin-neu/navigation.ts).
// „Termin buchen“ öffnet das Fenster der Kontaktakte (Vertrieb), siehe waehlen().

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Neu anlegen"
        className={cn(
          "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[color:var(--brand)] font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--brand-dark)]",
          variante === "breit" ? "px-4 text-sm" : "w-10",
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        {variante === "breit" ? "Neu" : null}
      </button>

      {/* Per Portal an <body>: die Kopfzeile hat backdrop-blur und würde „fixed“ sonst an sich binden */}
      {open
        ? createPortal(
            <Sheet
              open={open}
              onClose={schliessen}
              title={
                dialog === "aufgabe"
                  ? "Neue Aufgabe"
                  : dialog === "termin"
                    ? "Neuer Termin"
                    : "Neu anlegen"
              }
            >
              {dialog ? (
                <div
                  className="p-5"
                  // Formular schickt die bestehende Server Action (createTask); Fenster danach zu, Meldung unten.
                  onSubmit={(ev) => {
                    const form = ev.target as HTMLFormElement;
                    if (!form.checkValidity()) return;
                    setTimeout(() => {
                      schliessen();
                      toast.show({
                        message:
                          dialog === "termin"
                            ? "Termin eingetragen"
                            : "Aufgabe angelegt",
                      });
                    }, 0);
                  }}
                >
                  <TaskForm
                    compact
                    defaultType={dialog === "termin" ? "TERMIN" : "NACHFASSEN"}
                  />
                </div>
              ) : (
                <ul
                  className="divide-y divide-[color:var(--border)]"
                  data-neu-menue=""
                >
                  {NEU_EINTRAEGE.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => waehlen(e)}
                        data-neu={e.id}
                        className="flex min-h-12 w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-[color:var(--surface-sunken)]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium">
                            {e.label}
                          </span>
                          {e.hinweis ? (
                            <span className="block text-xs text-[color:var(--muted)]">
                              {e.hinweis}
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Sheet>,
            document.body,
          )
        : null}
    </>
  );
}
