import { redirect } from "next/navigation";
import { after } from "next/server";
import { PageHeader } from "@/components/buyer-shell";
import { UpdatesList } from "@/components/neuigkeiten";
import { getBuyerContext } from "@/lib/buyer-context";
import { listUpdatesForCustomer, markUpdatesSeen, unreadUpdates } from "@/lib/neuigkeiten";

export const dynamic = "force-dynamic";
export const metadata = { title: "Neuigkeiten | performancegrowth" };

// Was wir an der Software verbessert haben – für Inhaber und Berater.
// Beim Öffnen gilt alles als gelesen (nicht in der Admin-Vorschau).
export default async function NeuigkeitenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [items, unread] = await Promise.all([
    listUpdatesForCustomer(ctx.customerId),
    ctx.userId && !ctx.preview ? unreadUpdates(ctx.userId, ctx.customerId) : Promise.resolve([]),
  ]);
  if (ctx.userId && !ctx.preview) {
    const userId = ctx.userId;
    after(() => markUpdatesSeen(userId).catch(() => undefined));
  }
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Neuigkeiten" subtitle="Was wir für Sie verbessert haben." />
      <UpdatesList items={items} unreadIds={unread.map((u) => u.id)} />
    </main>
  );
}
