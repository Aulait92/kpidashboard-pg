// Diagnose „pakete“ (Ole, 18.11.2026): Paketart je Kunde (wie in der Kundenakte) und ob die tägliche Erinnerung
// „X Leads brauchen einen nächsten Schritt“ heute an Logins dieses Kunden lief. Nur Kundennamen, keine Leaddaten.
import { packageLabel } from "@/lib/customer-package";
import { berlinDayKey } from "@/lib/next-step-reminder";
import { prisma } from "@/lib/prisma";

export async function paketeDiagnose(): Promise<unknown> {
  const heute = berlinDayKey(new Date());
  const kunden = await prisma.customer.findMany({
    where: { archived: false },
    select: {
      name: true,
      plan: true,
      isTest: true,
      retainerMonthly: true,
      onboarding: { select: { id: true } },
      users: { where: { role: "BUYER" }, select: { nextStepReminder: true, nextStepReminderDay: true } },
    },
    orderBy: { name: "asc" },
  });
  return {
    heute,
    kunden: kunden.map((k) => ({
      name: k.name,
      paket: packageLabel(k),
      test: k.isTest,
      logins: k.users.length,
      erinnerungAn: k.users.filter((u) => u.nextStepReminder).length,
      erinnerungHeuteGelaufen: k.users.filter((u) => u.nextStepReminderDay === heute).length,
    })),
  };
}
