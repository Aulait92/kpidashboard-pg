import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { HilfeAnfragenKarte, KiHilfeKarte, NutzungJeKunde } from "@/components/admin/nutzung-bausteine";
import { StornoQuoteUebersicht } from "@/components/admin/storno-quote";
import { WhatsAppZustellung } from "@/components/admin/whatsapp-zustellung";
import { VerlustgruendeCard } from "@/components/admin/verlustgruende-card";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { Kennzahlen, type Kennzahl } from "@/components/admin-neu/ui/kennzahlen";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { ModuleCandidatesCard } from "@/app/admin/nutzung/module-card";
import { NpsCard } from "@/app/admin/nutzung/nps-card";
import { loadHelpQuestions } from "@/lib/hilfe-report";
import { loadSupportRequests } from "@/lib/support-server";
import { computeUsageReport } from "@/lib/usage-report";
import { bdNutzung } from "@/lib/beratungsdoku-server";
import { BeratungsdokuNutzung, bdNutzungHinweis } from "@/components/admin/beratungsdoku-nutzung";
import type { HeuteItem } from "@/lib/admin-heute";
import { npsOf } from "@/lib/nps";
import { nowMs } from "@/lib/now";
import { prisma } from "@/lib/prisma";
import { allStornoStats } from "@/lib/storno-quote";
import { keinWhatsAppQuote } from "@/lib/whatsapp/kein-whatsapp";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Qualität | performancegrowth Admin" };

const PFAD = "/admin/neu/zahlen/qualitaet";
const TAG = 24 * 60 * 60 * 1000;
const pct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;

// Ansichten hinter einem Klick (Drill-down). Startseite: höchstens 4 Kennzahlen, „Braucht Aufmerksamkeit“ und eine
// kurze Liste der Auswertungen; die Tabellen (früher alle untereinander, am Handy eng) erst nach dem Antippen.
const ANSICHTEN = {
  storno: "Stornoquote der Verträge",
  whatsapp: "WhatsApp-Zustellung",
  verlust: "Verlustgründe",
  nps: "Weiterempfehlung",
  nutzung: "Nutzung der App",
  modul: "Zusatzmodul: Kandidaten",
} as const;
type Ansicht = keyof typeof ANSICHTEN;

// Betreuen › Qualität (früher drei Seiten: Zahlen → Stornoquote, Zahlen → WhatsApp-Zustellung, Nutzung; dann eine
// Sammelseite mit 6 Tabellen und 3 Klappen). Gleiche Bausteine und Daten wie die alten Seiten (components/admin/
// storno-quote, whatsapp-zustellung, nutzung-bausteine, app/admin/nutzung/nps-card, module-card).
export default async function Page({ searchParams }: { searchParams: Promise<{ ansicht?: string; tage?: string; ankuendigung?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  // Rückmeldung der Modul-Ankündigung führt in die Ansicht zurück
  const ansicht: Ansicht | null = sp.ankuendigung ? "modul" : sp.ansicht && sp.ansicht in ANSICHTEN ? (sp.ansicht as Ansicht) : null;

  if (ansicht) {
    return (
      <Seite titel="Betreuen" reiter="betreuen" breit>
        <Link href={PFAD} className="-ml-1 mb-2 inline-flex min-h-10 items-center gap-1 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
          <ChevronLeft className="h-4 w-4" />
          Qualität
        </Link>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">{ANSICHTEN[ansicht]}</h2>
        <div className="[&>section:first-child]:mt-0 [&>div:first-child]:mt-0">
          {ansicht === "storno" ? (
            <div data-funktion="storno-quote-stornoquoteuebersicht--stornoquote-der-vertraege-je-kunde-und-sparte" className="[&>section]:mt-0">
              <StornoQuoteUebersicht leerHinweis />
            </div>
          ) : ansicht === "whatsapp" ? (
            <div data-funktion="whatsapp-zustellung--leads-ohne-whatsapp-je-kunde-30-tage-gesamt whatsapp-zustellung--zustellfehler-der-letzten-14-tage-je-kunde-und" className="[&>div]:mt-0">
              <WhatsAppZustellung />
            </div>
          ) : ansicht === "verlust" ? (
            <VerlustgruendeCard />
          ) : ansicht === "nps" ? (
            <div data-funktion="nps-card--weiterempfehlung-nps">
              <NpsCard />
            </div>
          ) : ansicht === "nutzung" ? (
            <Nutzung tage={sp.tage} />
          ) : (
            <div data-funktion="module-card--zusatzmodul-empfehlungen-kandidaten-fuers">
              <ModuleCandidatesCard message={sp.ankuendigung ?? null} zurueck={PFAD} />
            </div>
          )}
        </div>
      </Seite>
    );
  }

  const seit365 = new Date(nowMs() - 365 * TAG);
  const [storno, wa30, alarme, antworten, nutzung] = await Promise.all([
    allStornoStats(),
    keinWhatsAppQuote({ from: new Date(nowMs() - 30 * TAG) }),
    prisma.whatsAppErrorAlert.findMany({
      where: { createdAt: { gte: new Date(nowMs() - 14 * TAG) } },
      select: { customerId: true, count: true, customer: { select: { name: true } } },
    }),
    prisma.customerFeedback.findMany({
      where: { kind: { not: "day7" }, answeredAt: { gte: seit365 }, score: { not: null }, customer: { plan: { not: "internal" }, isTest: false } },
      select: { score: true },
    }),
    computeUsageReport(14),
  ]);
  const nps = npsOf(antworten.map((a) => a.score!));
  const fehler = alarme.reduce((a, x) => a + x.count, 0);

  // Kennzahlen ohne Daten fallen weg (keine Kachel „noch keine Daten“); ihre Ansicht steht dann in der Liste darunter
  const kacheln: (Kennzahl & { ansicht: Ansicht })[] = [];
  if (storno.overall.quote != null) kacheln.push({ ansicht: "storno", label: "Stornoquote", wert: pct(storno.overall.quote), hinweis: `${storno.overall.contracts} Verträge`, href: `${PFAD}?ansicht=storno` });
  if (wa30.share != null) kacheln.push({ ansicht: "whatsapp", label: "Ohne WhatsApp", wert: pct(wa30.share), hinweis: `${wa30.noWhatsApp} von ${wa30.attempted} Leads, 30 Tage`, href: `${PFAD}?ansicht=whatsapp` });
  kacheln.push({ ansicht: "whatsapp", label: "Zustellfehler", wert: fehler.toLocaleString("de-DE"), hinweis: "letzte 14 Tage", ton: fehler ? "schlecht" : undefined, href: `${PFAD}?ansicht=whatsapp` });
  if (nps) kacheln.push({ ansicht: "nps", label: "Weiterempfehlung", wert: nps.nps > 0 ? `+${nps.nps}` : String(nps.nps), hinweis: `NPS aus ${nps.total} Antworten`, ton: nps.nps >= 30 ? "gut" : nps.nps < 0 ? "schlecht" : undefined, href: `${PFAD}?ansicht=nps` });
  const alsKachel = new Set(kacheln.map((k) => k.ansicht));

  // Braucht Aufmerksamkeit: Kunden mit Zustellfehlern (14 Tage) und Kunden mit liegen gebliebenen Aufgaben in der App
  const jeKunde = new Map<string, { name: string; count: number }>();
  for (const a of alarme) {
    if (!a.customerId) continue;
    const x = jeKunde.get(a.customerId) ?? { name: a.customer?.name ?? "Kunde", count: 0 };
    x.count += a.count;
    jeKunde.set(a.customerId, x);
  }
  const punkte: HeuteItem[] = [
    ...[...jeKunde.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, x]): HeuteItem => ({
        key: `zustellung-${id}`,
        area: "Kunden",
        tone: "bad",
        icon: "alert",
        title: `${x.name.replace(/^Allianz\s+/i, "")}: ${x.count} Zustellfehler`,
        detail: "WhatsApp-Nachrichten kamen nicht an, letzte 14 Tage",
        action: { label: "Prüfen", href: `/admin/neu/kunden/${id}/whatsapp` },
      })),
    ...nutzung.customers
      .map((c) => ({ c, offen: c.stalled.outcomesOpen + c.stalled.followUpsOverdue + c.stalled.attentionOver24h }))
      .filter((x) => x.offen > 0)
      .sort((a, b) => b.offen - a.offen)
      .map(({ c, offen }): HeuteItem => ({
        key: `liegt-${c.customerId}`,
        area: "Kunden",
        tone: "warn",
        icon: "task",
        title: `${c.customerName.replace(/^Allianz\s+/i, "")}: ${offen} Aufgaben liegen`,
        detail: "Ergebnisse, Nachfassen oder Chats seit über 24 Stunden offen",
        action: { label: "Ansehen", href: `/admin/neu/kunden/${c.customerId}` },
      })),
  ];

  const liste: { ansicht: Ansicht; text: string }[] = [
    ...(alsKachel.has("storno") ? [] : [{ ansicht: "storno" as const, text: "noch zu wenige Verträge" }]),
    ...(alsKachel.has("nps") ? [] : [{ ansicht: "nps" as const, text: "noch keine Antworten" }]),
    { ansicht: "verlust", text: "Warum Leads verloren gehen, je Kunde" },
    { ansicht: "nutzung", text: "Hilfe-Anfragen, KI-Hilfe, Nutzung je Kunde" },
    { ansicht: "modul", text: "Kunden fürs Gespräch über Zusatzmodule" },
  ];

  return (
    <Seite titel="Betreuen" reiter="betreuen">
      <Aufmerksamkeit punkte={punkte} restAufklappen leer="Keine Zustellfehler und keine liegen gebliebenen Aufgaben bei Kunden." />
      <Kennzahlen werte={kacheln} />
      <Card>
        <ul className="divide-y divide-[color:var(--border)]">
          {liste.map((z) => (
            <li key={z.ansicht}>
              <Link href={`${PFAD}?ansicht=${z.ansicht}`} className="flex min-h-14 items-center gap-3 px-5 py-3 transition hover:bg-[color:var(--surface-sunken)]">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{ANSICHTEN[z.ansicht]}</span>
                  <span className="block truncate text-xs text-[color:var(--muted)]">{z.text}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Seite>
  );
}

/** Ansicht „Nutzung der App“ mit Zeitraum (?tage=7|14|30, Standard 14). */
async function Nutzung({ tage }: { tage?: string }) {
  const days = [7, 14, 30].includes(Number(tage)) ? Number(tage) : 14;
  const [report, help, support, bd] = await Promise.all([computeUsageReport(days), loadHelpQuestions(days), loadSupportRequests(days), bdNutzung(days)]);
  const stockend = report.customers.filter((c) => c.stalled.outcomesOpen + c.stalled.followUpsOverdue + c.stalled.attentionOver24h > 0).length;
  return (
    <section aria-label="Nutzung der App" className="space-y-4">
      <div className="flex gap-1 text-xs font-semibold" aria-label="Zeitraum">
        {[7, 14, 30].map((d) => (
          <Link
            key={d}
            href={`${PFAD}?ansicht=nutzung&tage=${d}`}
            scroll={false}
            aria-current={d === days ? "page" : undefined}
            className={cn("inline-flex min-h-10 items-center rounded-full px-3", d === days ? "bg-[color:var(--foreground)] text-white" : "border border-[color:var(--border)] bg-white")}
          >
            {d} Tage
          </Link>
        ))}
      </div>
      <div data-funktion="page--hilfe-anfragen-an-das-team">
        <HilfeAnfragenKarte support={support} />
      </div>
      <div data-funktion="page--ki-hilfe-fragen-der-vertreter-mit-bewertung">
        <KiHilfeKarte help={help} />
      </div>
      <Aufklapp
        titel="Nutzung je Kunde"
        hinweis={stockend ? `${stockend} mit liegen gebliebenen Aufgaben` : `${report.customers.length} ${report.customers.length === 1 ? "Kunde" : "Kunden"}`}
        funktion="page--nutzung-je-kunde-liegt-herum-genutzte-aktionen"
      >
        <NutzungJeKunde report={report} />
      </Aufklapp>
      {/* Paket B (Ole, 18.11.2026): Beratungsdokumentation, eingeschaltet und Dokumente je Termin */}
      <Aufklapp titel="Beratungsdokumentation" hinweis={bdNutzungHinweis(bd)} id="beratungsdoku">
        <BeratungsdokuNutzung n={bd} tage={days} />
      </Aufklapp>
    </section>
  );
}
