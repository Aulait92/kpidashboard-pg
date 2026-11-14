import { prisma } from "@/lib/prisma";
async function main() {
  const lead = await prisma.lead.findFirst({ where: { name: { contains: "Verena Martin" } } as never, select: { id: true } }).catch(() => null);
  const leads = lead ? [lead] : await prisma.$queryRawUnsafe<{ id: string }[]>(`select id from "Lead" where "formData"::text ilike '%Verena%' limit 1`);
  const id = leads[0]?.id; if (!id) throw new Error("no lead");
  const a = await prisma.appointment.findFirst({ where: { leadId: id, status: "booked" } });
  const t = new Date(); t.setUTCDate(t.getUTCDate() + 1); t.setUTCHours(9, 0, 0, 0);
  if (a) await prisma.appointment.update({ where: { id: a.id }, data: { startsAt: t, endsAt: new Date(t.getTime() + 30 * 60000) } });
  console.log("ok", id, !!a, t.toISOString());
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
