// Testdaten für das Bestandskunden-Modul (nur lokale Datenbank).
// Start: npx vite-node --config vitest.config.ts tools/bestand/testdaten.ts
//
// Legt an (feste ids, beliebig oft ausführbar, überschreibt nur die eigenen Datensätze mit Präfix „bst_“):
// - Vermittler „Testagentur Bestand“ (bestand@test.local / Test1234!test): Modul aktiv, WhatsApp „verbunden“
//   (ohne Schlüssel, es geht nichts raus), 120 Bestandskunden mit Verträgen, Einwilligungen gemischt, ein Import,
//   fünf Kampagnen (läuft, pausiert wegen Kontingent, fertig, fertig, Entwurf), Antworten, Leads, Termine, Abschlüsse.
// - Leerer Zustand „Testagentur Bestand leer“ (bestand-leer@test.local): Modul aktiv, keine Kunden.
// - Gesperrter Zustand „Testagentur Bestand neu“ (bestand-neu@test.local): Modul sichtbar, nicht gebucht.
// Alle Telefonnummern und Adressen sind erfunden (example.com, 49155 5…), es wird nichts verschickt.

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { AGENT_CONFIRM_VERSION } from "@/lib/bestand/befugnis";

const PASSWORT = "Test1234!test";
const DAY = 86_400_000;

function nurLokal() {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error("Abbruch: DATABASE_URL zeigt nicht auf localhost.");
    process.exit(1);
  }
}

// Fester Zufall (gleiches Ergebnis bei jedem Lauf)
let seed = 4711;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];

const VORNAMEN_M = ["Thomas", "Michael", "Andreas", "Stefan", "Jürgen", "Frank", "Markus", "Peter", "Christian", "Klaus", "Uwe", "Ralf", "Jan", "Tobias", "Lukas"];
const VORNAMEN_W = ["Sabine", "Petra", "Claudia", "Andrea", "Monika", "Julia", "Anna", "Katrin", "Susanne", "Birgit", "Lena", "Sarah", "Nicole", "Heike", "Laura"];
const NACHNAMEN = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter",
  "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner",
  "Krause", "Meier", "Lehmann", "Schmid", "Schulze", "Maier", "Köhler", "Herrmann", "König", "Walter", "Mayer", "Huber", "Kaiser",
];
const STAEDTE: [string, string][] = [["80331", "München"], ["90402", "Nürnberg"], ["86150", "Augsburg"], ["93047", "Regensburg"], ["85049", "Ingolstadt"]];
const FIRMEN = ["Bäckerei Huber GmbH", "Elektro Wagner", "Praxis Dr. Klein", "Autohaus Bauer KG", "Schreinerei Koch"];

// Sparten-Muster (typischer Allianz-Bestand): viele KFZ ohne Hausrat, viele Haftpflicht ohne Rechtsschutz
const MUSTER: string[][] = [
  ["KFZ"], ["KFZ"], ["KFZ", "Haftpflicht"], ["KFZ", "Haftpflicht"], ["KFZ", "Haftpflicht", "Hausrat"], ["Haftpflicht"], ["Haftpflicht", "Hausrat"],
  ["Hausrat"], ["Wohngebäude"], ["Wohngebäude", "Haftpflicht"], ["KFZ", "Rechtsschutz"], ["Vorsorge"], ["Vorsorge", "KFZ"], ["Kranken"],
  ["Haftpflicht", "Unfall"], ["KFZ", "Haftpflicht", "Rechtsschutz", "Hausrat"],
];
const PRODUKT: Record<string, [string, number, number]> = {
  KFZ: ["Allianz Kfz-Versicherung", 420, 980],
  Haftpflicht: ["Privathaftpflicht Smart", 60, 120],
  Hausrat: ["Hausrat Komfort", 90, 220],
  Wohngebäude: ["Wohngebäude Premium", 380, 900],
  Rechtsschutz: ["Rechtsschutz Privat", 220, 380],
  Unfall: ["Unfallschutz Aktiv", 120, 300],
  Vorsorge: ["Private Rente Perspektive", 1200, 2400],
  Kranken: ["Zahnzusatz Plus", 240, 480],
};

const ID = {
  main: "bst_cust_main",
  leer: "bst_cust_leer",
  neu: "bst_cust_neu",
  import: "bst_import_1",
  wa: "bst_wa_main",
  pack: "bst_pack_1",
};

async function kunde(id: string, name: string, data: Record<string, unknown>) {
  // name ist eindeutig: vorhandenen Datensatz mit gleichem Namen, aber anderer id, nicht anfassen
  const other = await prisma.customer.findUnique({ where: { name }, select: { id: true } });
  if (other && other.id !== id) throw new Error(`Kunde „${name}“ existiert schon mit anderer id`);
  await prisma.customer.upsert({ where: { id }, update: { name, ...data }, create: { id, name, ...data } });
}

async function login(email: string, customerId: string, displayName: string) {
  const passwordHash = await hashPassword(PASSWORT);
  await prisma.user.upsert({
    where: { email },
    update: { customerId, displayName, teamRole: "owner", passwordHash },
    create: { id: `bst_user_${email.split("@")[0]}`, email, passwordHash, role: "BUYER", customerId, displayName, teamRole: "owner" },
  });
}

async function main() {
  nurLokal();
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const ahead = (d: number) => new Date(now.getTime() + d * DAY);

  // ── Kunden (Vermittler) ──
  const basis = { plan: "software", vermittlerTyp: "vertreter", isTest: false, newUi: true, bestandAddress: "sie" };
  await kunde(ID.main, "Testagentur Bestand", {
    ...basis,
    existingCustomersEnabled: true,
    bestandSichtbar: true,
    bestandMonthly: 99,
    bestandUwgConfirmedAt: ago(20),
    bestandAgentConfirmedAt: ago(21),
    bestandAgentConfirmedVersion: AGENT_CONFIRM_VERSION,
    bestandMailImprint: "Testagentur Bestand, Musterstraße 1, 80331 München, Tel. 089 000000, Vermittlerregister D-XXXX-XXXXX-XX",
  });
  await kunde(ID.leer, "Testagentur Bestand leer", { ...basis, existingCustomersEnabled: true, bestandSichtbar: true, bestandAgentConfirmedAt: ago(2), bestandAgentConfirmedVersion: AGENT_CONFIRM_VERSION });
  await kunde(ID.neu, "Testagentur Bestand neu", { ...basis, existingCustomersEnabled: false, bestandSichtbar: true });
  await login("bestand@test.local", ID.main, "Markus Testmann");
  await login("bestand-leer@test.local", ID.leer, "Lena Leer");
  await login("bestand-neu@test.local", ID.neu, "Nora Neu");
  const userId = (await prisma.user.findUnique({ where: { email: "bestand@test.local" }, select: { id: true } }))!.id;

  // WhatsApp „verbunden“ ohne Nummer und Schlüssel: Kampagnen planen WhatsApp, gesendet wird nichts
  await prisma.whatsAppAccount.upsert({ where: { customerId: ID.main }, update: { status: "connected" }, create: { id: ID.wa, customerId: ID.main, status: "connected", displayName: "Testagentur Bestand" } });

  // ── Aufräumen der eigenen Bewegungsdaten (Kampagnen, Leads, Bestand), dann neu anlegen ──
  await prisma.customerCampaign.deleteMany({ where: { customerId: ID.main } });
  await prisma.appointment.deleteMany({ where: { customerId: ID.main } });
  await prisma.leadContract.deleteMany({ where: { customerId: ID.main } });
  await prisma.lead.deleteMany({ where: { customerId: ID.main } });
  await prisma.bestandConsentLog.deleteMany({ where: { customerId: ID.main } });
  await prisma.existingCustomer.deleteMany({ where: { customerId: { in: [ID.main, ID.leer] } } });
  await prisma.bestandMessagePack.deleteMany({ where: { customerId: ID.main } });
  await prisma.existingCustomerImport.deleteMany({ where: { customerId: ID.main } });

  await prisma.existingCustomerImport.create({
    data: { id: ID.import, customerId: ID.main, createdById: userId, fileName: "Bestand_Export_Allianz.xlsx", rows: 120, created: 120, updated: 0, contracts: 0, createdAt: ago(21) },
  });
  await prisma.bestandMessagePack.create({
    data: { id: ID.pack, customerId: ID.main, messages: 500, amount: 49, purchasedAt: ago(10), expiresAt: ahead(80), source: "kauf", createdById: userId, stripeStatus: "invoiced" },
  });

  // ── 120 Bestandskunden ──
  type Ec = { id: string; firstName: string | null; lastName: string | null; lines: string[]; phone: string | null; email: string | null; wa: boolean; mail: boolean };
  const ecs: Ec[] = [];
  let contractCount = 0;
  for (let i = 1; i <= 120; i++) {
    const n = String(i).padStart(3, "0");
    const id = `bst_ec_${n}`;
    const female = rnd() < 0.5;
    const firma = i % 24 === 0 ? FIRMEN[(i / 24 - 1) % FIRMEN.length] : null;
    const firstName = firma ? null : pick(female ? VORNAMEN_W : VORNAMEN_M);
    const lastName = firma ? null : pick(NACHNAMEN);
    const lines = [...pick(MUSTER)];
    const phone = rnd() < 0.85 ? `491555${String(100000 + i)}` : null;
    const email = rnd() < 0.7 ? `kunde${n}@example.com` : null;
    // Einwilligungen: WhatsApp ja bei ~40 %, E-Mail ja bei ~25 %, einige „nein“, Rest unbekannt; 6 pauschal laut Versicherer
    const legacy = i % 20 === 0;
    const r1 = rnd();
    const whatsappConsent = phone ? (legacy || r1 < 0.4 ? "ja" : r1 < 0.47 ? "nein" : null) : null;
    const r2 = rnd();
    const emailConsent = email ? (legacy || r2 < 0.25 ? "ja" : r2 < 0.3 ? "nein" : null) : null;
    const widerspruchHinweis = email && rnd() < 0.5 ? "ja" : null;
    const optOutAt = i === 17 || i === 63 ? ago(5) : null;
    const blockedAt = i === 88 ? ago(3) : null;
    const [plz, ort] = pick(STAEDTE);
    const by = 1950 + Math.floor(rnd() * 50);
    // Geburtstage teils in den nächsten 30 Tagen
    const birthday = i % 9 === 0 ? new Date(Date.UTC(by, ahead(3 + (i % 25)).getUTCMonth(), ahead(3 + (i % 25)).getUTCDate())) : new Date(Date.UTC(by, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)));
    const nextRenewal = lines.includes("KFZ") ? (i % 5 === 0 ? ahead(20 + (i % 35)) : new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))) : null;
    const contracts = lines.map((line, k) => {
      const [product, lo, hi] = PRODUKT[line] ?? [line, 100, 300];
      return {
        id: `${id}_v${k + 1}`,
        line,
        product,
        startDate: new Date(Date.UTC(2015 + Math.floor(rnd() * 10), Math.floor(rnd() * 12), 1)),
        renewalDate: line === "KFZ" ? nextRenewal : null,
        annualPremium: Math.round(lo + rnd() * (hi - lo)),
        contractNo: `AZ-${n}-${k + 1}`,
        insurer: "Allianz",
        status: "aktiv",
      };
    });
    contractCount += contracts.length;
    const premiumTotal = contracts.reduce((s, c) => s + c.annualPremium, 0);
    const src = legacy ? "versicherer_pauschal" : "import";
    await prisma.existingCustomer.create({
      data: {
        id,
        customerId: ID.main,
        externalNo: `K${100000 + i}`,
        salutation: firma ? null : female ? "Frau" : "Herr",
        firstName,
        lastName,
        company: firma,
        phone,
        email,
        birthday,
        street: `Teststraße ${i}`,
        zip: plz,
        city: ort,
        lines,
        nextRenewal,
        premiumTotal,
        whatsappConsent,
        whatsappConsentAt: whatsappConsent ? ago(21) : null,
        whatsappConsentSource: whatsappConsent ? src : null,
        emailConsent,
        emailConsentAt: emailConsent ? ago(21) : null,
        emailConsentSource: emailConsent ? src : null,
        widerspruchHinweis,
        widerspruchHinweisAt: widerspruchHinweis ? ago(21) : null,
        widerspruchHinweisSource: widerspruchHinweis ? "import" : null,
        optOutAt,
        blockedAt,
        blockedById: blockedAt ? userId : null,
        importId: ID.import,
        createdAt: ago(21),
        contracts: { create: contracts },
      },
    });
    ecs.push({ id, firstName, lastName, lines, phone, email, wa: whatsappConsent === "ja" && !optOutAt && !blockedAt, mail: !!email && emailConsent !== "nein" && !optOutAt && !blockedAt });
  }
  await prisma.existingCustomerImport.update({ where: { id: ID.import }, data: { contracts: contractCount } });

  // Einwilligungsanfragen (offen) für einige ohne WhatsApp-Einwilligung
  const angefragt = ecs.filter((e) => !e.wa && e.email).slice(0, 8);
  for (const [k, e] of angefragt.entries()) {
    await prisma.bestandConsentLog.create({
      data: { id: `bst_log_${k + 1}`, customerId: ID.main, existingCustomerId: e.id, channel: "whatsapp", action: "angefragt", source: "vermittler", address: e.email, actorUserId: userId, createdAt: ago(4) },
    });
  }

  // ── Kampagnen ──
  const reachable = ecs.filter((e) => e.wa || e.mail);
  const kfzOhneHausrat = reachable.filter((e) => e.lines.includes("KFZ") && !e.lines.includes("Hausrat"));
  const haftOhneRs = reachable.filter((e) => e.lines.includes("Haftpflicht") && !e.lines.includes("Rechtsschutz"));
  type Plan = { id: string; name: string; occasion: string; topic: string | null; segment: object; status: string; pausedReason?: string; startedDaysAgo: number | null; finished?: boolean; people: Ec[]; sentShare: number; replyShare: number };
  const plans: Plan[] = [
    { id: "bst_camp_hausrat", name: "KFZ ohne Hausrat", occasion: "cross_sell", topic: "Hausrat", segment: { has: ["KFZ"], lacks: ["Hausrat"] }, status: "running", startedDaysAgo: 6, people: kfzOhneHausrat.slice(0, 30), sentShare: 0.7, replyShare: 0.25 },
    { id: "bst_camp_rs", name: "Haftpflicht ohne Rechtsschutz", occasion: "cross_sell", topic: "Rechtsschutz", segment: { has: ["Haftpflicht"], lacks: ["Rechtsschutz"] }, status: "paused", pausedReason: "kontingent", startedDaysAgo: 12, people: haftOhneRs.slice(0, 20), sentShare: 0.6, replyShare: 0.2 },
    { id: "bst_camp_geb", name: "Geburtstag", occasion: "birthday", topic: null, segment: { birthdayDays: 30 }, status: "done", startedDaysAgo: 40, finished: true, people: reachable.slice(5, 17), sentShare: 1, replyShare: 0.35 },
    { id: "bst_camp_jahr", name: "Jahresgespräch", occasion: "review", topic: null, segment: {}, status: "done", startedDaysAgo: 75, finished: true, people: reachable.slice(20, 45), sentShare: 1, replyShare: 0.3 },
    { id: "bst_camp_entwurf", name: "Ablauf/Wechsel", occasion: "renewal", topic: null, segment: { renewalDays: 60 }, status: "draft", startedDaysAgo: null, people: [], sentShare: 0, replyShare: 0 },
  ];
  let leadNo = 0;
  for (const p of plans) {
    const startedAt = p.startedDaysAgo != null ? ago(p.startedDaysAgo) : null;
    await prisma.customerCampaign.create({
      data: {
        id: p.id,
        customerId: ID.main,
        name: p.name,
        occasion: p.occasion,
        segment: p.segment,
        topic: p.topic,
        status: p.status,
        pausedReason: p.pausedReason ?? null,
        createdById: userId,
        senderUserId: userId,
        startedAt,
        finishedAt: p.finished && startedAt ? new Date(startedAt.getTime() + 5 * DAY) : null,
        createdAt: startedAt ?? ago(1),
      },
    });
    for (const [k, e] of p.people.entries()) {
      const channel = e.wa ? "whatsapp" : "email";
      const sent = k < Math.round(p.people.length * p.sentShare);
      const replied = sent && k % Math.max(1, Math.round(1 / Math.max(p.replyShare, 0.01))) === 0;
      const sentAt = sent && startedAt ? new Date(startedAt.getTime() + (k % 5) * DAY + 3_600_000 * (9 + (k % 8))) : null;
      const failed = sent && !replied && k % 11 === 7;
      let status = sent ? (replied ? "replied" : failed ? "failed" : "sent") : "queued";
      let reason: string | null = failed ? (channel === "email" ? "Unzustellbar" : "Nicht per WhatsApp erreichbar") : null;
      if (!sent && k % 7 === 6) {
        status = "skipped";
        reason = "Kürzlich angeschrieben";
      }
      let leadId: string | null = null;
      if (replied && sentAt) {
        // Antwort mit Interesse → Lead; jede zweite Antwort mit Termin, jede dritte mit Abschluss; „Kein Bedarf“ ohne Lead
        const noInterest = k % 4 === 3;
        if (noInterest) {
          reason = "Kein Bedarf";
        } else {
          leadNo++;
          leadId = `bst_lead_${String(leadNo).padStart(3, "0")}`;
          const closed = leadNo % 3 === 0;
          const repliedAt = new Date(sentAt.getTime() + 2 * 3_600_000);
          const closedAt = closed ? new Date(Math.min(now.getTime() - 3_600_000, sentAt.getTime() + 9 * DAY)) : null;
          await prisma.lead.create({
            data: {
              id: leadId,
              customerId: ID.main,
              source: "Bestandskunde",
              name: [e.firstName, e.lastName].filter(Boolean).join(" ") || "Firmenkunde",
              phone: e.phone,
              email: e.email,
              status: closed ? "Abschluss" : leadNo % 2 === 0 ? "Termin vereinbart" : "Im Gespräch",
              closedAt,
              statusChangedAt: closedAt ?? repliedAt,
              assignedUserId: userId,
              createdAt: repliedAt,
              formData: [
                { label: "Kontext", value: `Bestandskunde des Beraters, angeschrieben wegen: ${p.name}${p.topic ? ` (${p.topic})` : ""}` },
                { label: "Kanal", value: channel === "email" ? "E-Mail" : "WhatsApp" },
              ],
            },
          });
          if (leadNo % 2 === 0 || closed) {
            const startsAt = new Date(sentAt.getTime() + 4 * DAY);
            await prisma.appointment.create({
              data: { id: `${leadId}_t`, customerId: ID.main, leadId, mode: "phone", startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: startsAt < now ? "completed" : "booked", createdAt: new Date(sentAt.getTime() + 3 * 3_600_000) },
            });
          }
          if (closed && closedAt) {
            const sparte = p.topic === "Hausrat" ? "hausrat" : p.topic === "Rechtsschutz" ? "rechtsschutz" : pick(["unfall", "privatschutz", "hausrat"]);
            await prisma.leadContract.create({
              data: { id: `${leadId}_v`, leadId, customerId: ID.main, primaryLeadId: leadId, sparte, premium: sparte === "rechtsschutz" ? 290 : sparte === "unfall" ? 210 : 140, signedAt: closedAt, insurer: "Allianz", premiumSource: "vermittler" },
            });
          }
        }
      }
      await prisma.campaignRecipient.create({
        data: {
          id: `${p.id}_r${String(k + 1).padStart(3, "0")}`,
          campaignId: p.id,
          existingCustomerId: e.id,
          status,
          reason,
          sentAt,
          deliveredAt: sentAt && !failed ? new Date(sentAt.getTime() + 60_000) : null,
          readAt: sentAt && !failed && channel === "whatsapp" && k % 3 !== 2 ? new Date(sentAt.getTime() + 1_800_000) : null,
          repliedAt: status === "replied" && sentAt ? new Date(sentAt.getTime() + 2 * 3_600_000) : null,
          leadId,
          channel,
          basis: channel === "whatsapp" || e.email ? "einwilligung" : "uwg7_3",
          bouncedAt: failed && channel === "email" && sentAt ? sentAt : null,
        },
      });
      if (sentAt) await prisma.existingCustomer.update({ where: { id: e.id }, data: { lastCampaignAt: sentAt } });
    }
  }

  const [ec, camps, rec, leads, deals] = await Promise.all([
    prisma.existingCustomer.count({ where: { customerId: ID.main } }),
    prisma.customerCampaign.count({ where: { customerId: ID.main } }),
    prisma.campaignRecipient.count({ where: { campaign: { customerId: ID.main } } }),
    prisma.lead.count({ where: { customerId: ID.main } }),
    prisma.leadContract.count({ where: { customerId: ID.main } }),
  ]);
  console.log(JSON.stringify({ bestandskunden: ec, kampagnen: camps, empfaenger: rec, leads, abschluesse: deals, logins: ["bestand@test.local", "bestand-leer@test.local", "bestand-neu@test.local"] }));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
