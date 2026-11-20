import { connection } from "next/server";
import { Building2, CreditCard } from "lucide-react";
import { BankKarte, BankRegeln, ladeBank } from "@/components/admin/bank-bausteine";
import { ladeKosten } from "@/components/admin/kosten-liste";
import { Card } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { KpiSettingsForm } from "@/app/admin/einstellungen/kosten/forms";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Konten & Regeln | performancegrowth Admin" };

// Geld › Kosten › Konten & Regeln (Umbau 19.11.2026): die selten gebrauchten Einstellungen der Kosten an einem Ort
// (früher Einstellungen → Bank & Karten und die Annahmen aus Einstellungen → Laufende Kosten). Konten offen, Regeln und
// Annahmen zugeklappt. Rückkehr von der Bank-Anmeldung landet wieder hier (lib/admin-neu/ruecksprung.ts, Referer).

const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

export default async function Page({ searchParams }: { searchParams: Promise<{ fehler?: string; verbunden?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const [{ rules, configured, commerz, amex, csvCount, soonOf }, { settings }] = await Promise.all([ladeBank(), ladeKosten()]);

  return (
    <Seite titel="Konten & Regeln" zurueck={{ href: "/admin/neu/zahlen/kosten", label: "Kosten" }}>
      <div className="space-y-4">
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}
        {sp.verbunden ? <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>Verbunden. Die Umsätze der letzten 90 Tage wurden abgerufen.</p> : null}
        {!configured ? (
          <p className={`${hinweis} border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]`}>Die Bankverbindung ist auf diesem Server noch nicht eingerichtet (Zugang zu Enable Banking fehlt in Railway).</p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-funktion="actions-connectbankaction--bank-verbinden actions-syncbankaction--umsaetze-jetzt-abrufen actions-disconnectbankaction--bank-trennen">
          <BankKarte title="Commerzbank (Geschäftskonto)" icon={Building2} aspsp="Commerzbank" c={commerz} csv={csvCount("csv:commerzbank")} configured={configured} soon={soonOf(commerz)} />
          <BankKarte title="American Express" icon={CreditCard} aspsp="American Express" c={amex} csv={csvCount("csv:amex")} configured={configured} soon={soonOf(amex)} />
        </div>
        <Aufklapp titel="Regeln" hinweis={rules.length ? `${rules.length}` : "neu beim Zuordnen mit „immer so“"} funktion="actions-saveruleaction--regel-speichern actions-deleteruleaction--regel-loeschen">
          <Card className="p-4 sm:p-5">
            <BankRegeln rules={rules} />
          </Card>
        </Aufklapp>
        <Aufklapp titel="Annahmen für Kennzahlen" hinweis="Gründerzeit, Kampagnen, Pilotphase" funktion="actions-savekpisettingsaction--annahmen-fuer-kennzahlen-stunden-stundensatz">
          <Card className="p-4 sm:p-5">
            <KpiSettingsForm hours={settings.founderHoursPerWeek} rate={settings.founderHourlyRate} campaigns={settings.acquisitionCampaigns.join(", ")} pplPilotEnd={settings.pplPilotEnd} />
          </Card>
        </Aufklapp>
      </div>
    </Seite>
  );
}
