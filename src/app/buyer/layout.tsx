import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { endPreviewAction } from "./preview-actions";

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
  const previewName = ctx?.preview
    ? ((
        await prisma.customer.findUnique({
          where: { id: ctx.customerId },
          select: { name: true },
        })
      )?.name ?? "Kunde")
    : null;

  return (
    <>
      {previewName ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
          <span>
            👁 Vorschau: Du siehst das Kunden-CRM von <b>{previewName}</b> –
            nur lesend, Änderungen sind deaktiviert.
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
      {children}
      {modal}
    </>
  );
}
