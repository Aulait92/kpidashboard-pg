// § 7 Abs. 3 UWG bei Bestandskunden (Anwalts-Memo, 15.11.2026): Nachweis je Kunde, dass bei der Erhebung der
// E-Mail-Adresse auf das Widerspruchsrecht hingewiesen wurde (Import: Spalte oder pauschale Bestätigung mit
// Wortlaut, protokolliert). Ohne Nachweis E-Mail nur mit Einwilligung; Ablauf/Wechsel nennt den eigenen Vertrag.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ mails: [] as Array<{ to: string; subject: string; text: string }> }));

vi.mock("@/lib/mail/postfach", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/postfach")>();
  return {
    ...real,
    sendViaPostfach: async (_userId: string, m: { to: string; subject: string; text: string }) => {
      st.mails.push(m);
      return { ok: true as const, from: "berater@agentur.test" };
    },
  };
});
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { createCampaign, planAudience, runCampaigns } from "@/lib/bestand/campaigns";
import { importRows } from "@/lib/bestand/import";
import { setHinweis } from "@/lib/bestand/einwilligung-server";
import { NO_PROOF_REASON } from "@/lib/bestand/einwilligung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
// Montag, 16.11.2026, 10:00 Uhr Berlin
const NOW = new Date("2026-11-16T09:00:00Z");

describe("Nachweis zum Widerspruchshinweis (§ 7 Abs. 3 UWG)", () => {
  const customers: string[] = [];
  beforeAll(() => requireTestDb());
  beforeEach(() => {
    st.mails.length = 0;
  });
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
  });

  async function setup() {
    const c = await makeCustomer({ name: `Agentur Nachweis ${uid()}`, existingCustomersEnabled: true, bestandUwgConfirmedAt: NOW, bestandMailImprint: "Agentur\nHauptstr. 1, 12345 Ort" });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "google", email: `berater-${uid()}@agentur.test`, status: "ok" } });
    return { c, owner };
  }

  it("Import: Spalte gilt je Kunde, pauschale Bestätigung nur mit Wortlaut für die übrigen mit E-Mail, „nein“ bleibt, Protokoll mit Wortlaut", async () => {
    const { c, owner } = await setup();
    const t = uid();
    const rows = [
      { Nr: `1${t}`, Mail: `a${t}@kunde.test`, Hinweis: "ja", Sparte: "KFZ" },
      { Nr: `2${t}`, Mail: `b${t}@kunde.test`, Hinweis: "nein", Sparte: "KFZ" },
      { Nr: `3${t}`, Mail: `c${t}@kunde.test`, Hinweis: "", Sparte: "KFZ" },
      { Nr: `4${t}`, Mail: "", Hinweis: "", Sparte: "KFZ" },
    ];
    const r = await importRows(c.id, rows, { externalNo: "Nr", email: "Mail", widerspruchHinweis: "Hinweis", line: "Sparte" }, NOW, {
      hinweis: { text: "Antragsformular Kfz, Abschnitt Datenschutz", at: new Date("2024-01-01T12:00:00Z") },
      actorUserId: owner.id,
      fileName: "bestand.xlsx",
    });
    expect(r.hinweis).toBe(2);
    expect(r.ohneNachweis).toBe(1);
    const all = await prisma.existingCustomer.findMany({ where: { customerId: c.id }, orderBy: { externalNo: "asc" } });
    expect(all.map((e) => [e.widerspruchHinweis, e.widerspruchHinweisSource])).toEqual([
      ["ja", "import"],
      ["nein", "import"],
      ["ja", "import_pauschal"],
      [null, null],
    ]);
    expect(all[0].widerspruchHinweisText).toContain("bestand.xlsx");
    expect(all[2].widerspruchHinweisText).toBe("Antragsformular Kfz, Abschnitt Datenschutz");
    expect(all[2].widerspruchHinweisAt?.toISOString().slice(0, 10)).toBe("2024-01-01");
    const logs = await prisma.bestandConsentLog.findMany({ where: { customerId: c.id, source: "widerspruchshinweis" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.text).join(" | ")).toContain("Wortlaut bzw. Quelle: „Antragsformular Kfz, Abschnitt Datenschutz“");
    expect(logs.every((l) => l.actorUserId === owner.id)).toBe(true);
    // Erneuter Import ohne Bestätigung überschreibt den Nachweis nicht
    await importRows(c.id, rows.map((x) => ({ ...x, Hinweis: "" })), { externalNo: "Nr", email: "Mail", widerspruchHinweis: "Hinweis", line: "Sparte" }, NOW, {});
    expect((await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: c.id, externalNo: `3${t}` } })).widerspruchHinweis).toBe("ja");
  });

  it("Ohne Nachweis keine E-Mail nach § 7 Abs. 3, Ablauf/Wechsel nennt die Sparte des eigenen Vertrags", async () => {
    const { c, owner } = await setup();
    const renew = new Date("2026-12-01T00:00:00Z");
    const mit = await prisma.existingCustomer.create({
      data: { customerId: c.id, firstName: "Erika", lastName: "Mit", salutation: "Frau", email: `mit${uid()}@kunde.test`, lines: ["KFZ", "Hausrat"], nextRenewal: renew, widerspruchHinweis: "ja" },
    });
    await prisma.existingContract.createMany({
      data: [
        { existingCustomerId: mit.id, line: "KFZ", renewalDate: renew },
        { existingCustomerId: mit.id, line: "Hausrat", renewalDate: new Date("2027-05-01T00:00:00Z") },
      ],
    });
    const ohne = await prisma.existingCustomer.create({
      data: { customerId: c.id, firstName: "Max", lastName: "Ohne", salutation: "Herr", email: `ohne${uid()}@kunde.test`, lines: ["KFZ"], nextRenewal: renew },
    });
    const plan = await planAudience(c.id, "renewal", { renewalDays: 60 }, { now: NOW, waAvailable: false });
    expect(plan.recipients.map((x) => [x.id, x.basis])).toEqual([[mit.id, "uwg7_3"]]);
    expect(plan.counts.noProof).toBe(1);
    expect(plan.counts.excluded[NO_PROOF_REASON]).toBe(1);

    // Kampagne mit falschem Thema: die Mail nennt trotzdem den eigenen ablaufenden Vertrag (Kfz)
    const camp = await createCampaign({ customerId: c.id, occasion: "renewal", segment: { renewalDays: 60 }, topic: "Zahnzusatz", dailyLimit: 50, createdById: owner.id, channelMode: "email", now: NOW });
    // Nachweis wird zurückgenommen, bevor die zweite Person geplant wäre; der geplante bleibt erreichbar
    await runCampaigns(NOW, { sleep: async () => {}, rand: () => 0 });
    const mine = st.mails.filter((m) => m.to === mit.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain("Kfz-Versicherung");
    expect(mine[0].subject).not.toContain("Zahnzusatz");
    expect(st.mails.some((m) => m.to === ohne.email)).toBe(false);
    await prisma.customerCampaign.update({ where: { id: camp.id }, data: { status: "done" } });
  });

  it("Nachweis zurückgenommen: geplanter Empfänger wird vor dem Versand übersprungen; Protokoll je Kunde", async () => {
    const { c, owner } = await setup();
    const renew = new Date("2026-12-10T00:00:00Z");
    const e = await prisma.existingCustomer.create({
      data: { customerId: c.id, firstName: "Jana", lastName: "Weg", salutation: "Frau", email: `weg${uid()}@kunde.test`, lines: ["KFZ"], nextRenewal: renew, widerspruchHinweis: "ja" },
    });
    const camp = await createCampaign({ customerId: c.id, occasion: "renewal", segment: { renewalDays: 60 }, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "email", now: NOW });
    await setHinweis(e.id, null, { actorUserId: owner.id, customerId: c.id });
    await runCampaigns(NOW, { sleep: async () => {}, rand: () => 0 });
    expect(st.mails.some((m) => m.to === e.email)).toBe(false);
    const rec = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: camp.id } });
    expect([rec.status, rec.reason]).toEqual(["skipped", NO_PROOF_REASON]);
    await setHinweis(e.id, "ja", { text: "Antrag vom 3.5.2024", actorUserId: owner.id, customerId: c.id });
    const after = await prisma.existingCustomer.findUniqueOrThrow({ where: { id: e.id } });
    expect([after.widerspruchHinweis, after.widerspruchHinweisSource, after.widerspruchHinweisText]).toEqual(["ja", "vermittler", "Antrag vom 3.5.2024"]);
    expect(await prisma.bestandConsentLog.count({ where: { existingCustomerId: e.id, source: "widerspruchshinweis" } })).toBe(2);
    await expect(setHinweis(e.id, "ja", { text: "x", customerId: "fremd" })).rejects.toThrow();
  });
});
