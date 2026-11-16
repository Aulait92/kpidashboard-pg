import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, ArrowUp, ExternalLink, MousePointerClick, Plus } from "lucide-react";
import { moveLoginCardAction, toggleLoginCardAction } from "@/app/admin/einstellungen/login/actions";
import { DeleteCardButton, LoginCardForm, LoginCardsPreview } from "@/app/admin/einstellungen/login/form";
import { EinstellungSeite, SchalterKnopf } from "@/components/admin-neu/einstellungen/rahmen";
import { Seite } from "@/components/admin-neu/ui/seite";
import { ButtonLink, Card } from "@/components/ui";
import { listLoginCards } from "@/lib/login-karten-server";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Login-Seite | performancegrowth Admin" };

const BASIS = "/admin/neu/einstellungen/login";

// Login-Seite (Demo „e-login“, heute /admin/einstellungen/login): Infokarten an/aus, Reihenfolge, Vorschau.
// ?karte=<id> bzw. ?karte=neu bearbeitet eine Karte (Formular und Actions wie heute, Rücksprung über `basis`).
export default async function Page({ searchParams }: { searchParams: Promise<{ karte?: string; gespeichert?: string }> }) {
  await connection();
  await requireAuth();
  const { karte, gespeichert } = await searchParams;
  const cards = await listLoginCards();
  const editing = karte === "neu" ? "neu" : (cards.find((c) => c.id === karte) ?? null);

  if (editing) {
    return (
      <Seite titel={editing === "neu" ? "Neue Karte" : "Karte bearbeiten"} zurueck={{ href: BASIS, label: "Login-Seite" }}>
        <div className="space-y-4" data-funktion="actions-savelogincardaction--karte-bearbeiten-badge-titel-text-link-bild">
          <LoginCardForm key={editing === "neu" ? "neu" : editing.id} card={editing === "neu" ? null : editing} justCreated={gespeichert === "1"} basis={BASIS} />
          {editing !== "neu" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
              <span>
                {editing.clicks.toLocaleString("de-DE")} {editing.clicks === 1 ? "Klick" : "Klicks"} auf den Link
              </span>
              <span data-funktion="actions-deletelogincardaction--karte-loeschen">
                <DeleteCardButton id={editing.id} title={editing.title} basis={BASIS} />
              </span>
            </div>
          ) : null}
        </div>
      </Seite>
    );
  }

  return (
    <EinstellungSeite
      pfad={BASIS}
      breit
      aktionen={
        <ButtonLink href={`${BASIS}?karte=neu`} variant="primary" size="md" icon={Plus}>
          Neue Karte
        </ButtonLink>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <ul className="divide-y divide-[color:var(--border)]" data-funktion="actions-savelogincardaction--infokarten-liste-neue-karte actions-togglelogincardaction--karte-an-aus actions-movelogincardaction--reihenfolge-der-karten-aendern">
            {cards.map((c, i) => (
              <li key={c.id} className={cn("flex items-center gap-3 px-3 py-3 sm:px-4", !c.enabled && "bg-[color:var(--surface-sunken)]")}>
                <div className="flex shrink-0 flex-col">
                  {(["up", "down"] as const).map((dir) => (
                    <form key={dir} action={moveLoginCardAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="dir" value={dir} />
                      <button
                        type="submit"
                        disabled={dir === "up" ? i === 0 : i === cards.length - 1}
                        aria-label={`„${c.title}“ nach ${dir === "up" ? "oben" : "unten"}`}
                        className="rounded p-1 text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)] disabled:opacity-30"
                      >
                        {dir === "up" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      </button>
                    </form>
                  ))}
                </div>
                {c.imageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Vorschaubild aus /public bzw. der DB
                  <img src={c.imageSrc} alt="" className="hidden h-12 w-20 shrink-0 rounded-md border border-[color:var(--border)] object-cover sm:block" />
                ) : null}
                <Link href={`${BASIS}?karte=${encodeURIComponent(c.id)}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block text-xs text-[color:var(--muted)]">{c.badge ?? "ohne Etikett"}</span>
                  <span className={cn("block truncate text-sm font-medium", !c.enabled && "text-[color:var(--muted)]")}>{c.title}</span>
                  <span className="flex items-center gap-1 text-xs text-[color:var(--muted)]">
                    <MousePointerClick className="h-3 w-3" aria-hidden="true" />
                    {c.linkUrl ? `${c.clicks.toLocaleString("de-DE")} ${c.clicks === 1 ? "Klick" : "Klicks"}` : "ohne Link"}
                  </span>
                </Link>
                <form action={toggleLoginCardAction} className="shrink-0">
                  <input type="hidden" name="id" value={c.id} />
                  <SchalterKnopf an={c.enabled} label={`„${c.title}“`} />
                </form>
              </li>
            ))}
            {cards.length === 0 ? <li className="px-5 py-8 text-center text-sm text-[color:var(--muted)]">Noch keine Karte. Aktive Karten wechseln sich bei jedem Aufruf ab.</li> : null}
          </ul>
        </Card>
        <aside className="space-y-2 self-start lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Vorschau</p>
            <a href="/login" target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
              Login-Seite <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <LoginCardsPreview
            cards={cards.filter((c) => c.enabled).map((c) => ({ id: c.id, badge: c.badge, title: c.title, text: c.text, linkText: c.linkText, linkUrl: c.linkUrl, imageSrc: c.imageSrc }))}
          />
        </aside>
      </div>
    </EinstellungSeite>
  );
}
