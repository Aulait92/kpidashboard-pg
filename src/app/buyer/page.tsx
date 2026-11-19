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
import { VollmachtVersandHinweis } from "@/components/vollmacht-versand-hinweis";
import { grussName } from "@/lib/vermittler-nennung";
import { vermittlerDuAus } from "@/lib/vermittler-ansprache";

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
    // Vor dem Start ist die Einrichtung die eine Aufgabe: ihre Karte zuerst, das Einführungsvideo darunter
    // (UX-Runde 19.11.2026, am Handy stand das Video vor dem ersten Schritt).
    const vorStart = !!ob && !ob.liveAt;
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader title="Willkommen" subtitle="Schön, dass Sie da sind." />
        {vorStart ? null : introCard}
        {vorStart ? null : erstinfoHint}
        <FirstDay customerId={ctx.customerId} owner={ctx.teamRole !== "advisor"} whatsapp={whatsapp} />
        {vorStart && introCard ? <div className="mt-5">{introCard}</div> : null}
      </main>
    );
  }
  const morgen = morgenBerlin(new Date());
  const [data, customer, me, nudge, vorb, automatisch] = await Promise.all([
    loadInbox(ctx),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, vermittlerDu: true, erstinformation: { select: { name: true, anrede: true } }, onboarding: { select: { offerId: true } } } }),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
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
      {/* Makler: „Maklervollmacht: Wer schickt sie?“ bis entschieden (Customer.vollmachtVersand) */}
      <VollmachtVersandHinweis ctx={ctx} />
      {nudge ? <ReferralNudgeCard nudgeKey={nudge.key} title={nudge.title} text={nudge.text} /> : null}
      <FreePeriodNotices customerId={ctx.customerId} readOnly={ctx.preview} />
      <EmpfehlungHeuteHint ctx={ctx} />
    </div>
  );
  // Begrüßung (Ole 18.11.2026): „Herr Kannapinn“ mit Anrede aus den Anbieterangaben, Teammitglieder mit eigenem Namen,
  // Du (Customer.vermittlerDu, sonst angenommenes Angebot) mit Vorname, Firmenname im Namensfeld: nur „Guten Abend“ (lib/vermittler-nennung.ts grussName)
  const erstPerson = customer?.erstinformation ?? null;
  const gleichePerson = (a?: string | null, b?: string | null) => !!a && !!b && a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
  const eigenerName = ctx.teamRole === "advisor" ? me?.displayName : (erstPerson?.name ?? me?.displayName);
  // Du/Sie gegenüber dem Vermittler (nicht die Ansprache der Leads): Einstellung am Kunden, sonst angenommenes Angebot
  // (Offer.mailDu), sonst Sie (lib/vermittler-ansprache.ts). Das Angebot wird nur ohne Einstellung nachgeladen.
  const vermittlerDu = vermittlerDuAus({
    kunde: customer?.vermittlerDu,
    angebot:
      customer?.vermittlerDu == null && customer?.onboarding?.offerId
        ? ((await prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { mailDu: true } }).catch(() => null))?.mailDu ?? null)
        : null,
  });
  const first = grussName({
    name: eigenerName,
    anrede: gleichePerson(eigenerName, erstPerson?.name) ? (erstPerson?.anrede === "Herr" || erstPerson?.anrede === "Frau" ? erstPerson.anrede : null) : null,
    du: vermittlerDu,
  });
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
    // Desktop ohne Auswahl: rechts gleich die erste Aufgabe statt einer leeren Fläche (UX, Ole 15.11.2026).
    // Neue Leads zuerst (UX-Runde 19.11.2026: Zeit bis Erstkontakt), sie stehen auch links ganz oben.
    const ersteAufgabe =
      data.callbacks.find((c) => c.urgent)?.leadId ??
      data.appointments.find((a) => a.leadId)?.leadId ??
      data.outcomes[0]?.leadId ??
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
