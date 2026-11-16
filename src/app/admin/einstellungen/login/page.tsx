import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, ArrowUp, MousePointerClick, Plus } from "lucide-react";
import { requireAuth } from "@/lib/vertrieb/auth";
import { listLoginCards } from "@/lib/login-karten-server";
import { cn } from "@/lib/utils";
import { moveLoginCardAction, toggleLoginCardAction } from "./actions";
import { DeleteCardButton, LoginCardForm, LoginCardsPreview } from "./form";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Login-Seite | performancegrowth Admin" };

const BASE = "/admin/einstellungen/login";

// Infokarten neben dem Login: mehrere Karten, an/aus, Reihenfolge; die Login-Seite
// zeigt bei jedem Aufruf die nächste aktive Karte. ?karte=<id> bzw. ?karte=neu bearbeitet.
export default async function LoginSeiteEinstellungenPage({ searchParams }: { searchParams: Promise<{ karte?: string; gespeichert?: string }> }) {
  await connection();
  await requireAuth();
  const { karte, gespeichert } = await searchParams;
  const cards = await listLoginCards();
  const editing = karte === "neu" ? "neu" : (cards.find((c) => c.id === karte) ?? null);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        {editing ? (
          <AdminBack href={BASE}>Alle Karten</AdminBack>
        ) : (
          <AdminBack href="/admin/einstellungen">Einstellungen</AdminBack>
        )}
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{editing === "neu" ? "Neue Karte" : editing ? "Karte bearbeiten" : "Login-Seite"}</h1>
          <a href="/login" target="_blank" rel="noopener" className="text-sm font-medium text-[color:var(--brand)] hover:underline">Login-Seite öffnen ↗</a>
        </div>
        {editing ? null : (
          <p className="text-sm text-[color:var(--muted)]">
            Die Karte neben dem Login sehen alle Kunden und Berater beim Anmelden. Aktive Karten wechseln sich ab: bei jedem Aufruf der Login-Seite kommt die nächste. Links in den Kundenbereich führen nach der Anmeldung direkt zur Seite.
          </p>
        )}
      </div>

      {editing ? (
        <>
          <LoginCardForm key={editing === "neu" ? "neu" : editing.id} card={editing === "neu" ? null : editing} justCreated={gespeichert === "1"} />
          {editing !== "neu" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
              <span>
                {editing.clicks.toLocaleString("de-DE")} {editing.clicks === 1 ? "Klick" : "Klicks"} auf den Link
              </span>
              <DeleteCardButton id={editing.id} title={editing.title} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <section aria-label="Karten" className="space-y-3">
            <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
              {cards.map((c, i) => (
                <li key={c.id} className={cn("flex items-center gap-3 px-3 py-3 sm:px-4", !c.enabled && "bg-[color:var(--surface-sunken)]")}>
                  <div className="flex shrink-0 flex-col">
                    <form action={moveLoginCardAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button type="submit" disabled={i === 0} aria-label={`„${c.title}“ nach oben`} className="rounded p-1 text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)] disabled:opacity-30">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </form>
                    <form action={moveLoginCardAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button type="submit" disabled={i === cards.length - 1} aria-label={`„${c.title}“ nach unten`} className="rounded p-1 text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)] disabled:opacity-30">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                  {c.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Vorschaubild aus /public bzw. der DB
                    <img src={c.imageSrc} alt="" className="hidden h-12 w-20 shrink-0 rounded-md border border-[color:var(--border)] object-cover sm:block" />
                  ) : (
                    <span className="hidden h-12 w-20 shrink-0 rounded-md border border-dashed border-[color:var(--border-strong)] sm:block" />
                  )}
                  <Link href={`${BASE}?karte=${encodeURIComponent(c.id)}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block text-xs text-[color:var(--muted)]">{c.badge ?? "ohne Etikett"}</span>
                    <span className={cn("block truncate font-medium", !c.enabled && "text-[color:var(--muted)]")}>{c.title}</span>
                    <span className="flex items-center gap-1 text-xs text-[color:var(--muted)]">
                      <MousePointerClick className="h-3 w-3" aria-hidden="true" />
                      {c.linkUrl ? `${c.clicks.toLocaleString("de-DE")} ${c.clicks === 1 ? "Klick" : "Klicks"}` : "ohne Link"}
                    </span>
                  </Link>
                  <form action={toggleLoginCardAction} className="shrink-0">
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={c.enabled}
                      aria-label={`„${c.title}“ ${c.enabled ? "ausschalten" : "einschalten"}`}
                      className={cn("relative h-6 w-11 rounded-full transition", c.enabled ? "bg-[color:var(--brand)]" : "bg-slate-300")}
                    >
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", c.enabled ? "left-[22px]" : "left-0.5")} />
                    </button>
                  </form>
                </li>
              ))}
              {cards.length === 0 ? <li className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">Noch keine Karte angelegt.</li> : null}
            </ul>
            <Link href={`${BASE}?karte=neu`} className="btn-primary inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Neue Karte
            </Link>
          </section>
          <aside className="space-y-2 self-start lg:sticky lg:top-20">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Vorschau der aktiven Karten</p>
            <LoginCardsPreview
              cards={cards
                .filter((c) => c.enabled)
                .map((c) => ({ id: c.id, badge: c.badge, title: c.title, text: c.text, linkText: c.linkText, linkUrl: c.linkUrl, imageSrc: c.imageSrc }))}
            />
          </aside>
        </div>
      )}
    </main>
  );
}
