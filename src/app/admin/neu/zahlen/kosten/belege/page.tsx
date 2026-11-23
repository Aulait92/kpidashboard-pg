import { connection } from "next/server";
import { Download, ExternalLink, RefreshCw, Send } from "lucide-react";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { prisma } from "@/lib/prisma";
import { monatName, paketBelege, STEUERBUERO_EMAIL, ustVorschau, vormonat } from "@/lib/belege/monatspaket";
import { Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ausgabenOhneBeleg, BELEGE_AB } from "@/lib/belege/server";
import { belegAdresse } from "@/lib/belege/eingang";
import { belegKiKonfiguriert } from "@/lib/belege/auslesen";
import { belegeJetztAbgleichenAction, monatspaketSendenAction } from "./actions";
import { BelegeUpload } from "@/components/admin-neu/zahlen/belege-upload";

export const metadata = { title: "Belege | performancegrowth Admin" };

// Geld › Kosten › Belege (Ole, 22.11.2026: Buchhaltung lückenlos, möglichst ohne Handarbeit, eigene Ablage statt
// GetMyInvoices). Eine Aufgabe: fehlende Belege sehen und nachreichen. Hauptaktion „Belege hochladen“ (PDF, Bild, ZIP);
// laufend kommen Belege über die Beleg-Adresse (Weiterleitungsregel im Postfach). Zuordnung automatisch.

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const datum = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

export default async function Page({ searchParams }: { searchParams: Promise<{ fehler?: string; ok?: string; hochgeladen?: string; doppelt?: string; fehlerhaft?: string; gesendet?: string; imHintergrund?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const konfiguriert = belegKiKonfiguriert();
  const adresse = belegAdresse();
  const o = await ausgabenOhneBeleg();
  const gesamt = o.anzahl + o.mitBeleg;
  const quote = gesamt ? Math.round((o.mitBeleg / gesamt) * 100) : 100;
  const ab = new Date(`${BELEGE_AB}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" });
  // Monatspaket für den Vormonat
  const monat = vormonat();
  const [paket, paketListe] = await Promise.all([prisma.monatsPaket.findUnique({ where: { monat } }), paketBelege(monat)]);
  const vorschau = ustVorschau(paketListe);
  const offenFuerPaket = !paket?.gesendetAm && paketListe.length > 0;
  // Meta: Werbekonten mit eigener Zahlung, Link zur Zahlungsaktivität (ZIP-Download)
  const metaKonten = await import("@/lib/meta-ads").then((m) => m.werbekontenMitZahlung()).then((k) => k.filter((x) => x.eigeneZahlung)).catch(() => []);

  return (
    <Seite
      titel="Belege"
      untertitel={`Ausgaben seit ${ab} mit und ohne Beleg aus GetMyInvoices.`}
      zurueck={{ href: "/admin/neu/zahlen/kosten", label: "Kosten" }}
      aktionen={
        <form action={belegeJetztAbgleichenAction}>
          <Button type="submit" variant="ghost" size="md" icon={RefreshCw} aria-label="Neu abgleichen">
            <span className="hidden sm:inline">Neu abgleichen</span>
          </Button>
        </form>
      }
    >
      <div className="space-y-4">
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}
        {sp.hochgeladen != null ? (
          <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>
            {sp.hochgeladen} {sp.hochgeladen === "1" ? "Beleg" : "Belege"} abgelegt{Number(sp.doppelt) ? `, ${sp.doppelt} schon vorhanden` : ""}
            {Number(sp.fehlerhaft) ? `, ${sp.fehlerhaft} keine lesbare Datei` : ""}
            {sp.imHintergrund ? ". Sie werden jetzt ausgelesen und den Zahlungen zugeordnet, das dauert einige Minuten." : `, ${sp.ok ?? 0} Zahlungen zugeordnet.`}
          </p>
        ) : sp.ok ? (
          <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>Abgeglichen: {sp.ok} neue Zuordnungen.</p>
        ) : null}
        {!konfiguriert ? (
          <p className={`${hinweis} border-amber-200 bg-amber-50 text-amber-900`}>Auslesen aus: In Railway fehlt OPENAI_API_KEY. Belege werden trotzdem abgelegt.</p>
        ) : null}

        {sp.gesendet ? <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>Monatspaket {monatName(sp.gesendet)} an das Steuerbüro gesendet.</p> : null}

        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-semibold">Monatspaket {monatName(monat)}</p>
              <p className="text-sm text-[color:var(--muted)]">
                {paketListe.length} Belege · USt-Zahllast vorläufig {eur(vorschau.zahllast)}
                {paket?.gesendetAm ? ` · gesendet am ${paket.gesendetAm.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}
              </p>
            </div>
            <ButtonLink href={`/api/admin/belege/monatspaket/${monat}`} variant="ghost" size="md" icon={Download}>
              ZIP
            </ButtonLink>
            {offenFuerPaket ? (
              <form action={monatspaketSendenAction}>
                <input type="hidden" name="monat" value={monat} />
                <Button type="submit" variant="primary" size="md" icon={Send}>
                  An Steuerbüro senden
                </Button>
              </form>
            ) : null}
          </div>
          {offenFuerPaket ? <p className="mt-2 text-xs text-[color:var(--muted)]">Geht an {STEUERBUERO_EMAIL()}, Antworten an Sie.</p> : null}
        </Card>

        <Card className="px-5 py-4">
          <BelegeUpload primaer={!offenFuerPaket} />
          <p className="mt-3 text-xs text-[color:var(--muted)]">
            PDF, Fotos oder ZIP. Oder per Mail an <span className="select-all font-medium text-[color:var(--foreground)]">{adresse}</span>
          </p>
        </Card>

        <Card className="px-5 py-4">
          <p className="text-3xl font-semibold tabular-nums">{quote} %</p>
          <p className="text-sm text-[color:var(--muted)]">
            {o.mitBeleg} von {gesamt} Ausgaben haben einen Beleg
            {o.anzahl ? `, ${o.anzahl} fehlen (${eur(o.summe)})` : ""}.
          </p>
        </Card>

        {metaKonten.length ? (
          <Aufklapp titel="Meta-Belege holen" hinweis={`${metaKonten.length} Werbekonten`}>
            <Card>
              <ul className="divide-y divide-[color:var(--border)]">
                {metaKonten.map((k) => (
                  <li key={k.id}>
                    <a
                      href={`https://business.facebook.com/billing_hub/payment_activity?asset_id=${k.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-12 items-center gap-3 px-5 text-[15px] hover:bg-[color:var(--surface-sunken)]"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{k.name}</span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--muted)]">Je Konto Zeitraum wählen, alle markieren, herunterladen, die ZIPs oben hochladen.</p>
            </Card>
          </Aufklapp>
        ) : null}

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
