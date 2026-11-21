// Testdaten für den neuen Admin (/admin/neu), nur für die LOKALE Datenbank (Admin-Umbau, 19.11.2026).
// Legt realistische, frei erfundene Daten für alle Bereiche an: Kunden (Software und Betreuung, verschiedene Status,
// Abrechnung, Produkte), Leads mit Verlauf, Vertriebskontakte in mehreren Stufen mit Aufgaben (heute fällig,
// überfällig), Termine, Angebote, Pay-per-Lead-Käufer und Bezüge, Werbekonten und Kosten, Umsätze, offene Posten,
// WhatsApp-Chats und Monatsberichte. Dazu ein Vermittler-Login (vermittler@test.local, Kennwort wie der Admin).
//
//   npx vite-node --config vitest.config.ts tools/admin-neu/testdaten.ts
//
// Idempotent: feste ids (Präfix td_), upsert. Datumswerte sind relativ zu „jetzt“ und werden bei jedem Lauf
// aufgefrischt. Bricht ab, wenn DATABASE_URL nicht auf localhost zeigt. Namen, Nummern (0151 00000…) und
// E-Mails (@example.com) sind erfunden.
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Abbruch: DATABASE_URL zeigt nicht auf localhost. Testdaten nur lokal.");
  process.exit(1);
}

const DAY = 24 * 3600_000;
const now = new Date();
const tage = (n: number) => new Date(now.getTime() + n * DAY);
const stunden = (n: number) => new Date(now.getTime() + n * 3600_000);
const monat = (offset: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const tel = (i: number) => `+4915100000${String(100 + i).slice(-3)}`;

type Kunde = {
  id: string;
  name: string;
  plan: "software" | "service";
  stufe: "VERTRAG" | "ONBOARDING" | "TEST" | "AKTIV" | "PAUSIERT" | "GEKUENDIGT";
  retainer: number | null;
  seit: number; // Tage
  extra?: Record<string, unknown>;
};

const KUNDEN: Kunde[] = [
  { id: "td_k1", name: "Allianz Petra Hoffmann", plan: "software", stufe: "AKTIV", retainer: 299, seit: 140, extra: { billingDay: 1 } },
  { id: "td_k2", name: "Signal Iduna Jonas Weber", plan: "service", stufe: "AKTIV", retainer: 1490, seit: 210, extra: { stornoQuote: 0.08 } },
  { id: "td_k3", name: "Allianz Sabine Krüger", plan: "service", stufe: "AKTIV", retainer: 990, seit: 95, extra: { paymentOverdueSince: tage(-12) } },
  { id: "td_k4", name: "Maklerbüro Yilmaz", plan: "software", stufe: "ONBOARDING", retainer: 299, seit: 6, extra: { vermittlerTyp: "makler" } },
  { id: "td_k5", name: "HUK Thomas Becker", plan: "service", stufe: "PAUSIERT", retainer: 790, seit: 300 },
  { id: "td_k6", name: "Allianz Lena Schulz", plan: "software", stufe: "GEKUENDIGT", retainer: 299, seit: 260, extra: { cancelRequestedAt: tage(-20), cancelEffectiveAt: tage(10), cancelReason: "zu wenig Zeit" } },
  { id: "td_k7", name: "ERGO Markus Wagner", plan: "service", stufe: "TEST", retainer: null, seit: 14 },
  { id: "td_k8", name: "Versicherungsbüro Neumann", plan: "software", stufe: "AKTIV", retainer: 399, seit: 60, extra: { vermittlerTyp: "makler", billingInterval: "year" } },
];

const LEAD_NAMEN = ["Anna Richter", "Tobias Klein", "Julia Wolf", "Daniel Schröder", "Laura Neumann", "Felix Schwarz", "Sarah Zimmermann", "Lukas Braun", "Marie Hofmann", "Jan Hartmann", "Katharina Lange", "Philipp Werner"];
const LEAD_STATUS = ["Neuer Lead", "Nicht erreicht", "Im Gespräch", "In Beratung", "Angebot gesendet", "Abschluss", "Kein Interesse", "In Beratung", "Neuer Lead", "Abschluss", "Nicht erreicht", "Disqualifiziert"];

async function produkte() {
  const liste = [
    { id: "td_p_haftpflicht", name: "Privathaftpflicht", slug: "haftpflicht" },
    { id: "td_p_bu", name: "Berufsunfähigkeit", slug: "bu" },
    { id: "td_p_pkv", name: "Private Krankenversicherung", slug: "pkv" },
    { id: "td_p_tier", name: "Tierversicherung", slug: "tier" },
  ];
  for (const [i, p] of liste.entries()) {
    await prisma.product.upsert({ where: { id: p.id }, create: { ...p, sortOrder: i }, update: { name: p.name, slug: p.slug, sortOrder: i } });
  }
  return liste;
}

async function kunden(prods: { id: string }[]) {
  for (const [i, k] of KUNDEN.entries()) {
    const data = {
      name: k.name,
      plan: k.plan,
      isTest: false,
      newUi: true,
      createdAt: tage(-k.seit),
      retainerMonthly: k.retainer,
      retainerStart: k.retainer ? tage(-k.seit + 7) : null,
      archived: false,
      leadEmail: false,
      mailFeaturesOff: true,
      capiEnabled: false,
      metaAdAccountId: k.plan === "service" ? `act_td_${i + 1}` : null,
      dormantSince: k.stufe === "PAUSIERT" ? tage(-25) : null,
      ...(k.extra ?? {}),
    };
    await prisma.customer.upsert({ where: { id: k.id }, create: { id: k.id, ...data }, update: data });

    // Vertriebskontakt des Kunden (Kunden-Pipeline)
    const sc = {
      name: k.name.replace(/^(Allianz|Signal Iduna|HUK|ERGO)\s+/, ""),
      email: `kunde${i + 1}@example.com`,
      phone: tel(i),
      city: ["Hamburg", "Köln", "München", "Berlin", "Leipzig", "Bremen", "Hannover", "Dortmund"][i],
      insurer: k.name.split(" ")[0],
      stage: "GEWONNEN" as const,
      customerStage: k.stufe,
      customerSince: tage(-k.seit),
      monthlyValue: k.retainer ?? 0,
      products: k.plan === "service" ? "Leads + Software" : "Software",
      customerId: k.id,
    };
    await prisma.salesContact.upsert({ where: { id: `td_sck_${i + 1}` }, create: { id: `td_sck_${i + 1}`, ...sc }, update: sc });

    // Einrichtung
    const ob = {
      customerId: k.id,
      package: k.plan === "service" ? "betreuung" : "software",
      status: k.stufe === "ONBOARDING" || k.stufe === "TEST" ? "running" : "done",
      startDate: tage(-k.seit),
      liveAt: k.stufe === "ONBOARDING" ? null : tage(-k.seit + 10),
    };
    await prisma.onboarding.upsert({ where: { customerId: k.id }, create: { id: `td_ob_${i + 1}`, ...ob }, update: ob });

    // Produkte (Betreuung)
    if (k.plan === "service") {
      for (const p of prods.slice(0, i % 2 === 0 ? 2 : 1)) {
        const cp = { customerId: k.id, productId: p.id, leadGoal: 20 + i * 5, leadPrice: 39 + i * 3, startDate: tage(-k.seit + 10) };
        await prisma.customerProduct.upsert({ where: { customerId_productId: { customerId: k.id, productId: p.id } }, create: cp, update: cp });
      }
    }

    // Pause
    if (k.stufe === "PAUSIERT") {
      await prisma.customerPause.upsert({ where: { id: "td_pause_5" }, create: { id: "td_pause_5", customerId: k.id, startsAt: tage(-25) }, update: { startsAt: tage(-25) } });
    }

    // WhatsApp-Konto
    if (k.stufe !== "ONBOARDING") {
      const wa = { customerId: k.id, status: "connected", phoneNumber: tel(50 + i), displayName: `${sc.name} Versicherungen` };
      await prisma.whatsAppAccount.upsert({ where: { customerId: k.id }, create: { id: `td_wa_${i + 1}`, ...wa }, update: wa });
    }

    // Umsätze der letzten 4 Monate
    if (k.retainer && k.stufe !== "ONBOARDING") {
      for (let m = 1; m <= 4; m++) {
        if (m * 30 > k.seit) break;
        const id = `td_mr_${i + 1}_${m}`;
        const mr = { month: monat(-m), customerId: k.id, amount: k.retainer, kind: "retainer", note: "Testdaten" };
        await prisma.manualRevenue.upsert({ where: { id }, create: { id, ...mr }, update: mr });
      }
    }
  }
}

async function leads() {
  let n = 0;
  for (const [ki, k] of KUNDEN.entries()) {
    if (k.stufe === "ONBOARDING") continue;
    const anzahl = k.plan === "service" ? 10 : 6;
    for (let j = 0; j < anzahl; j++) {
      const id = `td_l_${ki + 1}_${j + 1}`;
      const name = LEAD_NAMEN[(ki * 3 + j) % LEAD_NAMEN.length];
      const status = LEAD_STATUS[(ki + j) % LEAD_STATUS.length];
      const created = tage(-(j * 4 + ki));
      const abschluss = status === "Abschluss";
      const data = {
        customerId: k.id,
        name,
        phone: tel(200 + ki * 20 + j),
        email: `lead${ki + 1}${j + 1}@example.com`,
        source: j % 3 === 0 ? "Meta" : "Formular",
        status,
        createdAt: created,
        statusChangedAt: tage(-(j * 2)),
        reached: !["Neuer Lead", "Nicht erreicht"].includes(status),
        closedAt: abschluss || status === "Kein Interesse" ? tage(-j) : null,
        closeValue: abschluss ? 1200 + j * 150 : null,
        followUpAt: ["Nicht erreicht", "In Beratung", "Angebot gesendet"].includes(status) ? tage(j % 2 === 0 ? 0 : -1) : null,
        adCampaignName: k.plan === "service" ? "Haftpflicht Leads Herbst" : null,
        acquisitionCost: k.plan === "service" ? 38 : 0,
        stornoState: k.id === "td_k2" && j === 3 ? "requested" : null,
        stornoReason: k.id === "td_k2" && j === 3 ? "Falsche Telefonnummer" : null,
        stornoRequestedAt: k.id === "td_k2" && j === 3 ? tage(-1) : null,
        formData: [{ label: "Versicherungsinteresse", value: j % 2 ? "Berufsunfähigkeit" : "Haftpflicht" }],
      };
      await prisma.lead.upsert({ where: { id }, create: { id, ...data }, update: data });
      const verlauf = [
        { kind: "status", text: "Neue Anfrage eingegangen" },
        ...(data.reached ? [{ kind: "anruf", text: "Telefonat geführt, Bedarf besprochen" }] : [{ kind: "anruf", text: "Nicht erreicht" }]),
        ...(abschluss ? [{ kind: "abschluss", text: `Abschluss gemeldet: ${data.closeValue} €` }] : []),
      ];
      for (const [h, v] of verlauf.entries()) {
        const hid = `${id}_h${h}`;
        const hd = { leadId: id, customerId: k.id, kind: v.kind, text: v.text, createdAt: new Date(created.getTime() + h * 3600_000) };
        await prisma.leadHistory.upsert({ where: { id: hid }, create: { id: hid, ...hd }, update: hd });
      }
      if (abschluss) {
        const rid = `td_rev_${ki + 1}_${j + 1}`;
        const rv = { customerId: k.id, leadId: id, amount: data.closeValue ?? 0, occurredAt: tage(-j) };
        await prisma.revenue.upsert({ where: { id: rid }, create: { id: rid, ...rv }, update: rv });
      }
      n++;
    }
  }
  return n;
}

async function chats() {
  const conv = [
    { id: "td_c1", k: "td_k1", lead: "td_l_1_3", name: "Julia Wolf", attention: true, msgs: ["Hallo, ich hätte gern ein Angebot für die Haftpflicht.", "Gern, wann passt Ihnen ein kurzer Anruf?", "Morgen ab 17 Uhr wäre gut."] },
    { id: "td_c2", k: "td_k2", lead: "td_l_2_2", name: "Tobias Klein", attention: false, msgs: ["Guten Tag, ist die BU auch für Selbstständige?", "Ja, das schauen wir uns gemeinsam an."] },
    { id: "td_c3", k: "td_k3", lead: "td_l_3_1", name: "Anna Richter", attention: true, msgs: ["Können wir den Termin verschieben?"] },
  ];
  for (const [i, c] of conv.entries()) {
    const d = {
      customerId: c.k,
      leadId: c.lead,
      contactPhone: tel(400 + i),
      contactName: c.name,
      needsAttention: c.attention,
      attentionReason: c.attention ? "Frage an den Berater" : null,
      attentionAt: c.attention ? stunden(-2) : null,
      lastMessageAt: stunden(-1 - i),
      windowExpiresAt: stunden(20),
      status: "open",
    };
    await prisma.conversation.upsert({ where: { id: c.id }, create: { id: c.id, ...d }, update: d });
    for (const [j, body] of c.msgs.entries()) {
      const mid = `${c.id}_m${j}`;
      const md = { conversationId: c.id, direction: j % 2 === 0 ? "in" : "out", body, sentBy: j % 2 === 0 ? null : "bot", status: j % 2 === 0 ? null : "read", createdAt: stunden(-3 + j * 0.5 - i) };
      await prisma.message.upsert({ where: { id: mid }, create: { id: mid, ...md }, update: md });
    }
  }
  // Support-Chat eines Kunden an uns (Kunde der Support-Nummer, intern)
  const intern = { id: "td_k_intern", name: "performancegrowth Support (Test)", plan: "internal", newUi: true, isTest: false, leadEmail: false, mailFeaturesOff: true, capiEnabled: false };
  await prisma.customer.upsert({ where: { id: intern.id }, create: intern, update: intern });
  const sd = { customerId: intern.id, contactPhone: tel(51), contactName: "Jonas Weber", linkedCustomerId: "td_k2", salesContactId: "td_sck_2", needsAttention: true, attentionReason: "Kunde fragt nach Rechnung", attentionAt: stunden(-5), lastMessageAt: stunden(-5), status: "open" };
  await prisma.conversation.upsert({ where: { id: "td_c_support" }, create: { id: "td_c_support", ...sd }, update: sd });
  const sm = { conversationId: "td_c_support", direction: "in", body: "Hallo, ich finde meine Rechnung für Oktober nicht. Können Sie helfen?", createdAt: stunden(-5) };
  await prisma.message.upsert({ where: { id: "td_c_support_m0" }, create: { id: "td_c_support_m0", ...sm }, update: sm });
}

async function termine() {
  const liste = [
    { id: "td_ap1", k: "td_k1", lead: "td_l_1_4", h: 3, status: "booked" },
    { id: "td_ap2", k: "td_k2", lead: "td_l_2_4", h: 26, status: "booked" },
    { id: "td_ap3", k: "td_k3", lead: "td_l_3_2", h: -20, status: "booked" },
  ];
  for (const a of liste) {
    const d = { customerId: a.k, leadId: a.lead, mode: "video", startsAt: stunden(a.h), endsAt: stunden(a.h + 0.5), status: a.status };
    await prisma.appointment.upsert({ where: { id: a.id }, create: { id: a.id, ...d }, update: d });
  }
}

async function vertrieb() {
  const kontakte = [
    { name: "Michael Fischer", insurer: "Allianz", city: "Stuttgart", stage: "NEU" },
    { name: "Claudia Meyer", insurer: "Signal Iduna", city: "Dresden", stage: "NEU" },
    { name: "Stefan Koch", insurer: "Allianz", city: "Nürnberg", stage: "NICHT_ERREICHT" },
    { name: "Andrea Bauer", insurer: "ERGO", city: "Essen", stage: "WIEDERVORLAGE" },
    { name: "Frank Richter", insurer: "Allianz", city: "Bonn", stage: "INTERESSE" },
    { name: "Nicole Schäfer", insurer: "Signal Iduna", city: "Kiel", stage: "INTERESSE" },
    { name: "Oliver Krause", insurer: "Allianz", city: "Mainz", stage: "TERMIN" },
    { name: "Birgit Lehmann", insurer: "HUK", city: "Augsburg", stage: "TERMIN" },
    { name: "Ralf Schmitt", insurer: "Allianz", city: "Freiburg", stage: "SPAETER" },
    { name: "Heike Wolff", insurer: "Signal Iduna", city: "Rostock", stage: "VERLOREN" },
  ] as const;
  for (const [i, c] of kontakte.entries()) {
    const id = `td_sc_${i + 1}`;
    const [firstName, lastName] = c.name.split(" ");
    const d = {
      name: `Generalvertretung ${c.name}`,
      firstName,
      lastName,
      salutation: i % 2 ? "Frau" : "Herr",
      email: `vertrieb${i + 1}@example.com`,
      phone: tel(600 + i),
      city: c.city,
      insurer: c.insurer,
      stage: c.stage,
      lossReason: c.stage === "VERLOREN" ? ("KEIN_BEDARF" as const) : null,
      callAttempts: c.stage === "NICHT_ERREICHT" ? 2 : 0,
      lastContactAt: c.stage === "NEU" ? null : tage(-i),
      teamSize: 2 + (i % 4),
      potentialScore: 40 + i * 5,
    };
    await prisma.salesContact.upsert({ where: { id }, create: { id, ...d }, update: d });
    const act = { contactId: id, type: c.stage === "NEU" ? ("IMPORT" as const) : ("ANRUF" as const), outcome: c.stage === "NICHT_ERREICHT" ? "nicht erreicht" : null, note: c.stage === "NEU" ? "Aus Liste übernommen" : "Kurz gesprochen, Interesse an Leads", occurredAt: tage(-i - 1) };
    await prisma.salesActivity.upsert({ where: { id: `${id}_a1` }, create: { id: `${id}_a1`, ...act }, update: act });
  }
  // Aufgaben: heute fällig, überfällig, später, erledigt
  const aufgaben = [
    { id: "td_t1", c: "td_sc_3", title: "Erneut anrufen", type: "ANRUF", due: stunden(1) },
    { id: "td_t2", c: "td_sc_4", title: "Wiedervorlage: Budget klären", type: "NACHFASSEN", due: tage(-2) },
    { id: "td_t3", c: "td_sc_5", title: "Unterlagen schicken", type: "UNTERLAGEN", due: stunden(4) },
    { id: "td_t4", c: "td_sc_6", title: "Nachfassen nach Präsentation", type: "NACHFASSEN", due: tage(-5) },
    { id: "td_t5", c: "td_sc_9", title: "Im Frühjahr melden", type: "NACHFASSEN", due: tage(60) },
    { id: "td_t6", c: null, title: "Steuerberater Unterlagen schicken", type: "SONSTIGES", due: stunden(2) },
    { id: "td_t7", c: "td_sc_7", title: "Termin vorbereiten", type: "TERMIN", due: tage(-1), done: true },
  ] as const;
  for (const t of aufgaben) {
    const d = { contactId: t.c, title: t.title, type: t.type, dueAt: t.due, doneAt: "done" in t && t.done ? tage(-1) : null };
    await prisma.salesTask.upsert({ where: { id: t.id }, create: { id: t.id, ...d }, update: d });
  }
  // Vertriebstermine
  const meetings = [
    { id: "td_sm1", c: "td_sc_7", h: 2, title: "Erstgespräch performancegrowth" },
    { id: "td_sm2", c: "td_sc_8", h: 28, title: "Erstgespräch performancegrowth" },
    { id: "td_sm3", c: "td_sc_5", h: -26, title: "Präsentation performancegrowth" },
  ];
  for (const m of meetings) {
    const d = { contactId: m.c, title: m.title, startAt: stunden(m.h), endAt: stunden(m.h + 0.5), status: "GEPLANT", joinUrl: "https://meet.example.com/td" };
    await prisma.salesMeeting.upsert({ where: { id: m.id }, create: { id: m.id, ...d }, update: d });
  }
  // Angebote: Entwurf, gesendet, angesehen, angenommen (unbezahlt), bezahlt
  const angebote = [
    { id: "td_o1", c: "td_sc_5", status: "draft", pay: "none" },
    { id: "td_o2", c: "td_sc_6", status: "sent", pay: "none" },
    { id: "td_o3", c: "td_sc_7", status: "viewed", pay: "none" },
    { id: "td_o4", c: "td_sck_4", status: "accepted", pay: "pending" },
    { id: "td_o5", c: "td_sck_1", status: "accepted", pay: "paid" },
  ];
  for (const [i, o] of angebote.entries()) {
    const d = {
      salesContactId: o.c,
      number: `TD-2026-${String(i + 1).padStart(3, "0")}`,
      token: `td-offer-token-${i + 1}`,
      status: o.status,
      contactName: ["Frank Richter", "Nicole Schäfer", "Oliver Krause", "Kemal Yilmaz", "Petra Hoffmann"][i],
      package: i % 2 ? "betreuung" : "software",
      term: "12",
      products: [],
      setupFee: 490,
      monthlyFee: i % 2 ? 990 : 0,
      softwareFee: 299,
      validUntil: tage(14),
      sentAt: o.status === "draft" ? null : tage(-3),
      viewedAt: ["viewed", "accepted"].includes(o.status) ? tage(-2) : null,
      acceptedAt: o.status === "accepted" ? tage(-1) : null,
      acceptedName: o.status === "accepted" ? "Testkunde" : null,
      paymentStatus: o.pay,
      paidAt: o.pay === "paid" ? tage(-1) : null,
    };
    await prisma.offer.upsert({ where: { id: o.id }, create: { id: o.id, ...d }, update: d });
  }
}

async function ppl() {
  // Käufer: zwei Kunden mit Bezug
  const bezuege = [
    { id: "td_sub1", k: "td_k2", key: "haftpflicht", label: "Haftpflicht Hamburg", goal: 10, price: 39, status: "live" },
    { id: "td_sub2", k: "td_k3", key: "bu", label: "BU München", goal: 6, price: 59, status: "live" },
    { id: "td_sub3", k: "td_k7", key: "haftpflicht", label: "Testpaket Haftpflicht", goal: 5, price: 0, status: "test" },
  ];
  for (const b of bezuege) {
    const d = { customerId: b.k, productKey: b.key, label: b.label, goal: b.goal, price: b.price, status: b.status, period: "week", startDate: tage(-30), plzRanges: "20000-22999", stornoDays: 7, stornoReasons: ["Falsche Telefonnummer", "Keine Anfrage gestellt"], slackNotify: false };
    await prisma.leadSubscription.upsert({ where: { id: b.id }, create: { id: b.id, ...d }, update: d });
    await prisma.subscriptionArea.upsert({ where: { id: `${b.id}_a` }, create: { id: `${b.id}_a`, subscriptionId: b.id, plzRanges: "20000-22999", quantity: b.goal }, update: { quantity: b.goal } });
    const od = { subscriptionId: b.id, periodStart: tage(-3), periodEnd: tage(4), quantity: b.goal, amount: b.goal * b.price, status: "open" };
    await prisma.leadOrder.upsert({ where: { id: `${b.id}_o` }, create: { id: `${b.id}_o`, ...od }, update: od });
  }
  // Pool-Leads: geliefert, geparkt, abgelehnt
  const pool = [
    { s: "delivered", key: "haftpflicht", lead: "td_l_2_1" },
    { s: "delivered", key: "haftpflicht", lead: "td_l_2_5" },
    { s: "delivered", key: "bu", lead: "td_l_3_5" },
    { s: "parked", key: "bu", reason: "kein passender Bezug (PLZ)" },
    { s: "parked", key: "haftpflicht", reason: "Kontingent voll" },
    { s: "rejected", key: "haftpflicht", reason: "Telefonnummer ungültig" },
  ];
  for (const [i, p] of pool.entries()) {
    const id = `td_pool_${i + 1}`;
    const d = { productKey: p.key, via: "meta", name: LEAD_NAMEN[i], phone: tel(700 + i), plz: "20" + String(100 + i), insurer: "Allianz", status: p.s, reason: p.reason ?? null, leadId: p.lead ?? null, createdAt: stunden(-6 * (i + 1)), deliveredAt: p.s === "delivered" ? stunden(-6 * (i + 1)) : null, score: 60 + i * 5 };
    await prisma.poolLead.upsert({ where: { id }, create: { id, ...d }, update: d });
    if (p.lead) await prisma.lead.update({ where: { id: p.lead }, data: { subscriptionId: p.key === "bu" ? "td_sub2" : "td_sub1", deliveredAt: d.deliveredAt } });
  }
}

async function werbung() {
  for (const [i, k] of KUNDEN.entries()) {
    if (k.plan !== "service" || k.stufe === "GEKUENDIGT") continue;
    const accId = `act_td_${i + 1}`;
    const oa = { kind: "customer", customerId: k.id, label: k.name, adAccountId: accId, targetCpl: 40, agreedDailyBudget: 30, active: k.stufe !== "PAUSIERT", lastRunAt: stunden(-8), lastRunNote: "2 Anzeigen geprüft, keine Änderung" };
    await prisma.optimizationAccount.upsert({ where: { id: `td_oa_${i + 1}` }, create: { id: `td_oa_${i + 1}`, ...oa }, update: oa });
    for (let t = 1; t <= 28; t++) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - t));
      const spend = Math.round((22 + ((i * 7 + t * 3) % 15)) * 100) / 100;
      const ad = { customerId: k.id, adAccountId: accId, campaignId: `c_td_${i}`, campaignName: "Haftpflicht Leads Herbst", adSetId: `as_td_${i}`, adSetName: "Hamburg 25 bis 55", adId: `ad_td_${i}`, adName: t % 2 ? "Motiv Familie" : "Motiv Single", date, spend, impressions: 1800 + t * 20, clicks: 40 + t, metaLeads: (t + i) % 3 === 0 ? 1 : 0 };
      await prisma.adSpendDaily.upsert({ where: { adAccountId_adId_date: { adAccountId: accId, adId: ad.adId, date } }, create: ad, update: ad });
      await prisma.customerAdSpend.upsert({ where: { customerId_accountId_date: { customerId: k.id, accountId: accId, date } }, create: { customerId: k.id, accountId: accId, date, amount: spend }, update: { amount: spend } });
    }
    const m = { accountId: `td_oa_${i + 1}`, customerId: k.id, status: "geplant", kind: "budget", title: "Budget der besten Anzeige um 20 % erhöhen", reason: "Kosten je Lead seit 7 Tagen unter Ziel", plannedAt: stunden(-3), dedupeKey: `td_m_${i + 1}` };
    await prisma.optimizationMeasure.upsert({ where: { id: `td_om_${i + 1}` }, create: { id: `td_om_${i + 1}`, ...m }, update: m });
  }
  // Pool-Werbekonto Pay-per-Lead
  const pool = { kind: "pool", poolProduct: "haftpflicht", label: "Pool Haftpflicht", adAccountId: "act_td_pool", targetCpl: 18, agreedDailyBudget: 60, active: true, lastRunAt: stunden(-5) };
  await prisma.optimizationAccount.upsert({ where: { id: "td_oa_pool" }, create: { id: "td_oa_pool", ...pool }, update: pool });
}

async function geld() {
  const kosten = [
    { id: "td_rc1", name: "Meta Werbung Pay-per-Lead (Grundbudget)", monthlyAmount: 1800, purpose: "ppl" },
    { id: "td_rc2", name: "Server und Datenbank", monthlyAmount: 120, purpose: "software" },
    { id: "td_rc3", name: "KI-Dienste", monthlyAmount: 260, purpose: "software" },
  ];
  for (const c of kosten) {
    const d = { name: c.name, monthlyAmount: c.monthlyAmount, purpose: c.purpose, startsAt: tage(-200) };
    await prisma.recurringCost.upsert({ where: { id: c.id }, create: { id: c.id, ...d }, update: d });
  }
  for (let i = 1; i <= 4; i++) {
    const d = { customerId: i % 2 ? "td_k2" : "td_k3", kind: "LEAD" as const, product: "haftpflicht", amount: 38 * (i + 2), occurredAt: tage(-i * 6), note: "Testdaten" };
    await prisma.cost.upsert({ where: { id: `td_cost_${i}` }, create: { id: `td_cost_${i}`, ...d }, update: d });
  }
  // Offene Posten (Mahnwesen): fällig, Mahnstufe 1, Zahlung erinnert
  const posten = [
    { id: "td_mf1", k: "td_k3", inv: "RE-2026-0412", betrag: 99000, due: -12, stufe: 2, status: "offen" },
    { id: "td_mf2", k: "td_k5", inv: "RE-2026-0398", betrag: 79000, due: -4, stufe: 1, status: "offen" },
    { id: "td_mf3", k: "td_k8", inv: "RE-2026-0420", betrag: 39900, due: 3, stufe: 0, status: "offen" },
  ];
  for (const p of posten) {
    const d = { stripeCustomerId: `cus_td_${p.k}`, customerId: p.k, invoiceNumber: p.inv, email: "rechnung@example.com", amountDue: p.betrag, art: "retainer", dueDate: tage(p.due), stufe: p.stufe, status: p.status, faelligAt: p.due < 0 ? tage(p.due) : null, mahnung1At: p.stufe >= 1 ? tage(p.due + 3) : null };
    await prisma.mahnfall.upsert({ where: { id: p.id }, create: { id: p.id, stripeInvoiceId: `in_td_${p.id}`, ...d }, update: d });
  }
  // Bank: zwei ungeklärte Buchungen
  const bank = [
    { id: "td_bt1", amount: 990, counterparty: "Sabine Krueger", purpose: "RE-2026-0412 Oktober" },
    { id: "td_bt2", amount: -49.9, counterparty: "Software Abo GmbH", purpose: "Rechnung 8812" },
  ];
  for (const [i, b] of bank.entries()) {
    const d = { accountKey: "td_konto", externalId: `td_ext_${i}`, source: "test", bookingDate: tage(-i - 1), amount: b.amount, counterparty: b.counterparty, purpose: b.purpose, status: "neu" };
    await prisma.bankTransaction.upsert({ where: { id: b.id }, create: { id: b.id, ...d }, update: d });
  }
}

async function berichte() {
  const m = monat(-1);
  const liste = [
    { id: "td_mrep1", k: "td_k2", rating: "gut", status: "draft" },
    { id: "td_mrep2", k: "td_k3", rating: "kritisch", status: "draft" },
    { id: "td_mrep3", k: "td_k1", rating: "gut", status: "sent" },
  ];
  for (const r of liste) {
    const d = {
      customerId: r.k,
      month: m,
      rating: r.rating,
      // Form wie lib/monatsbericht/shared.ts (ReportMetrics); vorher fehlte `current`, die Berichtsansicht brach ab
      metrics: {
        month: m,
        current: { leads: 18, spend: 760, cpl: 42.22, termine: 7, abschluesse: 3, provision: 2400, ergebnisQuote: 0.8 },
        previous: null,
        expectedLeads: 20,
        targetCpl: 40,
        actions: ["Anzeigentext getauscht"],
      },
      subject: `Ihr Monatsrückblick ${m}`,
      body: { version: 2, paragraphs: ["Guten Tag, hier ist Ihr Rückblick auf den letzten Monat. Die Anfragen kamen gleichmäßig, aus den Terminen sind mehrere Abschlüsse entstanden."], tips: [] },
      status: r.status,
      sentAt: r.status === "sent" ? tage(-10) : null,
    };
    await prisma.monthlyReport.upsert({ where: { customerId_month: { customerId: r.k, month: m } }, create: { id: r.id, ...d }, update: d });
  }
}

async function logins() {
  const hash = await bcrypt.hash("Test1234!test", 10);
  const u = [
    { id: "td_u1", email: "vermittler@test.local", customerId: "td_k1", displayName: "Petra Hoffmann" },
    { id: "td_u2", email: "weber@example.com", customerId: "td_k2", displayName: "Jonas Weber" },
    { id: "td_u3", email: "krueger@example.com", customerId: "td_k3", displayName: "Sabine Krüger" },
  ];
  for (const x of u) {
    const d = { email: x.email, role: "BUYER" as const, customerId: x.customerId, displayName: x.displayName, lastLoginAt: tage(-1) };
    await prisma.user.upsert({ where: { id: x.id }, create: { id: x.id, passwordHash: hash, ...d }, update: d });
  }
}

async function main() {
  const prods = await produkte();
  await kunden(prods);
  const n = await leads();
  await chats();
  await termine();
  await vertrieb();
  await ppl();
  await werbung();
  await geld();
  await berichte();
  await logins();
  console.log(JSON.stringify({ ok: true, kunden: KUNDEN.length, leads: n }));
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
