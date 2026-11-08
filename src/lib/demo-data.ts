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
  new_replied: "Im Gespräch",
  not_reached: "Nicht erreicht",
  booked_future: "In Beratung",
  consult_done: "In Beratung",
  offer: "Angebot gesendet",
  closed: "Abschluss",
  no_interest: "Kein Interesse",
  cancelled: "Im Gespräch",
};

// Deterministischer Zufall → gleiche Demo bei jedem Anlegen.
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Uhrzeit h:m in Berliner Zeit (Sommer-/Winterzeit korrekt). */
function atHour(d: Date, h: number, m = 0): Date {
  const x = new Date(d);
  x.setUTCHours(h, m, 0, 0);
  const berlinH = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(x),
  );
  x.setUTCHours(h - (berlinH - h), m, 0, 0);
  return x;
}

/** Samstag/Sonntag → nächster Montag (bzw. vorheriger Freitag bei back). */
function businessDay(d: Date, back = false): Date {
  const x = new Date(d);
  for (let i = 0; i < 3; i++) {
    const wd = x.getUTCDay();
    if (wd !== 0 && wd !== 6) break;
    x.setTime(x.getTime() + (back ? -DAY : DAY));
  }
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
    const createdAt = (() => {
      const d = atHour(new Date(now - ageDays * DAY), 8 + Math.floor(rand() * 12), Math.floor(rand() * 60));
      return d.getTime() > now - 30 * 60 * 1000 ? new Date(now - (40 + rand() * 120) * 60 * 1000) : d;
    })();
    const name = NAMES[i % NAMES.length];
    const first = name.split(" ")[0];
    const phone = `${DEMO_PREFIX}${String(i + 10).padStart(2, "0")}`;
    const email = `${name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\s+/g, ".")}@example.com`;
    const outreachAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const replied = !["new_silent", "not_reached"].includes(scenario);
    const hasAppt = ["booked_future", "consult_done", "offer", "closed", "cancelled"].includes(scenario);
    const status = STATUS[scenario];
    const reached = !["new_silent", "not_reached"].includes(scenario);
    const closeValue = scenario === "closed" ? Math.round(400 + rand() * 2000) : null;
    const situation = LEBENSSITUATION[Math.floor(rand() * LEBENSSITUATION.length)];
    const interest = INTERESSE[Math.floor(rand() * INTERESSE.length)];
    const mode: "phone" | "video" = rand() < 0.6 ? "phone" : "video";

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
          { label: "Lebenssituation", value: situation },
          { label: "Versicherungsinteresse", value: interest },
        ],
      },
      select: { id: true },
    });

    // ─── WhatsApp-Verlauf (passend zu Formular + gebuchtem Termin) ─────
    type Msg = {
      dir: "inbound" | "outbound";
      by: string | null;
      body: string;
      kind?: string;
      /** fester Zeitpunkt (z. B. Nachricht nach dem Beratungstermin) */
      at?: Date;
    };
    const hasHaft = interest.includes("Haftpflicht");
    const hasHausrat = interest.includes("Hausrat");
    const [contractAnswer, contractNote] = hasHaft
      ? rand() < 0.5
        ? ["Haftpflicht hab ich, aber die ist schon über 10 Jahre alt", "Haftpflicht vorhanden, aber über 10 Jahre alt"]
        : ["Nein, bisher hab ich gar nichts", "noch keine Verträge"]
      : rand() < 0.5
        ? ["Nein, noch nichts davon", "noch keine Verträge"]
        : ["Rechtsschutz hatte ich mal, ist aber ausgelaufen", "Rechtsschutz ausgelaufen"];
    const situationQA: Record<string, [string, string]> = {
      Single: hasHausrat
        ? ["Wohnst du zur Miete oder im Eigentum? Das ist für die Hausrat wichtig.", "Zur Miete, 2-Zimmer-Wohnung"]
        : ["Gibt es einen konkreten Anlass, z. B. ein Umzug oder ein Schaden?", "Bin gerade umgezogen und will das mal sauber haben"],
      "Paar ohne Kinder": ["Soll der Schutz auch für deinen Partner bzw. deine Partnerin gelten?", "Ja, für uns beide"],
      "Familie mit Kindern": ["Soll der Schutz für die ganze Familie gelten? Wie alt sind die Kinder ungefähr?", "Ja, für alle – die Kinder sind 4 und 7"],
      Alleinerziehend: ["Sollen deine Kinder mitversichert sein?", "Ja, mein Sohn ist 9"],
      "Paar, Kinder aus dem Haus": ["Soll der Schutz für euch beide gelten?", "Ja, für uns beide"],
    };
    const [sitQ, sitA] = situationQA[situation] ?? ["Für wen soll der Schutz gelten?", "Für mich"];

    // Termin vorab festlegen, damit Chat und Termin übereinstimmen.
    const slotHour = [10, 11, 14, 15, 16][Math.floor(rand() * 5)];
    const startsAt = hasAppt
      ? scenario === "booked_future"
        ? atHour(businessDay(new Date(now + (1 + Math.floor(rand() * 7)) * DAY)), slotHour)
        : atHour(businessDay(new Date(outreachAt.getTime() + (2 + Math.floor(rand() * 2)) * DAY)), slotHour)
      : null;
    const dayFmt = (d: Date) =>
      new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "numeric" }).format(d);
    const timeFmt = (d: Date) =>
      new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);

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
    if (replied) {
      msgs.push(
        { dir: "inbound", by: null, body: rand() < 0.5 ? "Hallo, ja gerne 🙂" : "Hi, ja klar" },
        {
          dir: "outbound",
          by: "bot",
          body: `Super, danke dir! Du hattest angegeben, dass du dich für ${interest} interessierst. Hast du dafür aktuell schon einen Vertrag?`,
        },
        { dir: "inbound", by: null, body: contractAnswer },
        { dir: "outbound", by: "bot", body: `Danke, das hilft schon mal. ${sitQ}` },
        { dir: "inbound", by: null, body: sitA },
      );
      const askMode = `Alles klar! Am besten schaut ${advisorFirst} das kurz persönlich mit dir an, dauert etwa 15 Minuten. Passt dir eher ein Telefonat oder ein kurzer Videocall?`;
      if (scenario === "new_replied") {
        msgs.push({ dir: "outbound", by: "bot", body: askMode });
      } else if (scenario === "no_interest") {
        msgs.push(
          { dir: "outbound", by: "bot", body: askMode },
          { dir: "inbound", by: null, body: "Nein danke, ich hab mich inzwischen schon woanders entschieden." },
          { dir: "outbound", by: "bot", body: "Alles klar, danke für deine Rückmeldung und alles Gute! 🙂" },
        );
      } else if (startsAt) {
        const alt1 = atHour(businessDay(new Date(startsAt.getTime() - DAY), true), slotHour === 10 ? 15 : 10);
        const alt2 = atHour(businessDay(new Date(startsAt.getTime() + DAY)), slotHour === 16 ? 11 : 16);
        const f = (d: Date) => `${dayFmt(d)} um ${timeFmt(d)}`;
        const offer = `${f(alt1)}, ${f(startsAt)} oder ${f(alt2)}`;
        msgs.push(
          { dir: "outbound", by: "bot", body: askMode },
          { dir: "inbound", by: null, body: mode === "phone" ? "Telefon ist gut" : "Video passt" },
          { dir: "outbound", by: "bot", body: `Ich hätte ${offer} frei. Was passt dir am besten?` },
          { dir: "inbound", by: null, body: `${dayFmt(startsAt).split(",")[0]} um ${timeFmt(startsAt).replace(":00", "")} Uhr passt` },
          {
            dir: "outbound",
            by: "bot",
            body:
              `Perfekt, dein ${mode === "phone" ? "Telefontermin" : "Videocall"} mit ${advisorFirst} am ${dayFmt(startsAt)} um ${timeFmt(startsAt)} Uhr ist gebucht ✅ ` +
              (mode === "phone"
                ? `${advisorFirst} ruft dich unter dieser Nummer an.`
                : "Den Video-Link bekommst du mit der Bestätigung per WhatsApp und E-Mail."),
          },
        );
        if (scenario === "cancelled") {
          msgs.push(
            { dir: "inbound", by: null, body: "Sorry, mir ist was dazwischengekommen, ich muss den Termin leider absagen" },
            { dir: "outbound", by: "bot", body: "Kein Problem, ich habe den Termin abgesagt. Melde dich gern, wenn du einen neuen möchtest!" },
          );
        }
        if (scenario === "offer" || scenario === "closed") {
          const after = new Date(startsAt.getTime() + 3 * HOUR);
          msgs.push({
            dir: "outbound",
            by: "agent",
            at: after,
            body: `Hallo ${first}, danke für das nette Gespräch! Wie besprochen habe ich dir das Angebot für ${interest} per E-Mail geschickt. Bei Fragen melde dich gern direkt hier. Viele Grüße, ${advisorFirst}`,
          });
          if (scenario === "closed") {
            msgs.push({
              dir: "inbound",
              by: null,
              at: new Date(after.getTime() + DAY),
              body: "Danke, passt alles – ich hab unterschrieben 👍",
            });
          }
        }
      }
    }

    let t = outreachAt.getTime();
    const stamped = msgs.map((m) => {
      if (m.at) t = m.at.getTime();
      else {
        t += (m.dir === "inbound" ? 5 + rand() * 90 : 0.2 + rand() * 1.5) * 60 * 1000;
        if (m.kind === "template" && m !== msgs[0]) t += 2 * DAY;
      }
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
        qualificationSummary: replied && scenario !== "no_interest"
          ? `${situation}, Interesse an ${interest}; ${contractNote}. Rückfrage: „${sitA}".` +
            (hasAppt ? ` Bevorzugt ${mode === "phone" ? "Telefon" : "Videocall"}.` : "")
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
    if (hasAppt && startsAt) {
      const confirm = stamped.find((m) => m.by === "bot" && m.body.includes("ist gebucht"));
      const bookedAt = confirm?.at ?? last.at;
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
    }
  }
  return { leads: total };
}
