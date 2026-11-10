import { connection } from "next/server";
import { Suspense } from "react";
import { RememberList } from "@/components/admin/list-memory";
import { VERTRIEB_LISTS } from "@/lib/admin-lists";
import { VertriebNav } from "@/components/vertrieb/nav";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { addDays, fromDayKey, todayKey } from "@/lib/vertrieb/dates";

// Vertrieb (ehemals Cold CRM): eigene Unternavigation im Admin-Bereich.
export default async function VertriebLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await requireAuth();
  const dueCount = await prisma.salesTask.count({
    where: { doneAt: null, dueAt: { lt: addDays(fromDayKey(todayKey(), "00:00"), 1) } },
  });
  return (
    <div className="vertrieb w-full flex-1">
      <VertriebNav dueCount={dueCount} />
      <Suspense fallback={null}>
        <RememberList id="vertrieb" paths={VERTRIEB_LISTS} />
      </Suspense>
      <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
