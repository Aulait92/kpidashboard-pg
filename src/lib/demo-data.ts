// Demo-Daten für Vorführungen (nur Sandbox, DEMO_TOOLS=1): ein Kunde bekommt
// ~45 Beispiel-Leads mit WhatsApp-Verläufen, Terminen, Abschlüssen, Retainer
// und Werbebudget — damit Dashboard, Pipeline und Chats „wie im Betrieb"
// aussehen. Alles ist markiert und lässt sich vollständig wieder entfernen:
//   Lead.bezugAirtableId = "demo" · Konversation contactPhone beginnt mit DEMO_PREFIX
//   · CustomerAdSpend.accountId = "demo" · Customer.metaAdAccountId = "demo".
// Keine Airtable-ID (der Sync fasst die Leads nicht an), outreachAt gesetzt
// (kein Erstanschreiben), reminderSentAt gesetzt (keine Erinnerungen),
// keine Kalender-Events (kein Abgleich mit Outlook).

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const DEMO_PREFIX = "4915100000";
const DEMO_ACCOUNT = "demo";
// Marker am Lead (bezugAirtableId wird nur für Storno-Gründe genutzt).
// Ältere Demo-Stände trugen formData.demo = true — beim Entfernen mit erfasst.
const demoLeadWhere = (customerId: string) => ({
  customerId,
  OR: [
    { bezugAirtableId: DEMO_ACCOUNT },
    { formData: { path: ["demo"], equals: true } },
  ],
});
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const NAMES = [
  "Lisa Becker", "Thomas Wagner", "Sabine Hoffmann", "Michael Schulz", "Julia Koch",
  "Andreas Richter", "Katrin Wolf", "Stefan Neumann", "Melanie Schwarz", "Daniel Zimmermann",
  "Nadine Krüger", "Markus Hartmann", "Sandra Lange", "Christian Werner", "Anna Schmitt",
  "Tobias Krause", "Jessica Meier", "Sebastian Lehmann", "Vanessa Huber", "Patrick Kaiser",
  "Laura Fuchs", "Florian Peters", "Sarah Scholz", "Jan Möller", "Kristina Weiß",
  "Dennis Jung", "Miriam Hahn", "Marcel Vogel", "Stefanie Keller", "Philipp Günther",
  "Carina Frank", "Benjamin Berger", "Tanja Roth", "Kevin Beck", "Lena Lorenz",
  "Oliver Baumann", "Franziska Albrecht", "Matthias Schuster", "Jana Simon", "Robert Böhm",
  "Nina Winter", "Alexander Kraus", "Verena Martin", "Dominik Schmid", "Eva Pohl",
];
const LEBENSSITUATION = ["Single", "Paar ohne Kinder", "Familie mit Kindern", "Alleinerziehend", "Paar, Kinder aus dem Haus"];
const INTERESSE = ["Haftpflicht", "Haftpflicht, Hausrat", "Hausrat, Rechtsschutz", "Haftpflicht, Hausrat, Rechtsschutz", "Rechtsschutz", "Unfall, Haftpflicht"];

type Scenario =
  | "new_silent" // angeschrieben, keine Antwort
  | "new_replied" // antwortet, noch kein Termin
  | "not_reached" // mehrfach versucht, nichts
  | "booked_future" // Termin gebucht, steht noch an
  | "consult_done" // Termin war, In Beratung
  | "offer" // Angebot gesendet
  | "closed" // Abschluss
  | "no_interest" // kein Interesse
  | "cancelled"; // Termin abgesagt

const PLAN: Scenario[] = [
  ...Array<Scenario>(5).fill("new_silent"),
  ...Array<Scenario>(3).fill("new_replied"),
  ...Array<Scenario>(6).fill("not_reached"),
  ...Array<Scenario>(6).fill("booked_future"),
  ...Array<Scenario>(8).fill("consult_done"),
  ...Array<Scenario>(6).fill("offer"),
  ...Array<Scenario>(6).fill("closed"),
  ...Array<Scenario>(3).fill("no_interest"),
  ...Array<Scenario>(2).fill("cancelled"),
];

const STATUS: Record<Scenario, string> = {
  new_silent: "Neuer Lead",
  new_replied: "Neuer Lead",
  not_reached: "Nicht erreicht",
  booked_future: "In Beratung",
  consult_done: "In Beratung",
  offer: "Angebot gesendet",
  closed: "Abschluss",
  no_interest: "Kein Interesse",
  cancelled: "Neuer Lead",
};

// Deterministischer Zufall → gleiche Demo bei jedem Anlegen.
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function atHour(d: Date, h: number, m = 0): Date {
  const x = new Date(d);
  x.setUTCHours(h - 1, m, 0, 0); // ≈ Berliner Winterzeit
  return x;
}

export async function hasDemoData(customerId: string): Promise<boolean> {
  const n = await prisma.lead.count({ where: demoLeadWhere(customerId) });
  return n > 0;
}

export async function removeDemoData(customerId: string): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: demoLeadWhere(customerId),
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);
  await prisma.appointment.deleteMany({
    where: { customerId, OR: [{ leadId: { in: leadIds } }, { manageToken: { startsWith: "demo_" } }] },
  });
  await prisma.conversation.deleteMany({
    where: { customerId, contactPhone: { startsWith: DEMO_PREFIX } },
  });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.customerAdSpend.deleteMany({ where: { customerId, accountId: DEMO_ACCOUNT } });
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { metaAdAccountId: true },
  });
  if (c?.metaAdAccountId === DEMO_ACCOUNT) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { metaAdAccountId: null, retainerMonthly: null, retainerStart: null },
    });
  }
}

export async function seedDemoData(customerId: string): Promise<{ leads: number }> {
  await removeDemoData(customerId);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, metaAdAccountId: true, whatsAppAccount: { select: { id: true } } },
  });
  if (!customer) throw new Error("Kunde nicht gefunden.");
  const advisorFirst = customer.name.replace(/^Allianz\s+/i, "").split(/\s+/)[0] ?? "dein Berater";
  const accountId = customer.whatsAppAccount?.id ?? null;
  const rand = rng(42);
  const now = Date.now();

  // Retainer + Werbebudget (nur wenn der Kunde kein echtes Werbekonto hat).
  if (!customer.metaAdAccountId) {
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - 2, 1);
    start.setUTCHours(0, 0, 0, 0);
    await prisma.customer.update({
      where: { id: customerId },
      data: { metaAdAccountId: DEMO_ACCOUNT, retainerMonthly: 700, retainerStart: start },
    });
    const days = Math.round((now - start.getTime()) / DAY);
    for (let i = 0; i <= days; i++) {
      const d = new Date(start.getTime() + i * DAY);
      d.setUTCHours(12, 0, 0, 0);
      await prisma.customerAdSpend.create({
        data: {
          customerId,
          accountId: DEMO_ACCOUNT,
          date: d,
          amount: Math.round((18 + rand() * 24) * 100) / 100,
        },
      });
    }
  }

  // Leads gleichmäßig über die letzten 55 Tage, neueste zuletzt. Die frischen
  // Szenarien (new_*, booked_future) liegen in den letzten Tagen.
  const recentFirst: Scenario[] = ["new_silent", "new_replied", "booked_future"];
  const older = PLAN.filter((s) => !recentFirst.includes(s));
  for (let i = older.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [older[i], older[j]] = [older[j], older[i]];
  }
  const ordered = [...older, ...PLAN.filter((s) => recentFirst.includes(s))];
  const total = ordered.length;

  for (let i = 0; i < total; i++) {
    const scenario = ordered[i];
    const isRecent = recentFirst.includes(scenario);
    const ageDays = isRecent ? 0.3 + (total - 1 - i) * 0.35 : 58 - i * (54 / older.length);
    const createdAt = new Date(now - ageDays * DAY - rand() * 6 * HOUR);
    const name = NAMES[i % NAMES.length];
    const first = name.split(" ")[0];
    const phone = `${DEMO_PREFIX}${String(i + 10).padStart(2, "0")}`;
    const email = `${name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\s+/g, ".")}@example.com`;
    const outreachAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const replied = !["new_silent", "not_reached"].includes(scenario);
    const hasAppt = ["booked_future", "consult_done", "offer", "closed", "cancelled"].includes(scenario);
    const status = STATUS[scenario];
    const reached = !["new_silent", "new_replied", "not_reached", "cancelled"].includes(scenario);
    const closeValue = scenario === "closed" ? Math.round(400 + rand() * 2000) : null;

    const lead = await prisma.lead.create({
      data: {
        customerId,
        source: "Privatschutz",
        name,
        phone,
        email,
        createdAt,
        status,
        reached,
        contactAttempts: scenario === "not_reached" ? 3 : 1,
        firstContactAt: outreachAt,
        outreachAt,
        outreachStatus: "sent",
        closedAt:
          scenario === "closed"
            ? new Date(Math.min(createdAt.getTime() + 10 * DAY, now - 2 * HOUR))
            : null,
        closeValue,
        bezugAirtableId: DEMO_ACCOUNT,
        // Gleiches Format wie aus dem Meta-Leadformular (extractFormAnswers).
        formData: [
          { label: "Lebenssituation", value: LEBENSSITUATION[Math.floor(rand() * LEBENSSITUATION.length)] },
          { label: "Versicherungsinteresse", value: INTERESSE[Math.floor(rand() * INTERESSE.length)] },
        ],
      },
      select: { id: true },
    });

    // ─── WhatsApp-Verlauf ──────────────────────────────────────────────
    type Msg = { dir: "inbound" | "outbound"; by: string | null; body: string; kind?: string };
    const msgs: Msg[] = [
      {
        dir: "outbound",
        by: "system",
        kind: "template",
        body: `Hallo ${first}, danke für deine Anfrage zum Privatschutz! Ich bin Christine aus dem Team von ${advisorFirst}. Hast du kurz Zeit für zwei Fragen, damit wir dir ein passendes Angebot machen können?`,
      },
    ];
    if (scenario === "not_reached") {
      msgs.push({
        dir: "outbound",
        by: "system",
        kind: "template",
        body: `Hallo ${first}, kurze Erinnerung: Wenn du magst, schauen wir gemeinsam in 15 Minuten, welcher Schutz für dich sinnvoll ist. Antworte einfach hier.`,
      });
    }
    let mode: "phone" | "video" = rand() < 0.6 ? "phone" : "video";
    if (replied) {
      msgs.push(
        { dir: "inbound", by: null, body: rand() < 0.5 ? "Hallo, ja gerne 🙂" : "Hi, ja klar, worum geht's genau?" },
        { dir: "outbound", by: "bot", body: "Super, danke dir! Für wen soll der Schutz gelten – nur für dich oder auch für Partner/Familie?" },
        { dir: "inbound", by: null, body: rand() < 0.5 ? "Für mich und meine Frau, wir haben auch zwei Kinder" : "Nur für mich" },
        { dir: "outbound", by: "bot", body: "Verstanden. Hast du aktuell schon eine Haftpflicht- oder Hausratversicherung?" },
        { dir: "inbound", by: null, body: rand() < 0.5 ? "Haftpflicht ja, aber schon ewig alt" : "Nein, bisher gar nichts" },
      );
      if (scenario === "new_replied") {
        msgs.push({ dir: "outbound", by: "bot", body: `Danke! Am besten klärt ${advisorFirst} das kurz persönlich mit dir. Passt dir eher ein Telefonat oder ein kurzer Videocall?` });
      } else if (scenario === "no_interest") {
        msgs.push(
          { dir: "outbound", by: "bot", body: `Danke! Magst du kurz mit ${advisorFirst} sprechen? Telefon oder Video, 15 Minuten.` },
          { dir: "inbound", by: null, body: "Nein danke, ich hab mich schon woanders entschieden." },
          { dir: "outbound", by: "bot", body: "Alles klar, danke für deine Rückmeldung und alles Gute! 🙂" },
        );
      } else {
        msgs.push(
          { dir: "outbound", by: "bot", body: `Danke! Am besten klärt ${advisorFirst} das kurz persönlich mit dir. Passt dir eher ein Telefonat oder ein kurzer Videocall?` },
          { dir: "inbound", by: null, body: mode === "phone" ? "Telefon ist gut" : "Video passt" },
          { dir: "outbound", by: "bot", body: "Ich hätte Dienstag 10:00, Mittwoch 14:00 oder Donnerstag 16:00 frei. Was passt dir?" },
          { dir: "inbound", by: null, body: "Mittwoch 14 Uhr" },
          { dir: "outbound", by: "bot", body: `Perfekt, dein Termin mit ${advisorFirst} ist gebucht ✅ Du bekommst gleich eine Bestätigung per WhatsApp und E-Mail.` },
        );
        if (scenario === "cancelled") {
          msgs.push(
            { dir: "inbound", by: null, body: "Sorry, mir ist was dazwischengekommen, ich muss leider absagen" },
            { dir: "outbound", by: "bot", body: "Kein Problem, ich habe den Termin abgesagt. Melde dich gern, wenn du einen neuen möchtest!" },
          );
        }
        if (scenario === "offer" || scenario === "closed") {
          msgs.push({ dir: "outbound", by: "agent", body: `Hallo ${first}, wie besprochen habe ich dir das Angebot per E-Mail geschickt. Bei Fragen melde dich gern direkt hier! Viele Grüße, ${advisorFirst}` });
          if (scenario === "closed") msgs.push({ dir: "inbound", by: null, body: "Danke, passt alles – ich hab unterschrieben 👍" });
        }
      }
    }

    let t = outreachAt.getTime();
    const stamped = msgs.map((m) => {
      t += (m.dir === "inbound" ? 5 + rand() * 90 : 0.2 + rand() * 1.5) * 60 * 1000;
      if (m.kind === "template" && m !== msgs[0]) t += 2 * DAY;
      return { ...m, at: new Date(Math.min(t, now - 60 * 1000)) };
    });
    const lastInbound = [...stamped].reverse().find((m) => m.dir === "inbound");
    const last = stamped[stamped.length - 1];

    const conv = await prisma.conversation.create({
      data: {
        customerId,
        whatsAppAccountId: accountId,
        leadId: lead.id,
        contactPhone: phone,
        contactName: name,
        contactEmail: replied ? email : null,
        botActive: !(scenario === "offer" || scenario === "closed"),
        qualified: hasAppt,
        qualificationSummary: hasAppt
          ? `${first} interessiert sich für Privatschutz; bevorzugt ${mode === "phone" ? "Telefon" : "Video"}. Bestehende Absicherung lückenhaft, offen für ein Gesamtangebot.`
          : null,
        status: scenario === "no_interest" ? "done" : "open",
        windowExpiresAt: lastInbound ? new Date(lastInbound.at.getTime() + DAY) : null,
        lastMessageAt: last.at,
        createdAt: outreachAt,
      },
      select: { id: true },
    });
    await prisma.message.createMany({
      data: stamped.map((m) => ({
        conversationId: conv.id,
        direction: m.dir,
        kind: m.kind ?? "text",
        body: m.body,
        sentBy: m.by,
        status: m.dir === "outbound" ? "read" : null,
        createdAt: m.at,
      })),
    });

    // ─── Termin ────────────────────────────────────────────────────────
    if (hasAppt) {
      const bookedAt = last.at;
      const startsAt =
        scenario === "booked_future"
          ? atHour(new Date(now + (1 + Math.floor(rand() * 8)) * DAY), [10, 11, 14, 15, 16][Math.floor(rand() * 5)])
          : atHour(new Date(bookedAt.getTime() + 2 * DAY), [10, 14, 16][Math.floor(rand() * 3)]);
      await prisma.appointment.create({
        data: {
          customerId,
          leadId: lead.id,
          conversationId: conv.id,
          mode,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          meetUrl: mode === "video" ? "https://allianz.webex.com/meet/demo" : null,
          status:
            scenario === "booked_future" ? "booked" : scenario === "cancelled" ? "cancelled" : "completed",
          cancelledAt: scenario === "cancelled" ? new Date(bookedAt.getTime() + HOUR) : null,
          cancelledBy: scenario === "cancelled" ? "lead" : null,
          reminderSentAt: new Date(),
          manageToken: `demo_${randomBytes(12).toString("hex")}`,
          createdAt: bookedAt,
        },
      });
      mode = "phone";
    }
  }
  return { leads: total };
}
