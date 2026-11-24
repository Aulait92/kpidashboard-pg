import { Suspense } from "react";
import { BuyerShell } from "@/components/buyer-shell";
import { hilfeGruss } from "@/lib/hilfe-gruss";
import { InhaberHinweis } from "@/components/inhaber-hinweis";
import { getBuyerContext } from "@/lib/buyer-context";
import { Nutzungsanalyse } from "@/components/nutzungsanalyse";
import { asAnalyseStatus, darfAnalyseFragen } from "@/lib/nutzungsanalyse";
import { analysePseudonym } from "@/lib/nutzungsanalyse-server";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox, showChatsTeaser } from "@/lib/whatsapp/access";
import { attentionCount } from "@/lib/whatsapp/attention";
import { endPreviewAction } from "./preview-actions";
import { customerSetupOpenCount } from "@/lib/onboarding";
import { isNewUi } from "@/lib/new-ui";
import { loadCustomerProvision } from "@/lib/provision-server";
import { ProvisionRatesProvider } from "@/components/provision-context";
import { LeadBookingHost } from "@/components/lead-booking";
import type { ShellAbsence } from "@/components/absence-sheet";
import { berlinYmd, currentOrNextAbsence, toAbsenceView } from "@/lib/absence";
import { memberName } from "@/lib/team";
import { unreadUpdateCount } from "@/lib/neuigkeiten";
import { wartendeNeueLeads } from "@/lib/neue-leads";
import { loadBestandVisible } from "@/lib/bestand/sichtbar-server";
import { AppDemoRahmen } from "@/components/app-demo-rahmen";
import { demoTourZiele } from "@/lib/app-demo/tour-server";
import { LiveRefresh } from "@/components/live-refresh";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { istReinesBestellkonto } from "@/lib/ppl/bestellkonto";
import Link from "next/link";
import { istNurLeadsKonto, NUR_LEADS_MENUE, nurLeadsAktiv, nurLeadsPfadErlaubt } from "@/lib/nur-leads";

// Seiten, die bei jeder Änderung (Lead, Chat, Termin) sofort neu laden; überall sonst nur der Zähler „Braucht dich“.
const LIVE_PATHS = ["/buyer", "/buyer/leads", "/buyer/kanban", "/buyer/kontakte", "/buyer/chats"];

// Gemeinsames Layout für den Buyer-Bereich. Hält den @modal-Parallel-Slot,
// in den der Lead-Detail-Modal von ALLEN Buyer-Tabs (KPIs, Leads, Pipeline)
// per Intercepting Route reingerendert wird.
//
// Architektur:
//   /buyer/page.tsx           → KPIs (children)
//   /buyer/leads/page.tsx     → Leads-Tabelle (children)
//   /buyer/kanban/page.tsx    → Pipeline-Board (children)
//   /buyer/@modal/default.tsx → null
//   /buyer/@modal/(.)leads/[id]/page.tsx
//                             → intercepted Modal für /buyer/leads/[id]
//
// Klick aus jedem der drei Tabs auf einen Lead navigiert zu
// /buyer/leads/[id] → Modal öffnet über dem aktiven Tab.
// Refresh / direkter URL-Aufruf → fällt auf /buyer/leads/[id]/page.tsx
// als Vollseite zurück.
//
// Admin-Vorschau („Als Kunde ansehen"): oben ein deutlicher Hinweisbalken
// mit „Vorschau beenden". Die Seiten selbst sind identisch zur Buyer-Sicht.
export default async function BuyerLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const ctx = await getBuyerContext();
  const customerName = ctx
    ? ((
        await prisma.customer.findUnique({
          where: { id: ctx.customerId },
          select: { name: true },
        })
      )?.name ?? "Kunde")
    : null;
  // KI-Hilfe: Inhaber mit Anrede und Nachname aus dem Vertriebskontakt, Berater neutral (lib/hilfe-gruss)
  // Bestellkonto (Ole, 22.11.2026, lib/ppl/bestellkonto.ts): Hauptkunden, die nur für ihre Vertriebspartner bestellen,
  // sehen nur „Leads bestellen“ in einem schlichten Rahmen, ohne CRM (das wäre für sie leer)
  if (ctx && !ctx.demo && (await istReinesBestellkonto(ctx.customerId))) {
    const pfad = (await headers()).get("x-buyer-pfad");
    if (pfad && pfad !== "/buyer/bestellen") redirect("/buyer/bestellen");
    return <BestellkontoRahmen name={customerName ?? ""} previewName={ctx.preview ? customerName : null}>{children}</BestellkontoRahmen>;
  }
  // „Nur Leads“ (Ole, 24.11.2026, lib/nur-leads.ts): Leads, Pipeline, Bestellen, Konto in einem schlichten Rahmen
  if (ctx && !ctx.demo && (await istNurLeadsKonto(ctx.customerId))) {
    const pfad = (await headers()).get("x-buyer-pfad");
    if (pfad && !nurLeadsPfadErlaubt(pfad)) redirect("/buyer/leads");
    return (
      <NurLeadsRahmen name={customerName ?? ""} previewName={ctx.preview ? customerName : null} aktiv={nurLeadsAktiv(pfad)}>
        {children}
        {modal}
      </NurLeadsRahmen>
    );
  }
  const gruss = hilfeGruss(
    ctx && ctx.teamRole === "owner"
      ? await prisma.salesContact.findUnique({ where: { customerId: ctx.customerId }, select: { salutation: true, lastName: true } }).catch(() => null)
      : null,
  );
  // Nutzungsanalyse: Einwilligung, Erstellt-Datum (erst nach 2 Tagen fragen), Pseudonym für Sentry
  const analyseUser = ctx?.userId && !ctx.preview ? await prisma.user.findUnique({ where: { id: ctx.userId }, select: { analyseEinwilligung: true, createdAt: true } }) : null;
  const analyse = asAnalyseStatus(analyseUser?.analyseEinwilligung);
  const analysePseudo = ctx?.userId && analyse === "ja" ? analysePseudonym(ctx.userId) : null;
  const demo = !!ctx?.demo;
  const previewName = ctx?.preview && !demo ? customerName : null;
  const newUi = ctx ? await isNewUi(ctx.customerId) : false;
  const advisor = ctx?.teamRole === "advisor";
  const provision = ctx ? await loadCustomerProvision(ctx.customerId) : null;
  const [showChats, chatBadge, setupOpen, me, logins, pplSubs, bestand] = ctx
    ? await Promise.all([
        hasWhatsAppInbox(ctx.customerId).then(async (inbox) => inbox || (await showChatsTeaser(ctx.customerId))),
        attentionCount(ctx),
        advisor ? 0 : customerSetupOpenCount(ctx.customerId),
        advisor && ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true, email: true } }) : null,
        prisma.user.count({ where: { customerId: ctx.customerId, role: "BUYER" } }),
        advisor ? 0 : prisma.leadSubscription.count({ where: { customerId: ctx.customerId, active: true, delivery: { in: ["app", "app_pdf"] } } }),
        // Bestand: nur Inhaber, und vorerst nur mit Schalter oder aktivem Modul (lib/bestand/sichtbar.ts)
        advisor || ctx.demo ? false : loadBestandVisible(ctx.customerId, { preview: ctx.preview }),
      ])
    : [false, 0, 0, null, 0, 0, false];
  // Anzeigename ohne Gesellschafts-Präfix („Allianz Anid Schwarzkopf").
  // Berater sehen ihren eigenen Namen.
  const displayName = me ? (me.displayName?.trim() || me.email) : (customerName ?? "").replace(/^Allianz\s+/i, "");
  // „Ich bin abwesend“: eigene Abwesenheit + Kollegen für die Vertretung (nicht in der Vorschau)
  let absence: ShellAbsence | null = null;
  if (ctx?.userId && !ctx.preview) {
    const [cur, members] = await Promise.all([
      currentOrNextAbsence(ctx.userId),
      prisma.user.findMany({ where: { customerId: ctx.customerId, role: "BUYER" }, select: { id: true, email: true, displayName: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const self = members.find((m) => m.id === ctx.userId);
    absence = {
      person: { userId: ctx.userId, name: self ? memberName(self) : displayName, isMe: true },
      current: cur ? toAbsenceView(cur) : null,
      colleagues: members.filter((m) => m.id !== ctx.userId).map((m) => ({ id: m.id, name: memberName(m) })),
      today: berlinYmd(new Date()),
    };
  }

  // Neuigkeiten: ungelesene Einträge des Logins (Vorschau: keine Markierung)
  const updatesUnread = ctx?.userId && !ctx.preview ? await unreadUpdateCount(ctx.userId, ctx.customerId).catch(() => 0) : 0;
  // Zähler „N neu“ an „Kontakte“ (Ole, 19.11.2026): nur neue Leads, die wirklich auf den Vermittler warten, dieselbe
  // Menge wie die Karte „Neue Leads: jetzt anrufen“ auf Heute (lib/neue-leads.ts). Leads, die der Assistent per
  // WhatsApp betreut, zählen nicht.
  const noStepBadge = ctx ? await wartendeNeueLeads(ctx).then((l) => l.length).catch(() => 0) : 0;
  // Zusatzmodul Empfehlungen (Paket 2): Menüeintrag nur bei aktivem Modul bzw. Testphase, mit „n bereit“
  const empfehlungReady = await empfehlungMenuCount(ctx);

  return (
    <>
      {previewName ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
          <span>
            Vorschau: Das CRM von <b>{previewName}</b>, nur lesend
            (Demo-Leads lassen sich bearbeiten).
          </span>
          <form action={endPreviewAction}>
            <button
              type="submit"
              className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-black"
            >
              Vorschau beenden
            </button>
          </form>
        </div>
      ) : null}
      {ctx ? (
        <ProvisionRatesProvider rates={provision?.rates ?? {}} products={provision?.products ?? []}>
          <BuyerShell demo={demo} newUi={newUi} displayName={displayName} hilfeGruss={gruss} showChats={showChats} chatBadge={chatBadge} setupOpen={setupOpen} teamRole={ctx.teamRole} hasTeam={logins > 1} showOrders={pplSubs > 0} showBestand={bestand} empfehlungReady={empfehlungReady} absence={absence} updatesUnread={updatesUnread} noStepBadge={noStepBadge}>
            {demo ? (
              <>
                <meta name="robots" content="noindex, nofollow" />
                <AppDemoRahmen ziele={await demoTourZiele(ctx.customerId)} />
              </>
            ) : null}
            {ctx.teamRole === "advisor" ? (
              <Suspense fallback={null}>
                <div className="px-4 sm:px-6 lg:px-8">
                  <InhaberHinweis />
                </div>
              </Suspense>
            ) : null}
            {/* Live: neue Leads und Chat-Nachrichten ohne Neuladen, auch der Zähler „Braucht dich“ (components/live-refresh.tsx) */}
            <LiveRefresh fullPaths={LIVE_PATHS} />
            {/* Nutzungsanalyse nur mit Einwilligung (components/nutzungsanalyse.tsx, lib/nutzungsanalyse.ts) */}
            <Nutzungsanalyse
              status={analyse}
              pseudonym={analysePseudo}
              darfFragen={!ctx.preview && !!analyseUser && darfAnalyseFragen({ createdAt: analyseUser.createdAt, einrichtungOffen: setupOpen })}
            />
            {children}
            {/* Lead-Detail-Modal innerhalb der Shell → Toasts funktionieren dort auch */}
            {modal}
            {/* Termin buchen im Fenster (Heute, Rückrufe …), components/lead-booking.tsx */}
            <LeadBookingHost />
          </BuyerShell>
        </ProvisionRatesProvider>
      ) : (
        <>
          {children}
          {modal}
        </>
      )}
    </>
  );
}

/** Schlichter Rahmen für reine Bestellkonten: Name, Abmelden, Seite. Vorschau mit demselben Hinweisbalken. */
function BestellkontoRahmen({ name, previewName, children }: { name: string; previewName: string | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--background)]">
      {previewName ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
          <span>
            Vorschau: Bestellkonto von <b>{previewName}</b>, nur lesend.
          </span>
          <form action={endPreviewAction}>
            <button type="submit" className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-black">
              Vorschau beenden
            </button>
          </form>
        </div>
      ) : null}
      <header className="border-b border-[color:var(--border)] bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          {previewName ? null : (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="inline-flex min-h-10 items-center gap-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
                <LogOut className="h-4 w-4" /> Abmelden
              </button>
            </form>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

/** Rahmen „Nur Leads“: Name, Abmelden und vier Reiter (am Handy waagrecht wischbar), kein CRM-Menü. */
function NurLeadsRahmen({ name, previewName, aktiv, children }: { name: string; previewName: string | null; aktiv: string | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--background)]" data-nur-leads-rahmen>
      {previewName ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
          <span>
            Vorschau: Kundenbereich „Nur Leads“ von <b>{previewName}</b>, nur lesend.
          </span>
          <form action={endPreviewAction}>
            <button type="submit" className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-black">
              Vorschau beenden
            </button>
          </form>
        </div>
      ) : null}
      <header className="border-b border-[color:var(--border)] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6 lg:px-8">
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          {previewName ? null : (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="inline-flex min-h-10 items-center gap-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
                <LogOut className="h-4 w-4" /> Abmelden
              </button>
            </form>
          )}
        </div>
        <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4 lg:px-6 [scrollbar-width:none]" aria-label="Bereiche">
          {NUR_LEADS_MENUE.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              aria-current={aktiv === m.href ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium ${
                aktiv === m.href ? "border-[color:var(--brand)] text-[color:var(--foreground)]" : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

/** Anzahl „Heute fragen“ für den Menüeintrag „Empfehlungen“; null = Modul nicht aktiv (kein Eintrag). Nur Inhaber. */
async function empfehlungMenuCount(ctx: { customerId: string; teamRole: string; demo?: boolean } | null): Promise<number | null> {
  if (!ctx || ctx.teamRole !== "owner" || ctx.demo) return null;
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { empfehlungEnabled: true, plan: true } }).catch(() => null);
  if (!c?.empfehlungEnabled || c.plan === "service") return null;
  const { loadReferralCandidates } = await import("@/lib/empfehlung/requests");
  return loadReferralCandidates(ctx.customerId)
    .then((r) => r.ready.length)
    .catch(() => 0);
}
