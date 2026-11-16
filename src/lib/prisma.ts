import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { istDemoAnfrage } from "@/lib/app-demo/anfrage";
import { demoLeseClient, demoSchreibClient } from "@/lib/app-demo/db";
import { AsyncLocalStorage } from "node:async_hooks";

// Anlegen der Demo-Beispieldaten (src/lib/app-demo/seed.ts, Cron/Start, nie in einer Anfrage): alle Zugriffe innerhalb
// von mitDemoSchreibClient() gehen an die Demo-Datenbank, damit die normalen Funktionen (seedDemoData, Monatsbericht)
// dort schreiben statt in der echten Datenbank.
const demoSchreiben = new AsyncLocalStorage<true>();
export function mitDemoSchreibClient<T>(fn: () => Promise<T>): Promise<T> {
  demoSchreibClient(); // wirft ohne APP_DEMO_DATABASE_URL, bevor irgendetwas läuft
  return demoSchreiben.run(true, fn);
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Bricht die Datenbank-Verbindung ab (Neustart, Umzug, Netzwerk), meldet
  // der Pool einen Fehler. Ohne Handler beendet Node den ganzen Prozess –
  // so loggen wir nur und der Pool baut beim nächsten Query neu auf.
  const adapter = new PrismaPg(
    { connectionString },
    {
      onPoolError: (err) => console.error("[db] Pool-Fehler:", err.message),
      onConnectionError: (err) => console.error("[db] Verbindungsfehler:", err.message),
    },
  );
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
  }
  return globalForPrisma.prisma;
}

// Proxy delays client construction until the first property access,
// so importing this module never touches DATABASE_URL. That matters for
// `next build`, which imports route modules to collect their config.
//
// Öffentliche App-Demo (/app-demo, src/lib/app-demo): Trägt die laufende Anfrage das signierte Demo-Kennzeichen,
// gehen ALLE Zugriffe an die eigene Demo-Datenbank, nur lesend (default_transaction_read_only). Die echte Datenbank
// ist in einer Demo-Anfrage nicht erreichbar.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = istDemoAnfrage() ? demoLeseClient() : demoSchreiben.getStore() ? demoSchreibClient() : getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
