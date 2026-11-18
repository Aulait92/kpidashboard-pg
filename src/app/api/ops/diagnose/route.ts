import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeLoginEmail } from "@/lib/login-email";

// Diagnose-API (Ole, 14.11.2026): feste, nur lesende Abfragen für die Fehlersuche in Produktion,
// damit Claude Zustände prüfen kann, ohne Datenbank-Zugang. Kein freies SQL, keine Geheimnisse,
// Lead-Daten nur so weit nötig (Name statt Telefon/E-Mail).
// Absicherung: eigener Lese-Schlüssel OPS_READ_TOKEN (≥ 32 Zeichen) als Bearer-Token.
//   GET /api/ops/diagnose?q=variablen|uebersicht|stripe|followups|vorlagen|demo|kunden|whatsapp|d360|gedankenstriche|login&email=…|meta&page=…|capi|ppl|hvk[&neu=1]|instantly[&email=…|&name=…|&nachholen=1]|instantly-auswertung|vertrieb-termine[&seit=YYYY-MM-DD][&link=1]
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

/** Letzte nicht zugestellte WhatsApp-Nachrichten (Ole, 17.11.2026): Meta-Fehlercode, Zweck, Kunde; ohne Nummer und Inhalt */
async function zustellfehler() {
  const rows = await prisma.message.findMany({
    where: { direction: "outbound", status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { createdAt: true, kind: true, purpose: true, variant: true, errorCode: true, errorTitle: true, sentBy: true, conversation: { select: { customer: { select: { name: true } } } } },
  });
  return rows.map((r) => ({ at: r.createdAt, kunde: r.conversation.customer.name, kind: r.kind, purpose: r.purpose, variant: r.variant, sentBy: r.sentBy, errorCode: r.errorCode, errorTitle: r.errorTitle }));
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
  // „+“ unkodiert in der URL kommt als Leerzeichen an: gleiche Normalisierung wie beim Login
  const email = normalizeLoginEmail(raw);
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
    eingabeNormalisiert: raw !== email ? "Eingabe wurde normalisiert (getrimmt, kleingeschrieben, Leerzeichen → „+“)" : "unverändert",
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

/**
 * Pay-per-Lead (nur lesend): Bezüge mit Filtern, Lieferweg (E-Mail nur Domain), Gebieten und
 * Geliefertem im laufenden Monat, dazu Eingang der letzten 48 Stunden je Status. Keine Lead-Kontaktdaten.
 */
async function ppl() {
  const { monthRange } = await import("@/lib/ppl/periods");
  const { start, end } = monthRange(new Date());
  const domains = (s: string | null) => [...new Set((s ?? "").split(/[,;\s]+/).filter(Boolean).map((a) => a.split("@")[1] ?? "?"))];
  const subs = await prisma.leadSubscription.findMany({
    orderBy: [{ productKey: "asc" }, { createdAt: "asc" }],
    include: { customer: { select: { name: true, dormantSince: true } }, areas: true },
  });
  const rows = [];
  for (const s of subs) {
    const geliefertMonat = await prisma.lead.count({ where: { subscriptionId: s.id, deliveredAt: { gte: start, lt: end } } });
    const gebiete = [];
    for (const a of s.areas) {
      const geliefert = await prisma.poolLead.count({ where: { areaId: a.id, status: "delivered", deliveredAt: { gte: start, lt: end } } });
      gebiete.push({ id: a.id, label: a.label, menge: a.quantity, zeitraum: a.period, geliefertMonat: geliefert, plz: a.plzRanges.slice(0, 80) });
    }
    rows.push({
      id: s.id,
      kunde: s.customer.name,
      ruhend: !!s.customer.dormantSince,
      label: s.label,
      produkt: s.productKey,
      aktiv: s.active,
      status: s.status,
      zeitraum: s.period,
      ziel: s.goal,
      start: s.startDate,
      preis: s.price,
      geliefertMonat,
      lieferung: s.delivery,
      mailDomains: domains(s.deliveryEmail),
      mailFormat: s.emailFormat,
      vorlage: !!s.emailTemplate,
      plz: s.plzRanges?.slice(0, 80) ?? null,
      schwachOk: s.acceptWeak,
      schwachGrenze: s.weakThreshold,
      beamteOk: s.acceptCivilServants,
      nurSchwache: s.onlyWeak,
      gesEin: s.insurerInclude.length,
      gesAus: s.insurerExclude.length,
      regeln: s.excludeRules,
      storno: { tage: s.stornoDays, auto: s.stornoAutoApprove },
      slack: s.slackNotify,
      airtable: !!s.airtableId,
      gebiete,
    });
  }
  const since = new Date(Date.now() - 48 * 3600_000);
  const eingang = await prisma.poolLead.groupBy({ by: ["productKey", "status", "via"], where: { createdAt: { gte: since } }, _count: true });
  return { monat: { start, end }, bezuege: rows, eingang48h: eingang };
}

/**
 * Instantly (Ole, 16.11.2026: Antwort von Christina Dröge fehlte im CRM). Nur lesend, nie Schlüssel, keine Mailinhalte:
 * Konfiguration (ja/nein), Kampagnen im CRM (ignoriert?), unsere Postfächer mit letzter Antwort, letzter Abgleich
 * (Antworten mit Instantly-ID = Abgleich, ohne = Webhook), Postfächer, Kampagnen und Webhooks laut Instantly.
 *   &email=…   Kontakt zur Adresse (Id, Name, Stufe, Daten), Antworten (Zeitpunkte, Postfach, Weg), Follow-up und
 *              die Mails dieser Adresse laut Instantly (IDs, Zeitpunkte, Postfach, ob im CRM)
 *   &name=…    Treffer der Kontaktsuche (umlaut-tolerant) mit Id, Name, Stufe
 *   &nachholen=1  Vorschau „Antworten nachholen“ (90 Tage), nur Zahlen je Postfach
 */
async function instantly(params: URLSearchParams) {
  const hasKey = !!process.env.INSTANTLY_API_KEY;
  const [kampagnen, postfaecher, letzteAbgleich, letzterWebhook, letzteAntwort] = await Promise.all([
    prisma.salesCampaign.findMany({
      orderBy: { createdAt: "desc" },
      select: { name: true, instantlyId: true, ignored: true, createdAt: true, _count: { select: { leads: true } } },
    }),
    prisma.salesEmail.groupBy({ by: ["eaccount"], where: { direction: "IN" }, _count: true, _max: { sentAt: true, createdAt: true } }),
    prisma.salesEmail.findFirst({ where: { direction: "IN", instantlyId: { not: null } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, sentAt: true } }),
    prisma.salesEmail.findFirst({ where: { direction: "IN", instantlyId: null, NOT: { campaign: "manuell" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, sentAt: true } }),
    prisma.salesEmail.findFirst({ where: { direction: "IN" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, sentAt: true } }),
  ]);
  const out: Record<string, unknown> = {
    konfiguration: {
      apiKey: hasKey,
      autoSync: process.env.INSTANTLY_AUTO_SYNC === "1",
      webhookToken: !!process.env.VERTRIEB_WEBHOOK_TOKEN,
      sperrlisteVariable: !!process.env.VERTRIEB_SPERRLISTE,
    },
    abgleich: { letzteAntwortGespeichert: letzteAntwort, letzteUeberAbgleich: letzteAbgleich, letzteUeberWebhook: letzterWebhook, takt: "alle 15 Minuten (Cron), Webhook sofort" },
    kampagnenImCrm: kampagnen.map((c) => ({ name: c.name, instantlyId: !!c.instantlyId, ignoriert: c.ignored, leads: c._count.leads, angelegt: c.createdAt })),
    postfaecherMitAntworten: postfaecher
      .map((p) => ({ postfach: p.eaccount ?? "(unbekannt)", antworten: p._count, letzteAntwort: p._max.sentAt, zuletztGespeichert: p._max.createdAt }))
      .sort((a, b) => String(b.letzteAntwort).localeCompare(String(a.letzteAntwort))),
  };
  if (hasKey) {
    const { instantlyRead, listCampaigns } = await import("@/lib/vertrieb/instantly");
    const safe = async <T,>(fn: () => Promise<T>) => fn().catch((e: unknown) => ({ fehler: e instanceof Error ? e.message.slice(0, 200) : "Fehler" }));
    out.instantly = {
      postfaecher: await safe(async () => {
        const items: { email?: string; status?: number }[] = [];
        let after: string | undefined;
        do {
          const q = new URLSearchParams({ limit: "100" });
          if (after) q.set("starting_after", after);
          const page = await instantlyRead<{ items: { email?: string; status?: number }[]; next_starting_after?: string }>(`/accounts?${q}`);
          items.push(...page.items);
          after = page.items.length ? page.next_starting_after : undefined;
        } while (after && items.length < 1000);
        return items.map((a) => ({ email: a.email, status: a.status }));
      }),
      kampagnen: await safe(async () => {
        const stored = new Map(kampagnen.filter((c) => c.instantlyId).map((c) => [c.instantlyId!, c]));
        return (await listCampaigns()).map((c) => ({ name: c.name, status: c.status ?? null, imCrm: stored.has(c.id), ignoriert: stored.get(c.id)?.ignored ?? null }));
      }),
      webhooks: await safe(async () => {
        const page = await instantlyRead<{ items?: Record<string, unknown>[] }>("/webhooks?limit=100");
        return (page.items ?? []).map((w) => {
          const url = typeof w.target_hook_url === "string" ? w.target_hook_url : "";
          let ziel = "?";
          try {
            const u = new URL(url);
            ziel = `${u.host}${u.pathname}${u.searchParams.has("token") ? " (mit Token)" : ""}`;
          } catch {}
          return { ereignis: w.event_type ?? null, kampagne: w.campaign ?? null, ziel, aktiv: w.status ?? null };
        });
      }),
    };
  }

  const email = (params.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const { findContactIdByEmail } = await import("@/lib/vertrieb/contact-merge");
    const id = await findContactIdByEmail(email);
    const c = id
      ? await prisma.salesContact.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            stage: true,
            createdAt: true,
            updatedAt: true,
            activities: { orderBy: { occurredAt: "desc" }, take: 15, select: { type: true, outcome: true, occurredAt: true } },
            emails: { where: { direction: "IN" }, orderBy: { sentAt: "desc" }, select: { sentAt: true, createdAt: true, eaccount: true, campaign: true, sentiment: true, isAutoReply: true, instantlyId: true } },
            followups: { orderBy: { createdAt: "desc" }, select: { status: true, source: true, nextAt: true, createdAt: true } },
            campaigns: { select: { replyCount: true, interest: true, sentAt: true, lastReplyAt: true, campaign: { select: { name: true, ignored: true } } } },
          },
        })
      : null;
    const kontakt = c && {
      ...c,
      emails: c.emails.map(({ instantlyId, ...e }) => ({ ...e, weg: instantlyId ? "Abgleich" : e.campaign === "manuell" ? "von Hand" : "Webhook" })),
    };
    let inInstantly: unknown = null;
    if (hasKey) {
      const { listEmails } = await import("@/lib/vertrieb/instantly");
      inInstantly = await listEmails(new URLSearchParams({ lead: email, limit: "20", sort_order: "desc" }))
        .then(async (page) =>
          Promise.all(
            page.items.map(async (e) => ({
              id: e.id,
              zeitpunkt: e.timestamp_email || e.timestamp_created,
              postfach: e.eaccount ?? null,
              kampagneImCrm: e.campaign_id ? (kampagnen.find((k) => k.instantlyId === e.campaign_id)?.name ?? "unbekannt") : null,
              typ: e.ue_type,
              automatisch: e.is_auto_reply === 1,
              interesse: e.i_status ?? null,
              imCrm: !!(await prisma.salesEmail.findUnique({ where: { instantlyId: e.id }, select: { id: true } })),
            })),
          ),
        )
        .catch((e: unknown) => ({ fehler: e instanceof Error ? e.message.slice(0, 200) : "Fehler" }));
    }
    out.adresse = { gesperrt: (await import("@/lib/vertrieb/sperrliste")).emailGesperrt(email), kontakt, inInstantly };
  }

  const name = (params.get("name") ?? "").trim();
  if (name) {
    const { kontaktSucheWhere } = await import("@/lib/vertrieb/suche");
    out.suche = await prisma.salesContact.findMany({ where: kontaktSucheWhere(name), take: 10, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, stage: true, createdAt: true } });
  }

  if (params.get("nachholen") === "1" && hasKey) {
    const { nachholenAntworten } = await import("@/lib/vertrieb/instantly-nachholen");
    const { liste, ...zahlen } = await nachholenAntworten({ anwenden: false });
    out.nachholenVorschau = { ...zahlen, beispiele: liste.length };
  }
  return out;
}

/**
 * Instantly-Auswertung je Kampagne und Postfach (docs/instantly-auswertung.md): nur Zahlen und Kategorien, keine
 * Mailtexte, keine Kontaktadressen. Antworttexte werden nur im Speicher für die Einwand-Kategorien gelesen.
 * Ausgabe zusätzlich als Markdown (data.markdown).
 */
async function instantlyAuswertung() {
  const { auswerten, alsMarkdown } = await import("@/lib/vertrieb/instantly-auswertung");
  const { stripQuoted } = await import("@/lib/vertrieb/instantly");
  const [kampagnen, leads, mails, termine] = await Promise.all([
    prisma.salesCampaign.findMany({ select: { id: true, name: true, ignored: true } }),
    prisma.salesCampaignLead.findMany({
      select: { contactId: true, campaignId: true, sentAt: true, openCount: true, lastOpenAt: true, replyCount: true, lastReplyAt: true, bounced: true, unsubscribed: true, interest: true },
    }),
    prisma.salesEmail.findMany({
      where: { direction: "IN" },
      select: { contactId: true, campaign: true, eaccount: true, subject: true, text: true, sentiment: true, isAutoReply: true, sentAt: true },
    }),
    prisma.salesMeeting.findMany({ select: { contactId: true, status: true, createdAt: true } }),
  ]);
  const antworten = mails.map((m) => ({
    ...m,
    // Text nur für Absagen/Später (Einwand-Kategorien), sonst gar nicht weitergeben
    text: m.sentiment === "NEGATIV" || m.sentiment === "SPAETER" ? stripQuoted(m.text ?? "") : null,
  }));
  const ergebnis = auswerten({ kampagnen, leads, antworten, termine });
  return { ...ergebnis, markdown: alsMarkdown(ergebnis) };
}

/**
 * HvK-Abrechnungen je Rechnung (nur Zahlen, keine Namen/Telefonnummern): geliefert, abgerechnet, Differenz, Stornos
 * auto/offen. &neu=1: Vorschau des Neuabgleichs (reabgleichHvk dryRun, schreibt nichts).
 */
async function hvk(params: URLSearchParams) {
  const rows = await prisma.hvkInvoice.findMany({
    orderBy: { periodStart: "asc" },
    select: { invoiceNo: true, periodStart: true, periodEnd: true, deliveredCount: true, boughtCount: true, netCents: true, source: true, reklamationen: { select: { status: true } } },
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const count = (r: (typeof rows)[number], ...s: string[]) => r.reklamationen.filter((k) => s.includes(k.status)).length;
  const out: Record<string, unknown> = {
    anzahl: rows.length,
    rechnungen: rows.map((r) => ({
      invoiceNo: r.invoiceNo,
      zeitraum: `${iso(r.periodStart)}..${iso(r.periodEnd)}`,
      geliefert: r.deliveredCount,
      abgerechnet: r.boughtCount,
      differenz: r.deliveredCount - r.boughtCount,
      stornoAuto: count(r, "auto", "erledigt"),
      stornoOffen: count(r, "offen"),
      verworfen: count(r, "verworfen"),
      nettoCent: r.netCents,
      quelle: r.source,
    })),
  };
  if (params.get("neu") === "1") {
    const { reabgleichHvk } = await import("@/lib/ppl/hvk-abrechnung-server");
    const s = await reabgleichHvk({ dryRun: true });
    out.neuabgleich = {
      summen: s.totals,
      wochen: s.weeks.map((w) => ({
        invoiceNo: w.invoiceNo,
        zeitraum: `${w.periodStart}..${w.periodEnd}`,
        geliefert: w.delivered,
        geliefertVorher: w.deliveredBefore,
        abgerechnet: w.billed,
        differenz: w.diff,
        nichtAbgerechnet: w.unbilled,
        nichtVonUns: w.foreign,
        stornoNeu: w.stornoNew,
        stornoBisher: w.stornoBefore,
        offen: w.open,
        aendertSich: w.changed,
        fehler: w.errors.length,
      })),
    };
  }
  return out;
}

/** Pflichtvariablen: nur Status je Name, nie Werte (lib/env-check.ts). */
async function variablen() {
  const { pruefeVariablen } = await import("@/lib/env-check");
  return pruefeVariablen();
}

/**
 * WhatsApp zu Vertriebsterminen (Support-Nummer): gesendete Bestätigungen und Erinnerungen seit 11.11.2026 (bzw. &seit=YYYY-MM-DD)
 * mit Termin, Quelle, Art, Zustellstatus und Auffälligkeiten. &link=1: Verschieben-Link der letzten 3 Termine gültig ja/nein.
 * Ohne Telefonnummern, Nachnamen, Inhalte und Tokens (lib/vertrieb/termin-whatsapp-diagnose.ts).
 */
async function vertriebTermine(params: URLSearchParams) {
  const { berlinMidnight } = await import("@/lib/absence");
  const { diagnoseVertriebTermine } = await import("@/lib/vertrieb/termin-whatsapp-diagnose");
  const seit = params.get("seit") ?? "";
  return diagnoseVertriebTermine({ seit: berlinMidnight(/^\d{4}-\d{2}-\d{2}$/.test(seit) ? seit : "2026-11-11"), link: params.get("link") === "1" });
}

const QUERIES: Record<string, (params: URLSearchParams) => Promise<unknown>> = { zustellfehler, variablen, uebersicht, stripe, followups, vorlagen, demo, kunden, whatsapp, d360, d360webhook, angebote, gedankenstriche, login, meta, capi, ppl, hvk, instantly, "instantly-auswertung": instantlyAuswertung, "vertrieb-termine": vertriebTermine, kette: async (p) => (await import("@/lib/ops/kette")).kette(p), "ki-eu": async () => (await import("@/lib/ki-eu")).kiEuStatus(), "kunde-abrechnung": async (p) => (await import("@/lib/ops/kunde-abrechnung")).kundeAbrechnung(p) };

// Weitere Abfragen in eigenen Modulen (nur lesend)
//   q=anzeige-abdeckung[&rueckfuellung=1]  Anzeige am Lead und Kosten je Anzeige je Kunde ab Startdatum (lib/ops/anzeige-abdeckung.ts)
//   q=vermittler-anrede[&alle=1]  Kunden ohne Anrede in den Anbieterangaben, nur ID und Name (lib/ops/vermittler-anrede.ts)
//   q=admin-nutzung[&tage=30]              Nutzung des Admins: Änderungsprotokoll je Aktion, Klicks je Funktion und Seite, nur Zahlen (lib/ops/admin-nutzung.ts)
const WEITERE: Record<string, (params: URLSearchParams) => Promise<unknown>> = {
  "anzeige-abdeckung": async (p) => (await import("@/lib/ops/anzeige-abdeckung")).anzeigeAbdeckung(p),
  "vermittler-anrede": async (p) => (await import("@/lib/ops/vermittler-anrede")).vermittlerAnrede(p),
  "admin-nutzung": async (p) => (await import("@/lib/ops/admin-nutzung")).adminNutzung(p),
};

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const q = params.get("q") ?? "uebersicht";
  const fn = QUERIES[q] ?? WEITERE[q];
  if (!fn) return Response.json({ error: "Unbekannte Abfrage", abfragen: [...Object.keys(QUERIES), ...Object.keys(WEITERE)] }, { status: 400 });
  try {
    return Response.json({ q, at: new Date().toISOString(), data: await fn(params) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
