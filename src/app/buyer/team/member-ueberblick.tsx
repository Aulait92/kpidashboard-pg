import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { terminArtKurz } from "@/lib/termin-art";
import { OFFEN_REIHENFOLGE, OFFEN_TITEL, TERMINE_TAGE, type MitgliedUeberblick, type OffenArt } from "@/lib/team-ueberblick";

// Aufgeklappter Teil der Mitgliederzeile (Team-Überblick, Ole 21.11.2026): Termine der nächsten 7 Tage und was offen ist.
// Jeder Eintrag öffnet den Kontakt. Zeiten werden gegen „jetzt“ des Servers gerechnet (gleiche Anzeige beim Laden).

const LISTE_MAX = 5;
const TZ = "Europe/Berlin";

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const uhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

/** „Heute 10:00“, „Morgen 14:30“, „Gestern 9:00“, sonst „Mo., 24.11. 10:00“. */
export function terminZeit(iso: string, nowIso: string): string {
  const d = new Date(iso);
  const now = new Date(nowIso);
  const tag = (off: number) => ymd(new Date(now.getTime() + off * 24 * 60 * 60 * 1000));
  const t = ymd(d);
  const wort = t === tag(0) ? "Heute" : t === tag(1) ? "Morgen" : t === tag(-1) ? "Gestern" : null;
  if (wort) return `${wort} ${uhr(d)}`;
  return `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(d)} ${uhr(d)}`;
}

/** „20 Min.“, „3 Std.“, „2 Tagen“ (für „seit …“). */
export function dauerSeit(iso: string, nowIso: string): string {
  const min = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${Math.max(1, min)} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `${std} Std.`;
  const tage = Math.floor(std / 24);
  return tage === 1 ? "1 Tag" : `${tage} Tagen`;
}

function meta(art: OffenArt, at: string, nowIso: string): string {
  if (art === "ergebnis") {
    const z = terminZeit(at, nowIso);
    // „Termin gestern 12:20“: Tageswort im Satz klein
    return `Termin ${/^(Heute|Morgen|Gestern) /.test(z) ? z.charAt(0).toLowerCase() + z.slice(1) : z}`;
  }
  if (art === "wiedervorlage") return `fällig seit ${dauerSeit(at, nowIso)}`;
  return `seit ${dauerSeit(at, nowIso)}`;
}

function Zeile({ href, links, rechts, warn }: { href: string | null; links: React.ReactNode; rechts: string; warn?: boolean }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate">{links}</span>
      <span className={`shrink-0 text-xs ${warn ? "font-medium text-amber-800" : "text-[color:var(--muted)]"}`}>{rechts}</span>
      {href ? <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" /> : null}
    </>
  );
  const cls = "flex min-h-11 items-center gap-2 px-3 py-2 text-sm";
  return <li>{href ? <Link href={href} className={`${cls} hover:bg-[color:var(--surface-sunken)]`}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>;
}

export function MemberUeberblick({
  u,
  nowIso,
  leadHref,
  meta: kopf,
}: {
  u: MitgliedUeberblick;
  nowIso: string;
  /** Link zum Kontakt (Platzhalter {id}) */
  leadHref: string;
  /** Leads in 30 Tagen und Kalenderstatus (stand vorher in der Zeile) */
  meta: string;
}) {
  const href = (id: string | null) => (id ? leadHref.replace("{id}", id) : null);
  const arten = OFFEN_REIHENFOLGE.filter((a) => u.offen[a].length > 0);
  const block = "overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white";
  return (
    <div className="space-y-4" data-team-ueberblick={u.userId}>
      <p className="text-xs text-[color:var(--muted)]">{kopf}</p>

      <section>
        <h3 className="mb-1.5 text-sm font-semibold">
          Termine <span className="font-normal text-[color:var(--muted)]">nächste {TERMINE_TAGE} Tage</span>
        </h3>
        {u.termine.length ? (
          <ul className={`${block} divide-y divide-[color:var(--border)]`} data-team-termine>
            {u.termine.map((t) => (
              <Zeile key={t.id} href={href(t.leadId)} links={<><span className="font-medium tabular-nums">{terminZeit(t.startsAt, nowIso)}</span> · {t.name}</>} rechts={terminArtKurz(t.mode)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[color:var(--muted)]">Keine Termine gebucht.</p>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-sm font-semibold">Offen</h3>
        {arten.length ? (
          <div className="space-y-3" data-team-offen>
            {arten.map((art) => {
              const liste = u.offen[art];
              const warn = u.warn.includes(art);
              return (
                <div key={art} data-offen-art={art}>
                  <div className={`mb-1 text-xs font-medium ${warn ? "text-amber-800" : "text-[color:var(--muted)]"}`}>
                    {OFFEN_TITEL[art]} · {liste.length}
                  </div>
                  <ul className={`${block} divide-y divide-[color:var(--border)]`}>
                    {liste.slice(0, LISTE_MAX).map((l) => (
                      <Zeile key={l.leadId} href={href(l.leadId)} links={l.name} rechts={meta(art, l.at, nowIso)} warn={warn} />
                    ))}
                  </ul>
                  {liste.length > LISTE_MAX ? <p className="mt-1 text-xs text-[color:var(--muted)]">und {liste.length - LISTE_MAX} weitere</p> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
            <Check className="h-4 w-4" />
            Alles erledigt
          </p>
        )}
      </section>
    </div>
  );
}
