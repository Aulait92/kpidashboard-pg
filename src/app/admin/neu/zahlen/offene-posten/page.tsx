import { connection } from "next/server";
import { CheckCircle2, Landmark } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { OffenePostenListe } from "@/components/admin/offene-posten";
import { ladeOffenePosten } from "@/lib/mahnwesen-server";
import { STUFEN } from "@/lib/mahnwesen";
import { requireAuth } from "@/lib/vertrieb/auth";
import { vorschlagAction } from "./actions";

export const metadata = { title: "Offene Posten | performancegrowth Admin" };

// Zahlen → Offene Posten (Mahnwesen, Ole 17.11.2026): offene Rechnungen mit Mahnstufe und nächstem Schritt.
// Hauptaufgabe: mögliche Zahlungseingänge auf dem Geschäftskonto bestätigen (einzige Aktion). Stopp je Kunde in der
// Kundenakte unter Abrechnung. Ablauf und vorbereitete Schalter eingeklappt.
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (iso: string) => iso.split("-").reverse().join(".");

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const d = await ladeOffenePosten();
  const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

  return (
    <Seite titel="Zahlen" reiter="zahlen">
      <div className="space-y-4">
        {sp.ok ? <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>{sp.ok}</p> : null}
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}
        {!d.aktiv ? (
          <p className={`${hinweis} border-amber-200 bg-amber-50 text-amber-900`} data-mahnwesen-aus>
            Mahnwesen ist hier noch nicht freigeschaltet (MAHNWESEN=on, zuerst nur Staging). Es wird nichts verschickt.
          </p>
        ) : null}

        {d.vorschlaege.length ? (
          <Card tone="attention">
            <CardHeader title="Zahlungseingang prüfen" icon={Landmark} actions={<Badge tone="warning">{d.vorschlaege.length}</Badge>} />
            <ul className="divide-y divide-[color:var(--border)]" data-funktion="offene-posten--zahlungseingang-bestaetigen-oder-verwerfen">
              {d.vorschlaege.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="font-semibold">
                      {eur(v.eingang)} am {fmt(v.datum)} von {v.von ?? "unbekannt"}
                    </div>
                    <div className="truncate text-xs text-[color:var(--muted)]">{v.zweck ?? "ohne Verwendungszweck"}</div>
                    <div className="text-xs">
                      Passt zu {v.kunde}, Rechnung {v.nummer} ({eur(v.betrag)}): {v.grund}
                    </div>
                  </div>
                  <form action={vorschlagAction} className="flex gap-2">
                    <input type="hidden" name="id" value={v.id} />
                    <button name="entscheidung" value="ja" className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white sm:h-9">
                      Bestätigen
                    </button>
                    <button name="entscheidung" value="nein" className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold sm:h-9">
                      Passt nicht
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Offene Rechnungen" count={d.posten.length || undefined} actions={d.posten.length ? <span className="text-sm font-semibold tabular-nums">{eur(d.summe)}</span> : undefined} />
          <div data-funktion="offene-posten--offene-rechnungen-mit-mahnstufe">
            {d.posten.length ? (
              <OffenePostenListe posten={d.posten} />
            ) : (
              <EmptyState icon={CheckCircle2} title="Keine offenen Rechnungen" text="Überweisungen mit Zahlungsziel und fehlgeschlagene Abbuchungen erscheinen hier mit ihrer Mahnstufe." />
            )}
          </div>
        </Card>

        {d.bezahlt.length ? (
          <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Bezahlt in den letzten 30 Tagen ({d.bezahlt.length})</summary>
            <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)] text-sm">
              {d.bezahlt.map((b, i) => (
                <li key={i} className="flex flex-wrap gap-x-4 px-5 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {b.kunde} · {b.nummer}
                  </span>
                  <span className="tabular-nums">{eur(b.betrag)}</span>
                  <span className="text-[color:var(--muted)]">
                    {fmt(b.datum)} {b.via === "bank" ? "(Geschäftskonto)" : b.via === "manuell" ? "(bestätigt)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]" data-funktion="offene-posten--ablauf-und-vorbereitete-schalter">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">So wird gemahnt</summary>
          <div className="space-y-3 border-t border-[color:var(--border)] px-5 py-4 text-sm">
            <ul className="space-y-1">
              {STUFEN.map((s) => (
                <li key={s.nr}>
                  <b>{s.label}</b>: {s.tage < 0 ? `${-s.tage} Tage vor Fälligkeit, nur Überweisung` : s.tage === 0 ? "am Fälligkeitstag, E-Mail und WhatsApp" : `${s.tage} Tage nach Fälligkeit`}
                  {s.key === "mahnung1" || s.key === "mahnung2" ? ", mit Rechnung als PDF" : s.key === "anruf" ? ", Aufgabe auf Heute" : ""}
                </li>
              ))}
            </ul>
            <p className="text-[color:var(--muted)]">Versand 9 bis 19 Uhr, mindestens 3 Tage Abstand. Stopp bei Zahlungseingang oder per Schalter in der Kundenakte.</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[color:var(--muted)]">
                <input type="checkbox" disabled checked={d.settings.verzugspauschale} readOnly className="h-4 w-4" /> Verzugspauschale (vorbereitet, noch ohne Wirkung)
              </label>
              <label className="flex items-center gap-2 text-[color:var(--muted)]">
                <input type="checkbox" disabled checked={d.settings.leadsPause} readOnly className="h-4 w-4" /> Leads pausieren bei Verzug (vorbereitet, aus)
              </label>
            </div>
          </div>
        </details>
      </div>
    </Seite>
  );
}
