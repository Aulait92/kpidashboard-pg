import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { FreePeriodNotices } from "@/components/free-period-notices";
import { TodayInbox } from "@/components/today-inbox";
import { FirstDay } from "@/components/first-day";
import { IntroVideoCard } from "@/components/intro-video";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { HeuteRechtsSchliessen } from "@/components/heute-rechts";
import { cookies } from "next/headers";
import { isNewUi } from "@/lib/new-ui";
import { EmpfehlungHeuteHint } from "@/components/empfehlung/server";
import { getBuyerContext } from "@/lib/buyer-context";
import { loadInbox } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { ReferralNudgeCard } from "@/components/kollegen";
import { loadReferralNudge } from "@/lib/kollegen";
import { ErstinfoHeuteHint } from "@/components/erstinformation-hint";
import { listVorbereitungen } from "@/lib/termin-vorbereitung-server";
import { ladeAutomatischeNachrichten, morgenBerlin } from "@/lib/nachrichtenplan-server";
import { leadScope } from "@/lib/team";
import { ladeCrossSellVerkauf } from "@/lib/cross-sell-verkauf-server";
import { istCrossSellAufgabe } from "@/lib/cross-sell-verkauf";
import { PolicenFreischaltungKarte } from "@/components/policen-freischaltung-karte";

// Startseite des Kundenbereichs für alle Kunden: „Heute" – eine
// Aufgabenliste (Termine, Ergebnisse, Chats, Rückrufe), die man leer
// arbeitet (mit WhatsApp zusätzlich Chats). Die Zahlen haben einen eigenen Reiter.
export const dynamic = "force-dynamic";
export const metadata = { title: "Heute | performancegrowth" };

type SearchParams = Promise<{ range?: string; from?: string; to?: string; lead?: string; anrufen?: string }>;

export default async function BuyerHomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [whatsapp, leadCount, newUi, introSeen] = await Promise.all([
    hasWhatsAppInbox(ctx.customerId),
    prisma.lead.count({ where: { customerId: ctx.customerId } }),
    isNewUi(ctx.customerId),
    ctx.userId && !ctx.preview ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { introVideoSeenAt: true } }).then((u) => !!u?.introVideoSeenAt) : true,
  ]);
  // Einführungsvideo (nur neue Oberfläche): bis angesehen oder weggeklickt
  const introCard = newUi && !introSeen ? <IntroVideoCard /> : null;
  // Erstinformation fehlt (§ 15 VersVermV): Warnung oben auf „Heute“
  const erstinfoHint = <ErstinfoHeuteHint customerId={ctx.customerId} owner={ctx.teamRole !== "advisor"} />;
  if (leadCount === 0) {
    // Erster Tag: noch kein Lead → erklären, wie es losgeht (statt leerer Zahlen/„Alles erledigt“).
    // Vor dem Go-live steht die Erstinformation schon als Schritt in der Einrichtungs-Karte; die gelbe Warnung
    // mit Feldnamen wäre doppelt (Runde 5, 16.11.2026).
    const ob = await prisma.onboarding.findUnique({ where: { customerId: ctx.customerId }, select: { liveAt: true } });
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader title="Willkommen" subtitle="Schön, dass Sie da sind." />
        {introCard}
        {!ob || ob.liveAt ? erstinfoHint : null}
        <FirstDay customerId={ctx.customerId} owner={ctx.teamRole !== "advisor"} whatsapp={whatsapp} />
      </main>
    );
  }
  const morgen = morgenBerlin(new Date());
  const [data, customer, me, nudge, vorb, automatisch] = await Promise.all([
    loadInbox(ctx),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } }),
    ctx.teamRole === "advisor" && ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
    // „Kollegen empfehlen“ nach positiven Momenten (nur Inhaber, nicht in der Vorschau)
    ctx.teamRole === "owner" && !ctx.preview ? loadReferralNudge(ctx.customerId).catch(() => null) : null,
    listVorbereitungen(ctx).catch(() => []),
    // „Morgen: 3 automatische Nachrichten“ (Paket P6)
    ladeAutomatischeNachrichten(leadScope(ctx), morgen.von, morgen.bis).catch(() => null),
  ]);
  // Wiedervorlage „Weiteres Produkt anbieten?“ fällig: kleiner Zusatz-Knopf zum Bestandskunden-Modul (lib/cross-sell-verkauf.ts),
  // nur mit Modul für alle und solange es nicht gebucht ist
  const weiteresProdukt = data.followUps.some((f) => istCrossSellAufgabe(f.note))
    ? await ladeCrossSellVerkauf(ctx, { nurNichtGebucht: true }).catch(() => null)
    : null;
  // Termine, die noch vorzubereiten sind (Angebot rechnen): Link direkt in der Terminzeile statt eigener Karte
  const zuVorbereiten = vorb.map((v) => v.id);
  // Push „Jetzt anrufen?“ (lib/anruf-ausloeser.ts): Anruf-Blatt für diesen Kontakt öffnen
  const anrufenRaw = (await searchParams).anrufen;
  const anrufen = anrufenRaw && /^[\w-]{1,64}$/.test(anrufenRaw) ? anrufenRaw : null;
  // Hinweise, die nicht dringend sind, stehen unter den Aufgaben (UX, Ole 15.11.2026)
  const hinweise = (
    <div className="mt-6 space-y-4">
      {/* Freischaltung Kranken/BU/Leben (lib/policen/freischaltung.ts), nur Inhaber, bis zugestimmt oder 3-mal „Später“ */}
      <PolicenFreischaltungKarte ctx={ctx} ort="karte" />
      {nudge ? <ReferralNudgeCard nudgeKey={nudge.key} title={nudge.title} text={nudge.text} /> : null}
      <FreePeriodNotices customerId={ctx.customerId} readOnly={ctx.preview} />
      <EmpfehlungHeuteHint ctx={ctx} />
    </div>
  );
  const first = (me?.displayName ?? (customer?.name ?? "").replace(/^Allianz\s+/i, "")).split(" ")[0];
  const hour = Number(
    // en-GB: „04“; de-DE liefert „04 Uhr“, Number() wäre NaN und die Seite grüßte immer mit „Guten Abend“
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  const greet = hour < 5 ? "Hallo" : hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const today = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  if (newUi) {
    // Neue Oberfläche: Desktop (ab xl) links die Aufgaben, rechts der gewählte
    // Kontakt. Handy/Tablet: Liste → Kontakt (Zurück „Heute“).
    const { lead } = await searchParams;
    const selected = lead && /^[\w-]{1,64}$/.test(lead) ? lead : null;
    // Desktop ohne Auswahl: rechts gleich die erste Aufgabe statt einer leeren Fläche (UX, Ole 15.11.2026)
    const ersteAufgabe =
      data.appointments.find((a) => a.leadId)?.leadId ??
      data.outcomes[0]?.leadId ??
      data.callbacks.find((c) => c.urgent)?.leadId ??
      data.followUps[0]?.leadId ??
      data.callbacks[0]?.leadId ??
      data.noNextStep.leads[0]?.leadId ??
      null;
    // Rechte Seite zu (X bzw. Esc, components/heute-rechts.tsx): ohne Auswahl volle Breite für die Liste
    const rechtsZu = (await cookies()).get("pg-heute-rechts")?.value === "zu";
    const rechts = selected ?? (rechtsZu ? null : ersteAufgabe);
    const breit = !rechts;
    return (
      <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className={breit ? "mx-auto max-w-3xl" : "xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start xl:gap-6"}>
          <section className={selected ? "hidden xl:block" : undefined}>
            <PageHeader title={`${greet}${first ? `, ${first}` : ""}`} subtitle={today} />
            {erstinfoHint}
            <TodayInbox data={data} newUi leadHref="/buyer?lead={id}" selectedLeadId={rechts} zuVorbereiten={zuVorbereiten} anrufen={anrufen} automatisch={automatisch} weiteresProdukt={weiteresProdukt} />
            {hinweise}
          </section>
          {breit ? null : (
          <section
            className={`${selected ? "" : "hidden "}relative xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:rounded-[var(--radius-lg)] xl:border xl:border-[color:var(--border)] xl:bg-white xl:p-5 xl:block`}
            aria-label="Kontakt"
          >
            {rechts ? (
              <>
                <HeuteRechtsSchliessen ausgewaehlt={!!selected} />
                <Link
                  href="/buyer"
                  scroll={false}
                  className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-[color:var(--brand)] hover:underline xl:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Heute
                </Link>
                {/* Platz für das X (oben rechts), sonst liegt es über „Verloren“ */}
                <div className="xl:pr-9">
                  <LeadDetailBody leadId={rechts} team={ctx} newUi />
                </div>
              </>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] px-6 text-center text-[color:var(--muted)]">
                <MousePointerClick className="mb-3 h-8 w-8" />
                <p className="text-base">Wählen Sie links eine Aufgabe.</p>
                <p className="mt-1 text-sm">Die Details zum Kontakt erscheinen hier.</p>
              </div>
            )}
          </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={`${greet}${first ? `, ${first}` : ""}`} subtitle={today} />
      {erstinfoHint}
      <TodayInbox data={data} zuVorbereiten={zuVorbereiten} anrufen={anrufen} automatisch={automatisch} weiteresProdukt={weiteresProdukt} />
      {hinweise}
    </main>
  );
}
