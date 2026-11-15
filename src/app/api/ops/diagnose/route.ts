import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Diagnose-API (Ole, 14.11.2026): feste, nur lesende Abfragen für die Fehlersuche in Produktion,
// damit Claude Zustände prüfen kann, ohne Datenbank-Zugang. Kein freies SQL, keine Geheimnisse,
// Lead-Daten nur so weit nötig (Name statt Telefon/E-Mail).
// Absicherung: eigener Lese-Schlüssel OPS_READ_TOKEN (≥ 32 Zeichen) als Bearer-Token.
//   GET /api/ops/diagnose?q=uebersicht|stripe|followups|vorlagen|demo|kunden|whatsapp|gedankenstriche|login&email=…|meta&page=…
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = (process.env.OPS_READ_TOKEN ?? "").trim();
  if (expected.length < 32) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const keyMode = (k: string | undefined) => {
  const v = (k ?? "").trim();
  if (!v) return "fehlt";
  if (/^(sk|rk)_live_/.test(v)) return "live";
  if (/^(sk|rk)_test_/.test(v)) return "test";
  return "unbekannt";
};

async function stripe() {
  const [kunden, mitStripe] = await Promise.all([
    prisma.customer.count({ where: { archived: false } }),
    prisma.customer.count({ where: { archived: false, stripeCustomerId: { not: null } } }),
  ]);
  return {
    schluessel: keyMode(process.env.STRIPE_SECRET_KEY),
    webhookSignatur: process.env.STRIPE_WEBHOOK_SECRET ? "gesetzt" : "fehlt",
    kunden,
    kundenMitStripeId: mitStripe,
  };
}

async function followups() {
  const rows = await prisma.salesFollowup.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      step: true,
      nextAt: true,
      mail1SentAt: true,
      lastError: true,
      source: true,
      timing: true,
      updatedAt: true,
      contact: { select: { id: true, name: true, stage: true } },
    },
  });
  return { anzahl: rows.length, autoSync: process.env.INSTANTLY_AUTO_SYNC === "1", instantlyKey: !!process.env.INSTANTLY_API_KEY, rows };
}

async function vorlagen() {
  const rows = await prisma.messageTemplate.findMany({
    orderBy: [{ customerId: "asc" }, { purpose: "asc" }],
    select: { customerId: true, purpose: true, name: true, status: true, updatedAt: true, customer: { select: { name: true, leadAddress: true } } },
  });
  return { anzahl: rows.length, rows };
}

async function demo() {
  const u = await prisma.user.findUnique({
    where: { email: "google-review-demo@performancegrowth.de" },
    select: { id: true, role: true, teamRole: true, customerId: true, lastLoginAt: true, customer: { select: { id: true, name: true, plan: true } } },
  });
  const c = await prisma.customer.findUnique({ where: { id: "cust_google_review_demo" }, select: { id: true, name: true, plan: true, newUi: true } });
  const leads = await prisma.lead.count({ where: { customerId: "cust_google_review_demo" } });
  const kalender = await prisma.calendarConnection.findUnique({ where: { customerId: "cust_google_review_demo" }, select: { status: true, provider: true, bookingSlug: true } });
  return { login: u, kunde: c, leads, kalender };
}

/** WhatsApp-Nummern und wo sie angebunden sind (ohne Schlüssel) */
async function whatsapp() {
  const rows = await prisma.whatsAppAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      phoneNumber: true,
      displayName: true,
      provider: true,
      status: true,
      phoneNumberId: true,
      updatedAt: true,
      customer: { select: { id: true, name: true } },
      _count: { select: { conversations: true } },
    },
  });
  const last = await prisma.conversation.groupBy({ by: ["whatsAppAccountId"], _max: { lastMessageAt: true } });
  return { anzahl: rows.length, rows, letzteNachricht: last };
}

/** Gespeicherte Texte mit Gedankenstrichen (Regel AGENTS.md): nur Anzahlen und Namen, keine Inhalte */
async function gedankenstriche() {
  const has = { contains: "–" } as const;
  const has2 = { contains: "—" } as const;
  const [neuigkeiten, vorlagen, signaturen, whatsapp] = await Promise.all([
    prisma.productUpdate.count({ where: { OR: [{ title: has }, { body: has }, { title: has2 }, { body: has2 }] } }),
    prisma.mailTemplate.count({ where: { OR: [{ subject: has }, { body: has }, { subject: has2 }, { body: has2 }] } }),
    prisma.user.count({ where: { OR: [{ mailSignature: has }, { mailSignature: has2 }] } }),
    prisma.messageTemplate.findMany({ where: { OR: [{ body: has }, { body: has2 }] }, select: { name: true, status: true, customer: { select: { name: true } } } }),
  ]);
  return { neuigkeiten, vorlagen, signaturen, whatsappVorlagen: whatsapp };
}

async function kunden() {
  return prisma.customer.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      plan: true,
      newUi: true,
      leadAddress: true,
      seatsIncluded: true,
      seatsBilled: true,
      existingCustomersEnabled: true,
      empfehlungEnabled: true,
      isTest: true,
      createdAt: true,
      _count: { select: { leads: true, users: true } },
    },
  });
}

async function uebersicht() {
  const [kundenAnz, leads, vertraege, logins, followupsAnz, vorlagenAnz] = await Promise.all([
    prisma.customer.count({ where: { archived: false } }),
    prisma.lead.count(),
    prisma.leadContract.count(),
    prisma.user.count(),
    prisma.salesFollowup.count(),
    prisma.messageTemplate.count(),
  ]);
  return { kunden: kundenAnz, leads, vertraege, logins, followups: followupsAnz, vorlagen: vorlagenAnz, abfragen: Object.keys(QUERIES) };
}

/**
 * Login einer E-Mail prüfen (Ole, 15.11.2026: Testkunde kommt nicht rein). Nur Befund, keine Hashes,
 * keine fremden Adressen: Login vorhanden (exakt normalisiert), Rolle, Kunde (Test, archiviert),
 * Fehlversuche (auch mit Leerzeichen statt „+“, wie bei URL-Kodierung), letztes Passwort-Setzen und letzter Login.
 */
async function login(params: URLSearchParams) {
  const raw = params.get("email") ?? "";
  const email = raw.trim().toLowerCase();
  if (!email) return { fehler: "email fehlt" };
  const variants = [...new Set([email, email.replace(/\+/g, " "), email.replace(/\+/g, "%2b"), raw])];
  const since15 = new Date(Date.now() - 15 * 60_000);
  const since24 = new Date(Date.now() - 24 * 60 * 60_000);
  const [users, similar] = await Promise.all([
    prisma.user.findMany({
      where: { email },
      select: {
        id: true,
        role: true,
        teamRole: true,
        customerId: true,
        createdAt: true,
        lastLoginAt: true,
        sessionVersion: true,
        totpEnabledAt: true,
        passwordHash: true,
        customer: { select: { id: true, isTest: true, archived: true, plan: true, onboarding: { select: { status: true, liveAt: true } } } },
      },
    }),
    prisma.user.count({ where: { email: { contains: email.split("@")[0].split("+")[0], mode: "insensitive" } } }),
  ]);
  const failed = async (since: Date) =>
    Object.fromEntries(
      await Promise.all(variants.map(async (v) => [v === email ? "exakt" : JSON.stringify(v), await prisma.auditLog.count({ where: { action: "login.failed", actorEmail: v, at: { gt: since } } })])),
    );
  const ids = users.map((u) => u.id);
  const [f15, f24, lastOk, pwSet] = await Promise.all([
    failed(since15),
    failed(since24),
    ids.length ? prisma.auditLog.findFirst({ where: { action: "login", entityId: { in: ids } }, orderBy: { at: "desc" }, select: { at: true } }) : null,
    ids.length
      ? prisma.auditLog.findMany({ where: { action: { in: ["user.password_reset", "user.create", "password.reset_self"] }, entityId: { in: ids } }, orderBy: { at: "desc" }, take: 5, select: { action: true, at: true } })
      : [],
  ]);
  return {
    eingabeNormalisiert: raw !== email ? "Eingabe wurde getrimmt/kleingeschrieben" : "unverändert",
    loginsExakt: users.length,
    aehnlicheLogins: similar,
    logins: users.map((u) => ({
      id: u.id,
      role: u.role,
      teamRole: u.teamRole,
      hatKunde: !!u.customerId,
      kundeGefunden: !!u.customer,
      kundeTest: u.customer?.isTest ?? null,
      kundeArchiviert: u.customer?.archived ?? null,
      plan: u.customer?.plan ?? null,
      onboarding: u.customer?.onboarding ? { status: u.customer.onboarding.status, live: !!u.customer.onboarding.liveAt } : null,
      angelegt: u.createdAt,
      letzterLogin: u.lastLoginAt,
      sessionVersion: u.sessionVersion,
      zweiFaktor: !!u.totpEnabledAt,
      hashArt: u.passwordHash.slice(0, 4),
    })),
    fehlversuche15Min: f15,
    fehlversuche24h: f24,
    sperreAb: 10,
    letzterErfolgreicherLogin: lastOk?.at ?? null,
    passwortEreignisse: pwSet,
  };
}

/**
 * Meta-Zugriff prüfen (Ole, 15.11.2026: Seite freigegeben, Prüfung sagt „kein Zugriff“): Berechtigungen des
 * System-User-Tokens (ohne Token-Wert), ob die Seite unter /me/accounts erscheint und ob Meta für die Seite
 * ein Seiten-Token und Leadformulare liefert. Nur ja/nein und Meta-Fehlertexte (Tokens geschwärzt).
 */
async function meta(params: URLSearchParams) {
  const { metaDiagnostics } = await import("@/lib/meta-leads");
  const d = await metaDiagnostics();
  const pageId = (params.get("page") ?? "").replace(/\D/g, "");
  const out: Record<string, unknown> = {
    appName: d.appName,
    scopes: d.scopes,
    fehlendeScopes: d.missing,
    fehler: d.error ?? null,
    seitenUnterMeAccounts: d.pages.length,
  };
  if (pageId) {
    const { checkPageForDiagnose } = await import("@/lib/selbst-einrichtung");
    out.seite = { inMeAccounts: d.pages.some((p) => p.id === pageId), ...(await checkPageForDiagnose(pageId)) };
  }
  return out;
}

const QUERIES: Record<string, (params: URLSearchParams) => Promise<unknown>> = { uebersicht, stripe, followups, vorlagen, demo, kunden, whatsapp, gedankenstriche, login, meta };

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const q = params.get("q") ?? "uebersicht";
  const fn = QUERIES[q];
  if (!fn) return Response.json({ error: "Unbekannte Abfrage", abfragen: Object.keys(QUERIES) }, { status: 400 });
  try {
    return Response.json({ q, at: new Date().toISOString(), data: await fn(params) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
