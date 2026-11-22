import { connection } from "next/server";
import { RefreshCw } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ausgabenOhneBeleg, BELEGE_AB } from "@/lib/belege/server";
import { gmiKonfiguriert } from "@/lib/belege/gmi";
import { belegeJetztAbgleichenAction } from "./actions";

export const metadata = { title: "Belege | performancegrowth Admin" };

// Geld › Kosten › Belege (Ole, 22.11.2026: Buchhaltung lückenlos, möglichst ohne Handarbeit). Eine Aufgabe: sehen, für
// welche Ausgaben noch kein Beleg da ist, je Anbieter nach Betrag. Die Abhilfe liegt in GetMyInvoices (Portal verbinden),
// hier gibt es deshalb nichts zuzuordnen. Belege kommen nachts automatisch (lib/belege/server.ts); „Jetzt abgleichen“
// nur nach einer Änderung in GetMyInvoices.

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const datum = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

export default async function Page({ searchParams }: { searchParams: Promise<{ fehler?: string; ok?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const konfiguriert = gmiKonfiguriert();
  const o = await ausgabenOhneBeleg();
  const gesamt = o.anzahl + o.mitBeleg;
  const quote = gesamt ? Math.round((o.mitBeleg / gesamt) * 100) : 100;
  const ab = new Date(`${BELEGE_AB}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" });

  return (
    <Seite
      titel="Belege"
      untertitel={`Ausgaben seit ${ab} mit und ohne Beleg aus GetMyInvoices.`}
      zurueck={{ href: "/admin/neu/zahlen/kosten", label: "Kosten" }}
      aktionen={
        konfiguriert ? (
          <form action={belegeJetztAbgleichenAction}>
            <Button type="submit" variant="secondary" size="md" icon={RefreshCw}>
              Jetzt abgleichen
            </Button>
          </form>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}
        {sp.ok ? <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>Abgeglichen: {sp.ok} neue Zuordnungen.</p> : null}
        {!konfiguriert ? (
          <p className={`${hinweis} border-amber-200 bg-amber-50 text-amber-900`}>GetMyInvoices ist noch nicht verbunden: In Railway fehlt GETMYINVOICES_API_KEY.</p>
        ) : null}

        <Card className="px-5 py-4">
          <p className="text-3xl font-semibold tabular-nums">{quote} %</p>
          <p className="text-sm text-[color:var(--muted)]">
            {o.mitBeleg} von {gesamt} Ausgaben haben einen Beleg
            {o.anzahl ? `, ${o.anzahl} fehlen (${eur(o.summe)})` : ""}.
          </p>
        </Card>

        {o.anbieter.length ? (
          <Card>
            <CardHeader title="Ohne Beleg" count={o.anbieter.length} hint="Fehlt ein Anbieter immer: Portal in GetMyInvoices verbinden" />
            <ul className="divide-y divide-[color:var(--border)]">
              {o.anbieter.map((a) => (
                <li key={a.anbieter} className="flex min-h-12 items-center gap-3 px-5 py-2 text-[15px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.anbieter}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {a.anzahl} {a.anzahl === 1 ? "Zahlung" : "Zahlungen"} · zuletzt {datum(a.letzter)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{eur(a.summe)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="px-5 py-4 text-sm">Alle Ausgaben haben einen Beleg.</Card>
        )}

        {o.belegeOhneZahlung ? (
          <p className="px-1 text-sm text-[color:var(--muted)]">
            {o.belegeOhneZahlung} {o.belegeOhneZahlung === 1 ? "Beleg passt" : "Belege passen"} zu keiner Zahlung auf Konto oder Karte (z. B. privat bezahlt oder noch nicht abgebucht).
          </p>
        ) : null}
      </div>
    </Seite>
  );
}
