import { Suspense } from "react";
import { BuyerShell } from "@/components/buyer-shell";
import { hilfeGruss } from "@/lib/hilfe-gruss";
import { InhaberHinweis } from "@/components/inhaber-hinweis";
import { getBuyerContext } from "@/lib/buyer-context";
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
import { leadScope, memberName } from "@/lib/team";
import { unreadUpdateCount } from "@/lib/neuigkeiten";
import { nowMs } from "@/lib/now";
import { loadBestandVisible } from "@/lib/bestand/sichtbar-server";
import { AppDemoRahmen } from "@/components/app-demo-rahmen";
import { demoTourZiele } from "@/lib/app-demo/tour-server";
import { LiveRefresh } from "@/components/live-refresh";

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
  const gruss = hilfeGruss(
    ctx && ctx.teamRole === "owner"
      ? await prisma.salesContact.findUnique({ where: { customerId: ctx.customerId }, select: { salutation: true, lastName: true } }).catch(() => null)
      : null,
  );
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
        advisor ? 0 : prisma.leadSubscription.count({ where: { customerId: ctx.customerId, active: true, delivery: "app" } }),
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
  // Zähler an „Kontakte“ (UX-Überarbeitung, Ole 15.11.2026): neue Kontakte der letzten 30 Tage, mit denen noch niemand
  // gesprochen hat. Leads ohne nächsten Schritt stehen auf „Heute“ unter „Aufräumen“.
  const noStepBadge = ctx
    ? await prisma.lead
        .count({
          where: {
            ...leadScope(ctx),
            erasedAt: null,
            closedAt: null,
            reached: false,
            OR: [{ status: null }, { status: "Neuer Lead" }],
            createdAt: { gte: new Date(nowMs() - 30 * 24 * 3600_000) },
          },
        })
        .catch(() => 0)
    : 0;

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
          <BuyerShell demo={demo} newUi={newUi} displayName={displayName} hilfeGruss={gruss} showChats={showChats} chatBadge={chatBadge} setupOpen={setupOpen} teamRole={ctx.teamRole} hasTeam={logins > 1} showOrders={pplSubs > 0} showBestand={bestand} absence={absence} updatesUnread={updatesUnread} noStepBadge={noStepBadge}>
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
