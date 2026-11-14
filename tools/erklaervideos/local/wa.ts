import { prisma } from "@/lib/prisma";
import { seedDemoData } from "@/lib/demo-data";
async function main() {
  const c = await prisma.customer.findUniqueOrThrow({ where: { name: "Allianz Max Berger" } });
  await prisma.customer.update({ where: { id: c.id }, data: { newUi: true } });
  await prisma.whatsAppAccount.upsert({ where: { customerId: c.id }, update: {}, create: { customerId: c.id, status: "connected", phoneNumber: "+49 151 00000000", displayName: "Max Berger Versicherungen" } });
  await prisma.agentConfig.upsert({ where: { customerId: c.id }, update: { active: true }, create: { customerId: c.id, active: true, name: "Assistent von Max" } });
  console.log(await seedDemoData(c.id));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
