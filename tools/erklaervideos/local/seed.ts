import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { seedDemoData } from "@/lib/demo-data";
async function main() {
  const c = await prisma.customer.upsert({ where: { name: "Allianz Max Berger" }, update: {}, create: { name: "Allianz Max Berger" } });
  await prisma.user.upsert({ where: { email: "demo@pg.local" }, update: { customerId: c.id }, create: { email: "demo@pg.local", passwordHash: await hashPassword("Demo12345!"), role: "BUYER" as never, customerId: c.id, displayName: "Max Berger" } });
  console.log(await seedDemoData(c.id), c.id);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
