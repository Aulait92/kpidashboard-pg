// Buchungsseite: Kurzname änderbar (Ole, 17.11.2026), alter Kurzname leitet weiter, vergebene Namen abgelehnt.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { aktuellerSlugFuer, pruefeSlug, setzeBuchungsSlug } from "@/lib/calendar/buchungslink";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);

describe("Buchungslink ändern", () => {
  let a = "";
  let b = "";
  const t = uid();
  beforeAll(async () => {
    requireTestDb();
    a = (await makeCustomer({})).id;
    b = (await makeCustomer({})).id;
    await prisma.calendarConnection.create({ data: { customerId: a, provider: "google", status: "connected", bookingSlug: `alt-${t}` } });
    await prisma.calendarConnection.create({ data: { customerId: b, provider: "google", status: "connected", bookingSlug: `andere-${t}` } });
  });
  afterAll(async () => {
    await cleanupCustomer(a);
    await cleanupCustomer(b);
  });

  it("prüft und bereinigt die Eingabe", () => {
    expect(pruefeSlug("Agentur Müller")).toEqual({ ok: true, slug: "agentur-mueller" });
    expect(pruefeSlug("ab").ok).toBe(false);
    expect(pruefeSlug("manage").ok).toBe(false);
  });

  it("setzt den neuen Kurznamen, der alte leitet weiter", async () => {
    expect(await setzeBuchungsSlug(a, `Neu ${t}`)).toEqual({ ok: true, slug: `neu-${t}` });
    const c = await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId: a } });
    expect(c.bookingSlug).toBe(`neu-${t}`);
    expect(c.bookingSlugAlt).toContain(`alt-${t}`);
    expect(await aktuellerSlugFuer(`alt-${t}`)).toBe(`neu-${t}`);
  });

  it("vergebene Namen (aktuell oder früher eines anderen Kontos) werden abgelehnt", async () => {
    expect((await setzeBuchungsSlug(b, `neu-${t}`)).ok).toBe(false);
    expect((await setzeBuchungsSlug(b, `alt-${t}`)).ok).toBe(false);
  });

  it("zurück zum alten Namen geht und räumt die Weiterleitung auf", async () => {
    expect((await setzeBuchungsSlug(a, `alt-${t}`)).ok).toBe(true);
    const c = await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId: a } });
    expect(c.bookingSlug).toBe(`alt-${t}`);
    expect(c.bookingSlugAlt).not.toContain(`alt-${t}`);
    expect(c.bookingSlugAlt).toContain(`neu-${t}`);
  });
});
