// Sicherheitsnachweis öffentliche App-Demo (/app-demo, Ole 16.11.2026): JEDE Server Action des Kundenbereichs
// (alle "use server"-Dateien unter src/app/buyer sowie src/lib/actions.ts und src/components/monthly-goals-actions.ts)
// wird in einer Anfrage mit Demo-Kennzeichen aufgerufen und darf dabei
//   - nichts in die Datenbank schreiben (Prisma-Schreibzugriffe und rohes SQL werden mitgeschrieben und blockiert),
//   - nichts nach außen schicken (fetch, Web-Push, E-Mail per SMTP),
//   - kein Cookie setzen und nichts per after() nachschieben.
// Die Anfrage ist so gebaut, wie sie aus der Demo käme, wenn die Middleware sie NICHT abfinge (signiertes Kennzeichen,
// Next-Action-Header) und zusätzlich mit dem echten Login-Cookie eines Kunden im Browser. Gegenprobe: dieselben Aufrufe
// ohne Kennzeichen schreiben (Rekorder funktioniert, Argumente erreichen die Schreibpfade).
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const spur = vi.hoisted(() => ({
  headers: new Headers(),
  cookie: null as string | null,
  writes: [] as string[],
  fetches: [] as string[],
  sonst: [] as string[],
}));

vi.mock("next/headers", () => ({
  headers: async () => spur.headers,
  cookies: async () => ({
    get: (name: string) => (name === "kpi_session" && spur.cookie ? { name, value: spur.cookie } : undefined),
    getAll: () => (spur.cookie ? [{ name: "kpi_session", value: spur.cookie }] : []),
    has: (name: string) => name === "kpi_session" && !!spur.cookie,
    set: (name: string) => void spur.sonst.push(`cookie.set ${name}`),
    delete: (name: string) => void spur.sonst.push(`cookie.delete ${name}`),
  }),
  draftMode: async () => ({ isEnabled: false }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
  refresh: () => undefined,
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: () => void spur.sonst.push("after()"),
}));
// Demo-Datenbank gilt als geprüft: Beim Rendern gäbe getBuyerContext damit wirklich die Demo-Sicht zurück
vi.mock("@/lib/app-demo/db", async (orig) => ({ ...(await orig<typeof import("@/lib/app-demo/db")>()), demoDatenbankGeprueft: async () => true }));
vi.mock("web-push", () => {
  const wp = { setVapidDetails: () => undefined, sendNotification: async () => void spur.sonst.push("web-push"), generateVAPIDKeys: () => ({ publicKey: "x", privateKey: "y" }) };
  return { default: wp, ...wp };
});
vi.mock("nodemailer", () => {
  const t = { sendMail: async () => void spur.sonst.push("smtp"), verify: async () => true, close: () => undefined };
  const nm = { createTransport: () => t };
  return { default: nm, ...nm };
});
// Prisma: Lesen echt (Test-Datenbank), jeder Schreibversuch wird mitgeschrieben und blockiert
vi.mock("@/lib/prisma", async (orig) => {
  const echt = (await orig<typeof import("@/lib/prisma")>()).prisma;
  const SCHREIBEN = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
  const blockiert = (was: string) => {
    spur.writes.push(was);
    const p = Promise.reject(new Error(`Schreibzugriff blockiert (Test): ${was}`));
    p.catch(() => {});
    return p;
  };
  const modell = (name: string, d: object) =>
    new Proxy(d, {
      get(t, m: string) {
        if (SCHREIBEN.has(m)) return () => blockiert(`${name}.${m}`);
        const v = Reflect.get(t, m);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const client: object = new Proxy(echt, {
    get(t, prop: string) {
      if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return () => blockiert(prop);
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") {
        return (q: unknown, ...rest: unknown[]) => {
          const sql = Array.isArray(q) ? q.join("?") : String(q);
          if (/\b(insert|update|delete|truncate|alter|drop|create)\b/i.test(sql)) return blockiert(`${prop}: ${sql.slice(0, 60)}`);
          return (Reflect.get(t, prop) as (...a: unknown[]) => unknown).call(t, q, ...rest);
        };
      }
      if (prop === "$transaction") {
        return (arg: unknown) => (typeof arg === "function" ? (arg as (c: unknown) => unknown)(client) : Promise.all(arg as Promise<unknown>[]));
      }
      const v = Reflect.get(t, prop);
      if (v && typeof v === "object" && "findMany" in (v as object)) return modell(prop, v as object);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { prisma: client, mitDemoSchreibClient: () => Promise.reject(new Error("nicht im Test")) };
});

import { prisma } from "@/lib/prisma";
import { sessionPayloadFor, signSession } from "@/lib/auth";
import { APP_DEMO_HEADER, signiereDemoMarke } from "@/lib/app-demo/marke";
import { requireTestDb } from "./db";

const ROOT = path.resolve(__dirname, "../..");

/** Alle Dateien mit "use server" am Anfang (nach Kommentaren) unter src/app/buyer, dazu die zwei geteilten. */
function actionDateien(): string[] {
  const out: string[] = [];
  const gehe = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) gehe(p);
      else if (/\.(ts|tsx)$/.test(e.name) && istUseServer(p)) out.push(p);
    }
  };
  gehe(path.join(ROOT, "src/app/buyer"));
  for (const f of ["src/lib/actions.ts", "src/components/monthly-goals-actions.ts"]) out.push(path.join(ROOT, f));
  return out.sort();
}
function istUseServer(datei: string): boolean {
  const code = fs.readFileSync(datei, "utf8").replace(/^(\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["']use server["']/.test(code);
}

type Aufruf = { datei: string; name: string; fn: (...a: unknown[]) => Promise<unknown> };

let customerId = "";
let leadId = "";
let apptId = "";
let token = "";
let aufrufe: Aufruf[] = [];

function argumente(): unknown[][] {
  const fd = new FormData();
  for (const k of ["leadId", "id", "appointmentId", "conversationId", "customerId"]) fd.set(k, k === "appointmentId" ? apptId : leadId);
  for (const k of ["text", "note", "body", "message", "name", "email", "phone", "status", "value", "title", "subject"]) fd.set(k, "Demo 1");
  return [[leadId, "Demo 1", "Demo 2", { text: "Demo", status: "Abschluss" }], [fd], [undefined, fd], [apptId, 1, 1, true], []];
}

async function rufeAlleAuf(): Promise<{ writes: string[]; fetches: string[]; sonst: string[]; jeAction: Map<string, number> }> {
  spur.writes = [];
  spur.fetches = [];
  spur.sonst = [];
  const jeAction = new Map<string, number>();
  for (const a of aufrufe) {
    const vorher = spur.writes.length;
    for (const args of argumente()) {
      await Promise.race([a.fn(...args).catch(() => undefined), new Promise((r) => setTimeout(r, 5000))]);
    }
    jeAction.set(`${path.relative(ROOT, a.datei)}#${a.name}`, spur.writes.length - vorher);
  }
  // Fire-and-forget-Aufrufe kurz auslaufen lassen
  await new Promise((r) => setTimeout(r, 200));
  return { writes: [...spur.writes], fetches: [...spur.fetches], sonst: [...spur.sonst], jeAction };
}

// Erlaubt, weil nur im eigenen Browser und ohne Login oder Daten: „Vorschau beenden“ löscht das Admin-Vorschau-Cookie,
// der Schalter „Gewinn mit Bestand“ merkt sich die Anzeige (wirkt nur im Browser, wie in der Demo gewünscht).
const HARMLOS = new Set(["cookie.delete kpi_view_as", "cookie.set kpi_gewinn_bestand"]);
const ohneHarmlose = (xs: string[]) => xs.filter((x) => !HARMLOS.has(x));

const fetchVorher = globalThis.fetch;

beforeAll(async () => {
  requireTestDb();
  process.env.AUTH_SECRET ||= "localtestsecret_localtestsecret_0123456789";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    spur.fetches.push(String(input instanceof Request ? input.url : input));
    throw new Error("fetch blockiert (Test)");
  }) as typeof fetch;
  // Echter Kunde mit Login, Lead und Termin (über den echten Client angelegt, nicht über den Rekorder)
  const { prisma: echt } = await vi.importActual<typeof import("@/lib/prisma")>("@/lib/prisma");
  const uid = Math.random().toString(36).slice(2, 10);
  const c = await echt.customer.create({ data: { name: `Test App-Demo ${uid}`, newUi: true } });
  customerId = c.id;
  const u = await echt.user.create({ data: { email: `${uid}@test.local`, passwordHash: "x", role: "BUYER", customerId, teamRole: "owner", receivesLeads: true } });
  const lead = await echt.lead.create({ data: { customerId, name: "Demo Kontakt", phone: "4915100000999", status: "Neuer Lead", bezugAirtableId: "demo" } });
  leadId = lead.id;
  const s = new Date(Date.now() + 2 * 86400_000);
  apptId = (await echt.appointment.create({ data: { customerId, leadId, mode: "video", startsAt: s, endsAt: new Date(s.getTime() + 1800_000), status: "booked" } })).id;
  token = await signSession(sessionPayloadFor({ id: u.id, email: u.email, role: u.role, customerId, sessionVersion: u.sessionVersion } as never));
  for (const datei of actionDateien()) {
    const mod = (await import(datei)) as Record<string, unknown>;
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn === "function") aufrufe.push({ datei, name, fn: fn as Aufruf["fn"] });
    }
  }
}, 120_000);

afterAll(async () => {
  globalThis.fetch = fetchVorher;
  const { prisma: echt } = await vi.importActual<typeof import("@/lib/prisma")>("@/lib/prisma");
  await echt.appointment.deleteMany({ where: { customerId } }).catch(() => {});
  await echt.lead.deleteMany({ where: { customerId } }).catch(() => {});
  if (customerId) await echt.customer.delete({ where: { id: customerId } }).catch(() => {});
  void prisma;
  aufrufe = [];
});

describe("App-Demo: keine Server Action schreibt", () => {
  it("findet alle Server Actions des Kundenbereichs", () => {
    const dateien = new Set(aufrufe.map((a) => path.relative(ROOT, a.datei)));
    expect(dateien.size).toBeGreaterThanOrEqual(30);
    expect(dateien).toContain("src/app/buyer/actions.ts");
    expect(dateien).toContain("src/app/buyer/termine/[id]/vorbereitung/neu-actions.ts");
    expect(aufrufe.length).toBeGreaterThan(100);
  });

  it("Gegenprobe ohne Demo-Kennzeichen (echter Login): der Rekorder sieht Schreibzugriffe", async () => {
    spur.headers = new Headers({ "next-action": "abc", "content-type": "text/plain;charset=UTF-8" });
    spur.cookie = token;
    const r = await rufeAlleAuf();
    const schreibend = [...r.jeAction.values()].filter((n) => n > 0).length;
    console.log(`[app-demo] Gegenprobe: ${schreibend} von ${aufrufe.length} Actions versuchen mit echtem Login zu schreiben (${r.writes.length} Schreibversuche).`);
    expect(schreibend).toBeGreaterThan(10);
  }, 600_000);

  it("Demo-Anfrage (signiertes Kennzeichen, Next-Action, sogar mit echtem Login-Cookie): nichts geschrieben, nichts gesendet", async () => {
    spur.headers = new Headers({ [APP_DEMO_HEADER]: (await signiereDemoMarke(process.env.AUTH_SECRET))!, "next-action": "abc", "content-type": "text/plain;charset=UTF-8" });
    spur.cookie = token;
    const r = await rufeAlleAuf();
    const auffaellig = [...r.jeAction].filter(([, n]) => n > 0).map(([k]) => k);
    expect(auffaellig).toEqual([]);
    expect(r.writes, r.writes.join("\n")).toEqual([]);
    expect(r.fetches, r.fetches.join("\n")).toEqual([]);
    expect(ohneHarmlose(r.sonst), r.sonst.join("\n")).toEqual([]);
  }, 600_000);

  it("auch ohne Next-Action-Header (Demo-Sicht wie beim Rendern, Actions bekommen den Demo-Kontext): nichts geschrieben, nichts gesendet", async () => {
    spur.headers = new Headers({ [APP_DEMO_HEADER]: (await signiereDemoMarke(process.env.AUTH_SECRET))! });
    spur.cookie = token;
    const r = await rufeAlleAuf();
    const auffaellig = [...r.jeAction].filter(([, n]) => n > 0).map(([k]) => k);
    expect(auffaellig).toEqual([]);
    expect(r.writes, r.writes.join("\n")).toEqual([]);
    expect(r.fetches, r.fetches.join("\n")).toEqual([]);
    expect(ohneHarmlose(r.sonst), r.sonst.join("\n")).toEqual([]);
  }, 600_000);
});
