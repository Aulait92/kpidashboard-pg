import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the seed");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function daysAgo(n: number, hour = 9): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  await prisma.cost.deleteMany();
  await prisma.revenue.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.customer.deleteMany();

  const customers = await Promise.all(
    ["Acme GmbH", "Globex AG", "Initech KG"].map((name) =>
      prisma.customer.create({ data: { name } }),
    ),
  );

  for (const customer of customers) {
    for (let i = 0; i < 60; i++) {
      const createdAt = daysAgo(i, 9 + (i % 8));
      const reached = i % 3 !== 0;
      const closed = i % 5 === 0;
      const firstContactHours = 1 + ((i * 7) % 36);
      const firstContactAt = reached
        ? new Date(createdAt.getTime() + firstContactHours * 3600 * 1000)
        : null;
      const closedAt = closed
        ? new Date(createdAt.getTime() + (firstContactHours + 24) * 3600 * 1000)
        : null;

      const lead = await prisma.lead.create({
        data: {
          customerId: customer.id,
          createdAt,
          reached,
          contactAttempts: 1 + (i % 5),
          firstContactAt,
          closedAt,
          acquisitionCost: 25 + (i % 7) * 3,
        },
      });

      if (closed) {
        await prisma.revenue.create({
          data: {
            customerId: customer.id,
            leadId: lead.id,
            amount: 800 + (i % 11) * 75,
            occurredAt: closedAt!,
          },
        });
      }

      await prisma.cost.create({
        data: {
          customerId: customer.id,
          kind: "LEAD",
          amount: 25 + (i % 7) * 3,
          occurredAt: createdAt,
          note: "Akquisekosten",
        },
      });

      if (i % 10 === 0) {
        await prisma.cost.create({
          data: {
            customerId: customer.id,
            kind: "OTHER",
            amount: 250,
            occurredAt: createdAt,
            note: "Betriebskosten (anteilig)",
          },
        });
      }
    }
  }

  const counts = {
    customers: await prisma.customer.count(),
    leads: await prisma.lead.count(),
    revenues: await prisma.revenue.count(),
    costs: await prisma.cost.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
