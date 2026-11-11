import { BuyerShell } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox, showChatsTeaser } from "@/lib/whatsapp/access";
import { attentionCount } from "@/lib/whatsapp/attention";
import { endPreviewAction } from "./preview-actions";
import { customerSetupOpenCount } from "@/lib/onboarding";
import { isNewUi } from "@/lib/new-ui";
import { loadCustomerProvision } from "@/lib/provision-server";
import { ProvisionRatesProvider } from "@/components/provision-context";
import type { ShellAbsence } from "@/components/absence-sheet";
import { berlinYmd, currentOrNextAbsence, toAbsenceView } from "@/lib/absence";
import { memberName } from "@/lib/team";

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
  const previewName = ctx?.preview ? customerName : null;
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
        // Bestand: für Inhaber immer sichtbar – ohne gebuchtes Modul mit Hinweis zum Anfragen
        !advisor,
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

  return (
    <>
      {previewName ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
          <span>
            Vorschau: Du siehst das CRM von <b>{previewName}</b>, nur lesend
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
        <ProvisionRatesProvider rates={provision?.rates ?? {}}>
          <BuyerShell newUi={newUi} displayName={displayName} showChats={showChats} chatBadge={chatBadge} setupOpen={setupOpen} teamRole={ctx.teamRole} hasTeam={logins > 1} showOrders={pplSubs > 0} showBestand={bestand} absence={absence}>
            {children}
            {/* Lead-Detail-Modal innerhalb der Shell → Toasts funktionieren dort auch */}
            {modal}
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
