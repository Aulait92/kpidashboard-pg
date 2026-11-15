import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Diagnose-API (Ole, 14.11.2026): feste, nur lesende Abfragen für die Fehlersuche in Produktion,
// damit Claude Zustände prüfen kann, ohne Datenbank-Zugang. Kein freies SQL, keine Geheimnisse,
// Lead-Daten nur so weit nötig (Name statt Telefon/E-Mail).
// Absicherung: eigener Lese-Schlüssel OPS_READ_TOKEN (≥ 32 Zeichen) als Bearer-Token.
//   GET /api/ops/diagnose?q=uebersicht|stripe|followups|vorlagen|demo|kunden|whatsapp|d360|gedankenstriche|login&email=…|meta&page=…|capi
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

/** Offene Angebote (Entwurf/versendet) mit mehr als einem Produkt: enthalten ggf. noch Setup für weitere Produkte (bis 15.11.2026: 990 € je weiterem). */
async function angebote() {
  const rows = await prisma.offer.findMany({
    where: { status: { in: ["draft", "sent"] } },
    orderBy: { createdAt: "asc" },
    select: { number: true, status: true, company: true, contactName: true, products: true, setupFee: true, term: true, createdAt: true },
  });
  return rows
    .map((o) => ({ ...o, produkte: Array.isArray(o.products) ? o.products.length : 0, products: undefined }))
    .filter((o) => o.produkte > 1);
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

/**
 * Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026): Kunden mit Status (aktiv, Dataset gesetzt),
 * Ereignisse je Status der letzten 7 Tage und letzte Fehler gekürzt. Ohne Lead-IDs.
 */
async function capi() {
  const { capiDiagnose } = await import("@/lib/capi/server");
  return capiDiagnose();
}

/**
 * 360dialog-Nummern unter unserem Partner (Partner-API, neueste zuerst), Ole 15.11.2026: Status je Nummer, um
 * hängende Verbindungen (z. B. 404 beim Webhook) zu klären. Nur Status-Felder, keine Schlüssel, E-Mail gekürzt.
 */
async function d360() {
  const { partnerConfig } = await import("@/lib/whatsapp/dialog360-partner");
  const cfg = partnerConfig();
  if (!cfg) return { fehler: "Partner-Zugang nicht eingerichtet" };
  const url = new URL(`${cfg.hubUrl}/api/v2/partners/${encodeURIComponent(cfg.partnerId)}/channels`);
  url.searchParams.set("sort", "-created_at");
  url.searchParams.set("limit", "10");
  const res = await fetch(url, { headers: { "X-API-Key": cfg.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return { fehler: `360dialog ${res.status}`, text: (await res.text()).slice(0, 300) };
  const json = (await res.json()) as { partner_channels?: Record<string, unknown>[] };
  const mask = (e: unknown) => (typeof e === "string" ? e.replace(/^(.).*(@.*)$/, "$1…$2") : null);
  const pick = (o: unknown, keys: string[]) =>
    o && typeof o === "object" ? Object.fromEntries(keys.filter((k) => k in (o as object)).map((k) => [k, (o as Record<string, unknown>)[k]])) : null;
  return (json.partner_channels ?? []).map((c) => {
    const client = c.client as Record<string, unknown> | undefined;
    return {
      id: c.id,
      created_at: c.created_at,
      status: c.status,
      availability_status: c.availability_status,
      account_mode: c.account_mode,
      is_migrated: c.is_migrated,
      terminated_at: c.terminated_at,
      setup_info: pick(c.setup_info, ["phone_number", "phone_name"]),
      waba_account: pick(c.waba_account, ["id", "status", "external_id", "on_behalf_of_business_info", "fb_account_status", "namespace"]),
      integration: pick(c.integration, ["state", "app_id", "enabled"]),
      client: client ? { id: client.id, name: client.name, status: client.status, partner_payload: client.partner_payload, email: mask((client.contact_info as Record<string, unknown> | undefined)?.email) } : null,
      has_inbox: c.has_inbox,
      hub_status: c.hub_status,
      version: c.version,
      is_oba: c.is_oba,
      is_on_biz_app: c.is_on_biz_app,
      settings_keys: c.settings && typeof c.settings === "object" ? Object.keys(c.settings) : null,
      felder: Object.keys(c),
    };
  });
}

/**
 * Webhook-Probe (nur lesend): GET /v1/configs/webhook mit dem gespeicherten Key jedes 360dialog-Kontos.
 * Zeigt Basis-Adresse (ohne Pfad-Geheimnisse), Status-Code und Antwort gekürzt, nie den Key.
 */
async function d360webhook() {
  const { decryptSecret } = await import("@/lib/encryption");
  const raw = process.env.DIALOG360_BASE_URL;
  const base = raw ?? "https://waba-v2.360dialog.io";
  const accounts = await prisma.whatsAppAccount.findMany({ where: { apiKeyEnc: { not: null } }, select: { id: true, status: true, phoneNumber: true, apiKeyEnc: true, customer: { select: { name: true } } } });
  const out = [];
  for (const a of accounts) {
    const key = decryptSecret(a.apiKeyEnc!);
    const probe = async (path: string) => {
      try {
        const r = await fetch(`${base}${path}`, { headers: { "D360-API-KEY": key }, signal: AbortSignal.timeout(10_000) });
        const t = (await r.text()).replace(/token=[^&"\s]+/g, "token=…").slice(0, 300);
        return { status: r.status, body: t };
      } catch (e) {
        return { error: e instanceof Error ? e.message.slice(0, 120) : "Fehler" };
      }
    };
    out.push({ kunde: a.customer.name, status: a.status, nummer: a.phoneNumber, configsWebhook: await probe("/v1/configs/webhook"), wabaWebhook: await probe("/waba_webhook"), phoneNumbers: await probe("/phone_numbers") });
  }
  return { baseUrl: base.replace(/\/\/([^/@]*@)/, "//"), baseAusVariable: raw !== undefined, konten: out };
}

const QUERIES: Record<string, (params: URLSearchParams) => Promise<unknown>> = { uebersicht, stripe, followups, vorlagen, demo, kunden, whatsapp, d360, d360webhook, angebote, gedankenstriche, login, meta, capi };

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
