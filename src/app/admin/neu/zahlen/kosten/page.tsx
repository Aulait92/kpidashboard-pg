import { connection } from "next/server";
import { ArrowRight, Building2, CreditCard, Receipt } from "lucide-react";
import { BankKarte, BankRegeln, ladeBank } from "@/components/admin/bank-bausteine";
import { LaufendeKostenListe, ladeKosten } from "@/components/admin/kosten-liste";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { CostForm, KpiSettingsForm } from "@/app/admin/einstellungen/kosten/forms";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Kosten & Bank | performancegrowth Admin" };

// Zahlen → Kosten & Bank: früher Einstellungen → Laufende Kosten und Einstellungen → Bank & Karten.
// Hauptaufgabe: neue Ausgaben zuordnen (einzige Hauptaktion). Laufende Kosten, Konten und Regeln darunter,
// Annahmen für die Kennzahlen eingeklappt. Gleiche Bausteine und Server Actions wie die alten Seiten
// (components/admin/bank-bausteine.tsx, kosten-liste.tsx, app/admin/einstellungen/{bank,kosten}/forms.tsx).
// Rückkehr von der Bank-Anmeldung landet wieder hier (Cookie aus dem neuen Admin, lib/admin-neu/ruecksprung.ts).
export default async function Page({ searchParams }: { searchParams: Promise<{ fehler?: string; verbunden?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const [{ open, rules, overlap, configured, redirectUrl, commerz, amex, csvCount, soonOf }, { costs, settings }] = await Promise.all([ladeBank(), ladeKosten()]);
  const today = new Date().toISOString().slice(0, 10);
  const monatlich = costs.filter((c) => !c.endsAt || c.endsAt.toISOString().slice(0, 10) >= today).reduce((a, c) => a + Number(c.monthlyAmount), 0);
  const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

  return (
    <Seite titel="Geld" reiter="geld">
      <div className="space-y-4">
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}
        {sp.verbunden ? <p className={`${hinweis} border-emerald-200 bg-emerald-50 text-emerald-800`}>Verbunden. Die Umsätze der letzten 90 Tage wurden abgerufen.</p> : null}
        {overlap.length ? (
          <p className={`${hinweis} border-amber-200 bg-amber-50 text-amber-900`}>
            Möglicherweise doppelt gezählt: {overlap.map((o) => o.name).join(", ")} {overlap.length === 1 ? "steht" : "stehen"} unter „Laufende Kosten“ und kommt jetzt auch über die Bank. Bitte dort ein Enddatum setzen.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card tone={open ? "attention" : "default"}>
            <CardHeader title="Neue Ausgaben zuordnen" actions={open ? <Badge tone="warning">{open}</Badge> : <Badge tone="success">alles zugeordnet</Badge>} />
            <div className="space-y-3 px-5 py-4" data-funktion="actions-assignaction--ausgabe-zuordnen-zweck-inkl-ust-immer-so-bei">
              <p className="text-sm text-[color:var(--muted)]">
                {open ? `${open} ${open === 1 ? "Ausgabe wartet" : "Ausgaben warten"} auf einen Zweck. Zugeordnete Ausgaben fließen netto in Marge und BWA.` : "Neue Ausgaben von Konto und Karte erscheinen hier, sobald sie abgerufen oder hochgeladen sind."}
              </p>
              <div className="flex flex-wrap gap-2">
                {open ? (
                  <ButtonLink href="/admin/neu/zahlen/kosten/zuordnen" variant="primary" size="md" icon={ArrowRight}>
                    Zuordnen
                  </ButtonLink>
                ) : null}
                <span data-funktion="page--zugeordnete-ausgaben-ansehen">
                  <ButtonLink href="/admin/neu/zahlen/kosten/zuordnen?ansicht=alle" size="md" icon={Receipt}>
                    Alle Ausgaben
                  </ButtonLink>
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Laufende Kosten" hint={costs.length ? `${eur(monatlich)} / Monat` : undefined} />
            <div data-funktion="actions-deleterecurringcostaction--laufende-kosten-loeschen">
              <LaufendeKostenListe costs={costs} />
            </div>
            <div className="border-t border-[color:var(--border)] px-4 py-3" data-funktion="actions-saverecurringcostaction--laufende-kosten-anlegen-aendern-zweck-zeitraum">
              <details>
                <summary className="cursor-pointer list-none text-sm font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">+ Kosten</summary>
                <div className="mt-3">
                  <CostForm cost={{ id: "", name: "", amount: "", purpose: "ppl", startsAt: today, endsAt: "" }} />
                </div>
              </details>
            </div>
          </Card>
        </div>

        <section aria-label="Konten" className="space-y-3">
          <h2 className="pt-2 text-lg font-semibold tracking-tight">Konten</h2>
          {!configured ? (
            <p className={`${hinweis} border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]`}>
              Für die direkte Verbindung fehlen noch <code>ENABLE_BANKING_APP_ID</code> und <code>ENABLE_BANKING_PRIVATE_KEY</code> in Railway. Bis dahin funktioniert der CSV-Import. Weiterleitungs-Adresse: <code className="break-all">{redirectUrl}</code>
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-funktion="actions-connectbankaction--bank-verbinden actions-syncbankaction--umsaetze-jetzt-abrufen actions-disconnectbankaction--bank-trennen">
            <BankKarte title="Commerzbank (Geschäftskonto)" icon={Building2} aspsp="Commerzbank" c={commerz} csv={csvCount("csv:commerzbank")} configured={configured} soon={soonOf(commerz)} />
            <BankKarte title="American Express" icon={CreditCard} aspsp="American Express" c={amex} csv={csvCount("csv:amex")} configured={configured} soon={soonOf(amex)} />
          </div>
          <Aufklapp titel="Regeln" hinweis={`${rules.length}`} funktion="actions-saveruleaction--regel-speichern actions-deleteruleaction--regel-loeschen">
            <Card className="p-4 sm:p-5">
              {rules.length ? <p className="mb-2 text-sm text-[color:var(--muted)]">Neue Regeln entstehen beim Zuordnen mit „immer so“.</p> : null}
              <BankRegeln rules={rules} />
            </Card>
          </Aufklapp>
          <Aufklapp titel="Annahmen für Kennzahlen" hinweis="Gründerzeit, Kampagnen, Pilotphase" funktion="actions-savekpisettingsaction--annahmen-fuer-kennzahlen-stunden-stundensatz">
            <Card className="p-4 sm:p-5">
              <KpiSettingsForm hours={settings.founderHoursPerWeek} rate={settings.founderHourlyRate} campaigns={settings.acquisitionCampaigns.join(", ")} pplPilotEnd={settings.pplPilotEnd} />
            </Card>
          </Aufklapp>
        </section>
        {!costs.length && !open && !commerz && !amex ? <EmptyState icon={Receipt} title="Noch keine Kosten" text="Bank verbinden oder eine CSV hochladen." /> : null}
      </div>
    </Seite>
  );
}
