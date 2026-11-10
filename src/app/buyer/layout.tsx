import { BuyerShell } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { attentionCount } from "@/lib/whatsapp/attention";
import { endPreviewAction } from "./preview-actions";
import { customerSetupOpenCount } from "@/lib/onboarding";
import { isNewUi } from "@/lib/new-ui";

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
  const [showChats, chatBadge, setupOpen, me, logins, pplSubs, bestand] = ctx
    ? await Promise.all([
        hasWhatsAppInbox(ctx.customerId),
        attentionCount(ctx),
        advisor ? 0 : customerSetupOpenCount(ctx.customerId),
        advisor && ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true, email: true } }) : null,
        prisma.user.count({ where: { customerId: ctx.customerId, role: "BUYER" } }),
        advisor ? 0 : prisma.leadSubscription.count({ where: { customerId: ctx.customerId, active: true, delivery: "app" } }),
        advisor ? false : prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } }).then((c) => !!c?.existingCustomersEnabled),
      ])
    : [false, 0, 0, null, 0, 0, false];
  // Anzeigename ohne Gesellschafts-Präfix („Allianz Anid Schwarzkopf").
  // Berater sehen ihren eigenen Namen.
  const displayName = me ? (me.displayName?.trim() || me.email) : (customerName ?? "").replace(/^Allianz\s+/i, "");

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
        <BuyerShell newUi={newUi} displayName={displayName} showChats={showChats} chatBadge={chatBadge} setupOpen={setupOpen} teamRole={ctx.teamRole} hasTeam={logins > 1} showOrders={pplSubs > 0} showBestand={bestand}>
          {children}
          {/* Lead-Detail-Modal innerhalb der Shell → Toasts funktionieren dort auch */}
          {modal}
        </BuyerShell>
      ) : (
        <>
          {children}
          {modal}
        </>
      )}
    </>
  );
}
