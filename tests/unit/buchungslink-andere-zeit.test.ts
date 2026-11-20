// Buchungslink nach dem 2. „Andere Zeit“ (Ole, 20.11.2026): Zählung im Chat, Link nur ab dem 2. Mal, ohne Buchungsseite
// kein Link, Token (signiert, ohne Personendaten), Texte (Sie/Du, ohne Gedankenstriche), Prompt-Regel, Splittest.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  eingaenge: [] as { kind: string | null; body: string | null }[],
  termin: null as { id: string } | null,
  cal: null as { bookingSlug: string | null; status: string } | null,
  gesendet: [] as { to: string; body: string; sentBy?: string }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: vi.fn(async () => db.eingaenge) },
    calendarConnection: { findUnique: vi.fn(async () => db.cal) },
  },
}));
vi.mock("@/lib/whatsapp/termin-strecke", () => ({
  streckenKontext: vi.fn(async () => ({
    conversationId: "conv_abcdefgh1",
    customerId: "cust1",
    phone: "+4917612345678",
    leadId: "lead_abcdefgh1",
    an: "sie",
    person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
    termin: db.termin,
  })),
}));
vi.mock("@/lib/experimente", async (orig) => ({ ...(await orig<typeof import("@/lib/experimente")>()), variante: vi.fn(async () => "a") }));
vi.mock("@/lib/whatsapp/gateway", () => ({
  sendWhatsAppMessage: vi.fn(async (o: { to: string; body: string; sentBy?: string }) => {
    db.gesendet.push(o);
  }),
}));

import {
  andereZeitAnzahl,
  buchungslinkFaellig,
  buchungslinkText,
  chatBuchungToken,
  chatBuchungUrl,
  pruefeChatBuchungToken,
  BUCHUNGSLINK_EXPERIMENT,
} from "@/lib/whatsapp/buchungslink";
import { buchungslinkSenden } from "@/lib/whatsapp/knopf";
import { terminRegeln } from "@/lib/whatsapp/gespraech";
import { EXPERIMENTE } from "@/lib/experimente";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const knopf = { kind: "interactive", body: "Andere Zeit" };

beforeEach(() => {
  db.eingaenge = [];
  db.termin = null;
  db.cal = { bookingSlug: "kannapinn", status: "connected" };
  db.gesendet = [];
});

describe("Zählung", () => {
  it("zählt nur Klicks auf „Andere Zeit“ (Knopf aus Vorlage oder interaktiv)", () => {
    expect(andereZeitAnzahl([knopf, { kind: "button", body: "Andere Zeit" }, { kind: "text", body: "Andere Zeit" }, { kind: "interactive", body: "Lieber andere Zeit" }, { kind: "interactive", body: "Ja, passt" }])).toBe(2);
    expect(buchungslinkFaellig(1)).toBe(false);
    expect(buchungslinkFaellig(2)).toBe(true);
    expect(buchungslinkFaellig(3)).toBe(true);
  });
});

describe("Senden", () => {
  it("erstes Mal: kein Link (bisheriges Verhalten)", async () => {
    db.eingaenge = [knopf];
    expect(await buchungslinkSenden("conv_abcdefgh1")).toBe(false);
    expect(db.gesendet).toHaveLength(0);
  });
  it("zweites Mal: die App schickt den Link selbst", async () => {
    db.eingaenge = [knopf, knopf];
    expect(await buchungslinkSenden("conv_abcdefgh1")).toBe(true);
    expect(db.gesendet).toHaveLength(1);
    const m = db.gesendet[0];
    expect(m.to).toBe("+4917612345678");
    expect(m.sentBy).toBe("bot");
    expect(m.body).toContain("/kannapinn?c=");
    expect(m.body).toContain("Herrn Kannapinn");
    expect(pruefeChatBuchungToken(/c=([^\s]+)/.exec(m.body)![1])).toBe("conv_abcdefgh1");
  });
  it("ohne Buchungsseite (kein Kurzname, Kalender getrennt) bzw. mit Termin: kein Link", async () => {
    db.eingaenge = [knopf, knopf];
    db.cal = { bookingSlug: null, status: "connected" };
    expect(await buchungslinkSenden("conv_abcdefgh1")).toBe(false);
    db.cal = { bookingSlug: "kannapinn", status: "disconnected" };
    expect(await buchungslinkSenden("conv_abcdefgh1")).toBe(false);
    db.cal = null;
    expect(await buchungslinkSenden("conv_abcdefgh1")).toBe(false);
    db.cal = { bookingSlug: "kannapinn", status: "connected" };
    db.termin = { id: "t1" };
    expect(await buchungslinkSenden("conv_abcdefgh1")).toBe(false);
    expect(db.gesendet).toHaveLength(0);
  });
});

describe("Token und Link", () => {
  it("signiert, prüfbar, ohne Personendaten", () => {
    const t = chatBuchungToken("cmabc123def456");
    expect(pruefeChatBuchungToken(t)).toBe("cmabc123def456");
    expect(pruefeChatBuchungToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(pruefeChatBuchungToken("cmabc123def457" + t.slice(t.indexOf(".")))).toBeNull();
    expect(pruefeChatBuchungToken("")).toBeNull();
    expect(pruefeChatBuchungToken("x.y")).toBeNull();
    expect(pruefeChatBuchungToken(null)).toBeNull();
    const u = chatBuchungUrl("kannapinn", "cmabc123def456")!;
    expect(u).toMatch(/\/kannapinn\?c=/);
    expect(u).not.toMatch(/\+49|@/);
    expect(chatBuchungUrl(null, "cmabc123def456")).toBeNull();
    expect(chatBuchungUrl("", "cmabc123def456")).toBeNull();
  });
});

describe("Texte", () => {
  const sie = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
  const du = { nom: "Ole", dat: "Ole" };
  const url = "https://www.dein-beratungstermin.de/kannapinn?c=abc.def";
  it("Sie und Du, beide Fassungen, Link enthalten, ohne Gedankenstriche", () => {
    for (const v of ["a", "b"] as const) {
      const s = buchungslinkText("sie", sie, url, v);
      const d = buchungslinkText("du", du, url, v);
      expect(s).toContain(url);
      expect(d).toContain(url);
      expect(s).toContain("bei Herrn Kannapinn");
      expect(s).toMatch(/Ihren Wunschtag/);
      expect(d).toMatch(/deinen Wunschtag/);
      expect(d).not.toMatch(/\bSie\b|Ihren/);
      expect(hatGedankenstrich(s)).toBe(false);
      expect(hatGedankenstrich(d)).toBe(false);
    }
    expect(buchungslinkText("sie", sie, url)).toBe(
      `Kein Problem! Suchen Sie sich hier selbst eine passende Zeit bei Herrn Kannapinn aus: ${url}\n\nOder schreiben Sie mir einfach Ihren Wunschtag.`,
    );
    expect(buchungslinkText("sie", sie, url, "b").endsWith(url)).toBe(true);
  });
  it("Prompt: die KI schreibt nie selbst einen Link, die App schickt ihn", () => {
    const r = terminRegeln({ an: "sie", person: sie, formate: { telefon: false, vorOrt: false }, beispiel: "…", emailBekannt: true });
    expect(r).toContain("Schreib nie selbst einen Link");
    expect(r).toContain("Den Buchungslink schickt nur die App");
    expect(r).not.toContain("Kein Link, keine Buchungsseite");
  });
  it("Splittest mit Hypothese eingetragen", () => {
    expect(EXPERIMENTE[BUCHUNGSLINK_EXPERIMENT as keyof typeof EXPERIMENTE].ziel).toBe("termin_gebucht");
    expect(SPLITTEST_HYPOTHESE[BUCHUNGSLINK_EXPERIMENT]).toBeTruthy();
  });
});
