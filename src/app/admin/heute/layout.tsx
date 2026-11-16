import { connection } from "next/server";
import { Suspense } from "react";
import { SubTabs } from "@/components/admin/sub-tabs";
import { RememberList } from "@/components/admin/list-memory";
import { berlinHour, greeting } from "@/lib/admin-heute";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { dayBounds } from "@/lib/vertrieb/queries";

// Heute (Admin-Makeover Runde 2, Ole 16.11.2026): ein Eingang für alles, was dran ist.
// „Braucht Sie“ sammelt aus allen Bereichen, „Aufgaben“ ist die volle Aufgabenliste (früher Vertrieb → Aufgaben).
export default async function HeuteLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await requireAuth();
  const { tomorrow } = dayBounds();
  const due = await prisma.salesTask.count({ where: { doneAt: null, dueAt: { lt: tomorrow } } }).catch(() => 0);
  return (
    <main className="vertrieb mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={null}>
        <RememberList id="vertrieb" paths={["/admin/heute", "/admin/heute/aufgaben"]} />
        <RememberList id="kunden" paths={["/admin/heute"]} />
      </Suspense>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{greeting(berlinHour(new Date()))}</h1>
      <SubTabs
        tabs={[
          { href: "/admin/heute", label: "Braucht Sie", exact: true },
          { href: "/admin/heute/aufgaben", label: "Aufgaben", count: due },
        ]}
      />
      {children}
    </main>
  );
}
