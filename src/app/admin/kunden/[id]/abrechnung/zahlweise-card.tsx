import { Badge, Card, CardHeader } from "@/components/ui";
import { OffenePostenListe } from "@/components/admin/offene-posten";
import { prisma } from "@/lib/prisma";
import { mahnwesenAktiv, UEBERWEISUNG_TAGE_MAX, UEBERWEISUNG_TAGE_MIN } from "@/lib/mahnwesen";
import { ladeOffenePosten } from "@/lib/mahnwesen-server";
import { saveMahnStoppAction, saveUeberweisungAction } from "./zahlweise-actions";

const btn = "h-10 sm:h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold";
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * Zahlweise & Mahnungen (Ole, 17.11.2026): Überweisung erlaubt (aus dem Angebot übernommen, hier änderbar),
 * Zahlungsziel, Stopp der Mahnungen je Kunde und die offenen Posten dieses Kunden mit Mahnstufe.
 */
export async function ZahlweiseCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { allowBankTransfer: true, bankTransferDays: true, zahltPerUeberweisung: true, mahnStopp: true, mahnStoppGrund: true, mahnStoppAt: true },
  });
  if (!c) return null;
  const aktiv = mahnwesenAktiv();
  const { posten } = await ladeOffenePosten(new Date(), { customerId });
  // Ohne Freischaltung nur zeigen, wenn es schon etwas zu sehen gibt
  if (!aktiv && !c.allowBankTransfer && !c.zahltPerUeberweisung && !posten.length) return null;
  const hidden = <input type="hidden" name="customerId" value={customerId} />;

  return (
    <Card>
      <CardHeader
        title="Zahlweise und Mahnungen"
        actions={c.zahltPerUeberweisung ? <Badge tone="info">Zahlt per Überweisung</Badge> : <Badge>Lastschrift oder Karte</Badge>}
      />
      <div className="space-y-4 px-5 pb-5 pt-4 text-sm" data-zahlweise-karte>
        {message ? <p className={failed ? "text-rose-700" : "text-emerald-700"}>{message}</p> : null}
        <form action={saveUeberweisungAction} className="flex flex-wrap items-center gap-x-3 gap-y-2" data-funktion="zahlweise-actions--ueberweisung-erlauben-zahlungsziel">
          {hidden}
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="allow" defaultChecked={c.allowBankTransfer} className="h-4 w-4" disabled={!aktiv} />
            Überweisung erlauben
          </label>
          <label className="flex items-center gap-2 text-[color:var(--muted)]">
            Zahlungsziel
            <input
              name="days"
              inputMode="numeric"
              defaultValue={c.bankTransferDays}
              min={UEBERWEISUNG_TAGE_MIN}
              max={UEBERWEISUNG_TAGE_MAX}
              disabled={!aktiv}
              className="h-9 w-14 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-right tabular-nums text-[color:var(--foreground)]"
            />
            Tage
          </label>
          <button className={btn} disabled={!aktiv}>
            Speichern
          </button>
          <p className="w-full text-xs text-[color:var(--muted)]">{aktiv ? "Nur auf Anfrage des Kunden." : "Noch nicht freigeschaltet (zuerst nur Staging)."}</p>
        </form>
        <form action={saveMahnStoppAction} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--border)] pt-4" data-funktion="zahlweise-actions--mahnungen-je-kunde-stoppen">
          {hidden}
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="stop" defaultChecked={c.mahnStopp} className="h-4 w-4" />
            Mahnungen stoppen
          </label>
          <input
            name="grund"
            defaultValue={c.mahnStoppGrund ?? ""}
            placeholder="Grund, z. B. Ratenzahlung vereinbart"
            className="h-9 min-w-0 flex-1 basis-48 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2"
          />
          <button className={btn}>Speichern</button>
          {c.mahnStopp && c.mahnStoppAt ? <p className="w-full text-xs text-[color:var(--muted)]">Gestoppt seit {fmt(c.mahnStoppAt)}.</p> : null}
        </form>
      </div>
      {posten.length ? (
        <div className="border-t border-[color:var(--border)]">
          <div className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Offene Posten</div>
          <OffenePostenListe posten={posten} mitKunde={false} />
        </div>
      ) : null}
    </Card>
  );
}
