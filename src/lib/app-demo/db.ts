// Eigene Datenbank der öffentlichen App-Demo (APP_DEMO_DATABASE_URL), physisch getrennt von den Kundendaten.
//
// - Lese-Client: jede Verbindung mit default_transaction_read_only=on. Schreibt Code in einer Demo-Anfrage doch
//   etwas, lehnt Postgres das ab (und zwar in der Demo-Datenbank, nicht in der echten).
// - Schreib-Client: nur für das tägliche Neuanlegen der Beispieldaten (./seed.ts), nie in einer Anfrage.
// - Kein Rückfall auf DATABASE_URL: fehlt die Variable oder zeigt sie auf die echte Datenbank, gibt es keine Demo.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { demoDatenbankUrl } from "./konfig";

export { demoDatenbankUrl };

/** Fester Demo-Kunde in der Demo-Datenbank (Beispielmarke „Max Berger“). */
export const APP_DEMO_KUNDE_ID = "app_demo_max_berger";
export const APP_DEMO_KUNDE_NAME = "Allianz Max Berger";

const g = globalThis as unknown as { appDemoLese?: PrismaClient; appDemoSchreib?: PrismaClient; appDemoGeprueft?: Promise<boolean> };

export const appDemoEingerichtet = (): boolean => demoDatenbankUrl() !== null;

const SCHREIBEND = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);

function client(url: string, nurLesen: boolean): PrismaClient {
  const adapter = new PrismaPg(
    { connectionString: url, max: nurLesen ? 5 : 2, ...(nurLesen ? { options: "-c default_transaction_read_only=on" } : {}) },
    { onPoolError: (err) => console.error("[app-demo] Pool-Fehler:", err.message) },
  );
  return new PrismaClient({ adapter });
}

/** Client für Demo-Anfragen (nur lesend). Wirft, wenn die Demo nicht eingerichtet ist – nie Rückfall auf die echte DB. */
export function demoLeseClient(): PrismaClient {
  if (!g.appDemoLese) {
    const url = demoDatenbankUrl();
    if (!url) throw new Error("App-Demo ist nicht eingerichtet (APP_DEMO_DATABASE_URL).");
    // Zusätzlich zur Sperre in Postgres: Schreibversuche gar nicht erst senden, sondern melden (Prüfung der Seiten)
    g.appDemoLese = client(url, true).$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (SCHREIBEND.has(operation)) {
              console.warn(`[app-demo] Schreibversuch gesperrt: ${model}.${operation}`);
              return Promise.reject(new Error("App-Demo: nur lesend."));
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
  }
  return g.appDemoLese;
}

/** Client zum Anlegen der Beispieldaten. Nur für ./seed.ts. */
export function demoSchreibClient(): PrismaClient {
  if (!g.appDemoSchreib) {
    const url = demoDatenbankUrl();
    if (!url) throw new Error("App-Demo ist nicht eingerichtet (APP_DEMO_DATABASE_URL).");
    g.appDemoSchreib = client(url, false);
  }
  return g.appDemoSchreib;
}

/** Höchstzahl Kunden in einer Demo-Datenbank. Mehr heißt: das ist keine Demo-Datenbank. */
export const DEMO_MAX_KUNDEN = 5;

/**
 * Sicherheitsprüfung einmal je Prozess: Die Demo-Datenbank trägt die Tabelle "_app_demo" (./seed.ts), enthält den
 * Demo-Kunden und höchstens wenige Kunden.
 * Schützt vor einer falsch gesetzten Variable (z. B. Kopie der echten Datenbank).
 */
export function demoDatenbankGeprueft(db: () => PrismaClient = demoLeseClient): Promise<boolean> {
  if (!g.appDemoGeprueft) {
    g.appDemoGeprueft = (async () => {
      try {
        const c = db();
        const [anzahl, demo, marke] = await Promise.all([
          c.customer.count(),
          c.customer.findUnique({ where: { id: APP_DEMO_KUNDE_ID }, select: { id: true } }),
          c.$queryRawUnsafe<{ da: boolean }[]>(`SELECT to_regclass('public."_app_demo"') IS NOT NULL AS da`),
        ]);
        return !!demo && anzahl <= DEMO_MAX_KUNDEN && !!marke[0]?.da;
      } catch (err) {
        console.error("[app-demo] Prüfung der Demo-Datenbank fehlgeschlagen:", err instanceof Error ? err.message : err);
        return false;
      }
    })();
    // Fehlschlag nicht für immer merken (z. B. Demo-Daten werden gerade angelegt)
    void g.appDemoGeprueft.then((ok) => {
      if (!ok) setTimeout(() => (g.appDemoGeprueft = undefined), 60_000).unref?.();
    });
  }
  return g.appDemoGeprueft;
}

/** Nur für Tests. */
export function resetAppDemoDb() {
  g.appDemoGeprueft = undefined;
}
