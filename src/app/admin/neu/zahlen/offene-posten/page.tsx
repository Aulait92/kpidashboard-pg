import { connection } from "next/server";
import { CheckCircle2 } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { GeldOffenePostenListe } from "@/components/admin-neu/zahlen/offene-posten-liste";
import { ladeOffenePosten } from "@/lib/mahnwesen-server";
import { STUFEN } from "@/lib/mahnwesen";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Offene Posten | performancegrowth Admin" };

// Geld › Offene Posten (Mahnwesen, Ole 17.11.2026; Umbau 19.11.2026): eine Liste offener Rechnungen mit Mahnstufe und
// nächstem Schritt, je Zeile eine Handlung: gefundene Zahlung zuordnen oder die Kundenakte (Abrechnung, Mahnstopp)
// öffnen. Erinnerungen verschickt der Mahnlauf selbst. Bezahlte und der Ablauf eingeklappt.
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (iso: string) => iso.split("-").reverse().join(".");

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const d = await ladeOffenePosten();
  const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

  return (
    <Seite titel="Geld" reiter="geld">
      <div className="space-y-4">
        {sp.ok ? <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>{sp.ok}</p> : null}
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}
        {!d.aktiv ? (
          <p className={`${hinweis} border-amber-200 bg-amber-50 text-amber-900`} data-mahnwesen-aus>
            Mahnwesen ist noch aus: Erinnerungen und Mahnungen werden nicht verschickt.
          </p>
        ) : null}

        <Card>
          <CardHeader
            title="Offene Rechnungen"
            count={d.posten.length || undefined}
            actions={d.vorschlaege.length ? <Badge tone="warning">{d.vorschlaege.length} Zahlung{d.vorschlaege.length === 1 ? "" : "en"} gefunden</Badge> : d.posten.length ? <span className="text-sm font-semibold tabular-nums">{eur(d.summe)}</span> : undefined}
          />
          <div data-funktion="offene-posten--offene-rechnungen-mit-mahnstufe">
            {d.posten.length || d.vorschlaege.length ? (
              <GeldOffenePostenListe d={d} />
            ) : (
              <EmptyState icon={CheckCircle2} title="Alles bezahlt" text="Überweisungen mit Zahlungsziel und fehlgeschlagene Abbuchungen erscheinen hier mit ihrer Mahnstufe." />
            )}
          </div>
        </Card>

        {d.bezahlt.length ? (
          <Aufklapp titel="Bezahlt in den letzten 30 Tagen" hinweis={`${d.bezahlt.length}`}>
            <Card>
            <ul className="divide-y divide-[color:var(--border)] text-sm">
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
            </Card>
          </Aufklapp>
        ) : null}

        <Aufklapp titel="So wird gemahnt" funktion="offene-posten--ablauf-und-vorbereitete-schalter">
          <Card className="space-y-3 px-5 py-4 text-sm">
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
          </Card>
        </Aufklapp>
      </div>
    </Seite>
  );
}
