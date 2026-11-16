// Makler (§ 60 Abs. 1, 2 VVG): Hinweis auf die Marktauswahl in der Präsentation, Text in den Einstellungen änderbar.
// Vertreter sehen keinen Hinweis und können ihn nicht setzen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { angeboteSpeichern, loadPraesentation } from "@/lib/termin-vorbereitung-server";
import { loadMarkthinweis, markthinweisSpeichern } from "@/lib/branding-logo-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ANGEBOTE = {
  items: [
    { sparte: "Privathaftpflicht", gesellschaft: "Haftpflichtkasse", tarif: "Einfach", beitragMonat: 5.9 },
    { sparte: "Privathaftpflicht", gesellschaft: "Interrisk", tarif: "XXL", beitragMonat: 7.4, empfohlen: true },
  ],
};

async function praesentation(customerId: string) {
  const lead = await prisma.lead.create({ data: { customerId, name: "Mia Muster", source: "Privatschutz" } });
  const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 86400000) } });
  const ctx = { customerId, userId: null, teamRole: "owner" as const };
  expect(await angeboteSpeichern(appt.id, ctx, ANGEBOTE, true)).toBe(true);
  return (await loadPraesentation(appt.id, ctx))!;
}
const hinweise = (p: Awaited<ReturnType<typeof praesentation>>) =>
  p.folien.flatMap((f) => [.../data-markthinweis>([^<]*)</.exec(f.html)?.slice(1) ?? []]);

describe("Makler: Hinweis auf die Marktauswahl", () => {
  let makler = "";
  let vertreter = "";
  beforeAll(async () => {
    requireTestDb();
    makler = (await makeCustomer({ name: "Müller Versicherungsmakler", vermittlerTyp: "makler" })).id;
    vertreter = (await makeCustomer({ name: "Allianz Agentur Lohmann", vermittlerTyp: "vertreter" })).id;
  });
  afterAll(async () => {
    await cleanupCustomer(makler);
    await cleanupCustomer(vertreter);
  });

  it("Makler: Standard auf Empfehlung und Vergleich, eigener Text aus den Einstellungen, leer = Standard", async () => {
    expect(await loadMarkthinweis(makler)).toMatchObject({ makler: true, eigener: false, text: "Verglichen wurden Tarife von {gesellschaften}." });
    expect(hinweise(await praesentation(makler))).toEqual([
      "Verglichen wurden Tarife von Haftpflichtkasse und Interrisk.",
      "Verglichen wurden Tarife von Haftpflichtkasse und Interrisk.",
    ]);
    expect(await markthinweisSpeichern(makler, "Meine Marktauswahl – heute: {gesellschaften}.")).toEqual({ ok: true });
    expect((await loadMarkthinweis(makler)).text).toBe("Meine Marktauswahl, heute: {gesellschaften}.");
    expect(hinweise(await praesentation(makler))[0]).toBe("Meine Marktauswahl, heute: Haftpflichtkasse und Interrisk.");
    expect(await markthinweisSpeichern(makler, "  ")).toEqual({ ok: true });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: makler } })).maklerMarkthinweis).toBeNull();
  });

  it("Vertreter: kein Hinweis, Speichern abgelehnt", async () => {
    expect(hinweise(await praesentation(vertreter))).toEqual([]);
    expect((await loadMarkthinweis(vertreter)).makler).toBe(false);
    expect(await markthinweisSpeichern(vertreter, "x {gesellschaften}")).toEqual({ ok: false, error: "Nur für Makler." });
  });
});
