// Buchung direkt nach dem Meta-Leadformular (Ole, 22.11.2026): nur Handynummer, Abgleich mit frischem Lead desselben
// Vermittlers (Nummer normalisiert, 2 Stunden, Kunde), Rückfall mit normalen Feldern, abweichende Nummer über die E-Mail.
// Reine Teile direkt, die Server-Aktion mit gemockter Datenbank.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");

type LeadRow = {
  id: string;
  customerId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  erasedAt: Date | null;
  waUnavailableAt?: Date | null;
  reentries?: { createdAt: Date }[];
};

const db = vi.hoisted(() => ({
  leads: [] as LeadRow[],
  convs: [] as { id: string; customerId: string; contactPhone: string; leadId: string | null; optedOutAt: Date | null; ausgehend: number; contactName?: string | null; contactEmail?: string | null }[],
  booked: [] as Record<string, unknown>[],
  messages: [] as { body: string }[],
  history: [] as { leadId: string; text: string }[],
  confirmations: [] as { to: string; name: string; appointmentId?: string | null; mode?: string }[],
  uebernahmeVorBestaetigung: null as boolean | null,
}));

class Redirect extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), requestIp: vi.fn(async () => "1.2.3.4") }));
vi.mock("@/lib/termin-formate-server", () => ({ loadTerminFormate: vi.fn(async () => ({ telefon: true, vorOrt: false })), agenturOrt: vi.fn(async () => null) }));
vi.mock("@/lib/experimente", () => ({ ereignis: vi.fn(async () => null), variante: vi.fn(async () => "a") }));
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: vi.fn(async (leadId: string, _k: string, text: string) => void db.history.push({ leadId, text })) }));
vi.mock("@/lib/whatsapp/reminders", () => ({
  sendBookingConfirmation: vi.fn(async (o: { to: string; name: string; appointmentId?: string | null; mode?: string }) => void db.confirmations.push({ to: o.to, name: o.name, appointmentId: o.appointmentId, mode: o.mode })),
}));
vi.mock("@/lib/whatsapp/lead-link", () => ({
  // wie das Original: gleiche Nummer, sonst gleiche E-Mail, neuester Lead
  linkLeadToConversation: vi.fn(async (id: string) => {
    const c = db.convs.find((x) => x.id === id)!;
    if (c.leadId) return;
    const l = db.leads.filter((x) => x.customerId === c.customerId && (x.phone === c.contactPhone || (!!c.contactEmail && x.email === c.contactEmail))).sort((a, b) => +b.createdAt - +a.createdAt)[0];
    if (l) c.leadId = l.id;
  }),
}));
vi.mock("@/lib/calendar", () => ({
  SlotBusyError: class extends Error {},
  SchonGebuchtError: class extends Error {},
  bookAppointment: vi.fn(async (o: Record<string, unknown>) => {
    db.booked.push(o);
    return { appointmentId: "appt1", start: o.start, meetUrl: null, manageUrl: null };
  }),
}));

const matchWhere = (row: LeadRow, w: Record<string, unknown>): boolean => {
  if (w.customerId && row.customerId !== w.customerId) return false;
  if ("erasedAt" in w && w.erasedAt === null && row.erasedAt) return false;
  for (const part of (w.AND as Record<string, unknown>[] | undefined) ?? []) {
    if (part.OR) {
      const ors = part.OR as Record<string, unknown>[];
      const ok = ors.some((o) => {
        if ("phone" in o) return row.phone === o.phone;
        if ("phoneDigits" in o) return !!row.phone && row.phone.replace(/^49/, "") === o.phoneDigits;
        if ("createdAt" in o) return row.createdAt >= (o.createdAt as { gte: Date }).gte;
        if ("reentries" in o) return (row.reentries ?? []).some((r) => r.createdAt >= ((o.reentries as { some: { createdAt: { gte: Date } } }).some.createdAt.gte));
        return false;
      });
      if (!ok) return false;
    } else if (part.email) {
      if ((row.email ?? "").toLowerCase() !== (part.email as { equals: string }).equals) return false;
    }
  }
  return true;
};

// Übernahme der Buchungsnummer (lib/whatsapp/buchungsnummer.ts, eigener Test): hier nur, ob und wann sie passiert
vi.mock("@/lib/whatsapp/buchungsnummer", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/buchungsnummer")>()),
  uebernimmBuchungsnummer: vi.fn(async (leadId: string, neu: string) => {
    db.history.push({ leadId, text: `WhatsApp jetzt über die Nummer aus der Online-Buchung +${neu}` });
    db.uebernahmeVorBestaetigung = db.confirmations.length === 0;
    return { ok: true, conversationId: "x", nummer: neu, schon: false };
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarConnection: { findUnique: vi.fn(async () => ({ customerId: "cust1", status: "connected", customer: { leadAddress: "sie" } })) },
    lead: {
      findMany: vi.fn(async (a: { where: Record<string, unknown> }) => db.leads.filter((l) => matchWhere(l, a.where)).sort((x, y) => +y.createdAt - +x.createdAt)),
      findUnique: vi.fn(async (a: { where: { id: string } }) => db.leads.find((l) => l.id === a.where.id) ?? null),
    },
    appointment: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
    whatsAppAccount: { findUnique: vi.fn(async () => ({ id: "wa1" })) },
    conversation: {
      upsert: vi.fn(async (a: { where: { customerId_contactPhone: { customerId: string; contactPhone: string } }; create: { contactName: string; contactEmail: string } }) => {
        const k = a.where.customerId_contactPhone;
        let c = db.convs.find((x) => x.customerId === k.customerId && x.contactPhone === k.contactPhone);
        if (!c) {
          c = { id: `conv${db.convs.length + 1}`, customerId: k.customerId, contactPhone: k.contactPhone, leadId: null, optedOutAt: null, ausgehend: 0, contactName: a.create.contactName, contactEmail: a.create.contactEmail };
          db.convs.push(c);
        }
        return { id: c.id, qualificationSummary: null };
      }),
      updateMany: vi.fn(async (a: { where: { id: string; leadId: null }; data: { leadId: string } }) => {
        const c = db.convs.find((x) => x.id === a.where.id && x.leadId === null);
        if (c) c.leadId = a.data.leadId;
        return { count: c ? 1 : 0 };
      }),
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async (a: { where: { id?: string; customerId_contactPhone?: { customerId: string; contactPhone: string } } }) => {
        const c = a.where.id
          ? db.convs.find((x) => x.id === a.where.id)
          : db.convs.find((x) => x.customerId === a.where.customerId_contactPhone!.customerId && x.contactPhone === a.where.customerId_contactPhone!.contactPhone);
        if (!c) return null;
        const lead = db.leads.find((l) => l.id === c.leadId);
        return { leadId: c.leadId, lead: lead ? { source: "Kfz" } : null, optedOutAt: c.optedOutAt, _count: { messages: c.ausgehend } };
      }),
    },
    message: { create: vi.fn(async (a: { data: { body: string } }) => void db.messages.push({ body: a.data.body })) },
  },
}));

import {
  abweichendeNummerNotiz,
  dankeKennung,
  emailKey,
  findeFormularLead,
  formularBuchungsUrl,
  formularChatWeiterNutzen,
  istVonFormular,
  nummerAusToken,
  nummerToken,
  waehleFormularLead,
} from "@/lib/buchung-formular";
import { bookPublicAction } from "@/app/book/[slug]/actions";
import { resetRateLimits } from "@/lib/rate-limit";

const NOW = new Date("2026-11-22T12:00:00Z");
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);
const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: "lead1",
  customerId: "cust1",
  name: "Max Muster",
  email: "max@example.de",
  phone: "4915112345678",
  createdAt: min(10),
  erasedAt: null,
  ...over,
});

describe("Marker und Link der Dankeseite", () => {
  it("erkennt von=formular, Fassung nur mit harmlosen Zeichen", () => {
    expect(istVonFormular("formular")).toBe(true);
    expect(istVonFormular(" Formular ")).toBe(true);
    expect(istVonFormular("chat")).toBe(false);
    expect(istVonFormular(null)).toBe(false);
    expect(dankeKennung("b2")).toBe("b2");
    expect(dankeKennung("<script>")).toBeNull();
    expect(dankeKennung("x".repeat(30))).toBeNull();
  });

  it("hängt den Marker an die Buchungsadresse, sonst bleibt sie gleich", () => {
    expect(formularBuchungsUrl("https://www.dein-beratungstermin.de/book/lohmann")).toBe("https://www.dein-beratungstermin.de/book/lohmann?von=formular");
    expect(formularBuchungsUrl("https://x.de/book/a?bk=1", "b")).toBe("https://x.de/book/a?bk=1&von=formular&dk=b");
    expect(formularBuchungsUrl("kein link")).toBe("kein link");
  });
});

describe("waehleFormularLead (rein)", () => {
  it("Nummer normalisiert: +49, 0049, 0151 und Leerzeichen treffen denselben Lead", () => {
    for (const p of ["+49 151 12345678", "0049 151 12345678", "0151/12345678", "4915112345678"]) {
      expect(waehleFormularLead([lead()], { phone: p, now: NOW })?.id).toBe("lead1");
    }
    expect(waehleFormularLead([lead()], { phone: "0151 99999999", now: NOW })).toBeNull();
    expect(waehleFormularLead([lead()], { phone: "", now: NOW })).toBeNull();
  });

  it("nur innerhalb von 2 Stunden; erneute Eintragung zählt; gelöscht, ohne Name oder E-Mail zählt nicht", () => {
    expect(waehleFormularLead([lead({ createdAt: min(119) })], { phone: "015112345678", now: NOW })).not.toBeNull();
    expect(waehleFormularLead([lead({ createdAt: min(121) })], { phone: "015112345678", now: NOW })).toBeNull();
    expect(waehleFormularLead([lead({ createdAt: min(600), reentries: [{ createdAt: min(5) }] })], { phone: "015112345678", now: NOW })).not.toBeNull();
    expect(waehleFormularLead([lead({ erasedAt: min(1) })], { phone: "015112345678", now: NOW })).toBeNull();
    expect(waehleFormularLead([lead({ name: " " })], { phone: "015112345678", now: NOW })).toBeNull();
    expect(waehleFormularLead([lead({ email: "kaputt" })], { phone: "015112345678", now: NOW })).toBeNull();
  });

  it("mehrere Treffer: jüngste Einsendung; Ergebnis ohne weitere Felder", () => {
    const r = waehleFormularLead([lead({ id: "alt", createdAt: min(90) }), lead({ id: "neu", createdAt: min(3), email: " Neu@Example.de " })], { phone: "015112345678", now: NOW });
    expect(r).toEqual({ id: "neu", name: "Max Muster", email: "neu@example.de", phone: "4915112345678" });
  });

  it("über die E-Mail (kleingeschrieben, getrimmt)", () => {
    expect(emailKey(" Max@Example.DE ")).toBe("max@example.de");
    expect(waehleFormularLead([lead()], { email: "MAX@example.de", now: NOW })?.id).toBe("lead1");
    expect(waehleFormularLead([lead()], { email: "andere@example.de", now: NOW })).toBeNull();
    expect(waehleFormularLead([lead({ createdAt: min(130) })], { email: "max@example.de", now: NOW })).toBeNull();
  });
});

describe("findeFormularLead (Abfrage)", () => {
  beforeEach(() => {
    db.leads = [];
  });

  it("nur Leads des Vermittlers; wartet kurz auf einen gerade eingehenden Lead", async () => {
    db.leads = [lead({ customerId: "anderer" })];
    expect(await findeFormularLead("cust1", { phone: "015112345678" }, { now: () => NOW })).toBeNull();
    const schlafen = vi.fn(async () => {
      db.leads.push(lead({ id: "spaet", createdAt: min(0) }));
    });
    const r = await findeFormularLead("cust1", { phone: "015112345678" }, { now: () => NOW, warten: [2000], schlafen });
    expect(schlafen).toHaveBeenCalledWith(2000);
    expect(r?.id).toBe("spaet");
  });
});

describe("Nummer für die Rückfallseite", () => {
  it("verschlüsselt, ohne Klartext in der Adresse, 1 Stunde gültig", async () => {
    const t = await nummerToken("4915112345678", NOW.getTime());
    expect(t).toBeTruthy();
    expect(t).not.toContain("15112345678");
    expect(await nummerAusToken(t, NOW.getTime() + 30 * 60_000)).toBe("4915112345678");
    expect(await nummerAusToken(t, NOW.getTime() + 61 * 60_000)).toBeNull();
    expect(await nummerAusToken("abc", NOW.getTime())).toBeNull();
  });
});

describe("abweichende Nummer: Hilfen", () => {
  it("bisherigen Chat nur weiter nutzen, wenn dort geschrieben wurde, kein STOPP und WhatsApp vorhanden", () => {
    expect(formularChatWeiterNutzen({ optedOutAt: null, ausgehend: 2 }, { waUnavailableAt: null })).toBe(true);
    expect(formularChatWeiterNutzen(null, { waUnavailableAt: null })).toBe(false);
    expect(formularChatWeiterNutzen({ optedOutAt: null, ausgehend: 0 }, { waUnavailableAt: null })).toBe(false);
    expect(formularChatWeiterNutzen({ optedOutAt: NOW, ausgehend: 2 }, { waUnavailableAt: null })).toBe(false);
    expect(formularChatWeiterNutzen({ optedOutAt: null, ausgehend: 2 }, { waUnavailableAt: NOW })).toBe(false);
  });

  it("Verlaufseintrag nennt die neue Nummer, ohne Gedankenstrich", () => {
    const t = abweichendeNummerNotiz("4917699999999", true);
    expect(t).toContain("+4917699999999");
    expect(t).toContain("Formular bleibt");
    expect(t).not.toMatch(/[–—]/);
  });
});

// ── Server-Aktion ──────────────────────────────────────────────────────
const START = new Date(Date.now() + 2 * 86_400_000).toISOString();
function form(f: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ start: START, mode: "video", consent: "on", rendered_at: String(Date.now() - 10_000), ...f })) fd.set(k, v);
  return fd;
}
async function run(fd: FormData): Promise<string> {
  try {
    await bookPublicAction("lohmann", fd);
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  throw new Error("kein Redirect");
}

describe("bookPublicAction mit von=formular", () => {
  beforeEach(() => {
    resetRateLimits();
    db.leads = [lead({ createdAt: new Date(Date.now() - 10 * 60_000) })];
    db.convs = [{ id: "convLead", customerId: "cust1", contactPhone: "4915112345678", leadId: "lead1", optedOutAt: null, ausgehend: 1 }];
    db.booked = [];
    db.messages = [];
    db.history = [];
    db.confirmations = [];
    db.uebernahmeVorBestaetigung = null;
  });

  it("nur Handynummer: bucht mit Name und E-Mail des frischen Leads im bestehenden Chat, zeigt nichts davon", async () => {
    const url = await run(form({ von: "formular", dk: "b", phone: "+4915112345678" }));
    expect(url).toBe("/book/lohmann?ok=1&a=appt1&von=formular");
    expect(url).not.toMatch(/max|muster|example/i);
    expect(db.booked[0]).toMatchObject({ leadId: "lead1", conversationId: "convLead", attendeeEmail: "max@example.de", leadName: "Max Muster", leadPhone: "4915112345678" });
    expect(JSON.parse(db.messages[0].body)).toMatchObject({ via: "booking_page", von: "formular", dk: "b", nurHandy: true });
    expect(db.convs).toHaveLength(1);
    // Dankeseite des Leadformulars: Bestätigung mit Termin-ID (Frage nach der Vorbereitung, Ole 26.11.2026), Video ohne Wahl
    expect(db.confirmations[0]).toMatchObject({ to: "4915112345678", appointmentId: "appt1", mode: "video" });
    expect(db.booked[0]).toMatchObject({ mode: "video" });
  });

  it("Terminart: ohne Wahl Video, Telefon nur ausdrücklich gewählt (hier freigegeben)", async () => {
    await run(form({ von: "formular", phone: "+4915112345678", mode: "" }));
    expect(db.booked.at(-1)).toMatchObject({ mode: "video" });
    db.convs[0].leadId = "lead1";
    await run(form({ von: "formular", phone: "+4915112345678", mode: "phone" }));
    expect(db.booked.at(-1)).toMatchObject({ mode: "phone" });
  });

  it("kein frischer Lead (zu alt): zurück mit Feldern, Uhrzeit und Gesprächsart vorgemerkt, Nummer verschlüsselt", async () => {
    db.leads = [lead({ createdAt: new Date(Date.now() - 3 * 3_600_000) })];
    const url = await run(form({ von: "formular", phone: "+4915112345678" }));
    const q = new URL(url, "https://x.de").searchParams;
    expect(q.get("err")).toBe("angaben");
    expect(q.get("voll")).toBe("1");
    expect(q.get("s")).toBe(START);
    expect(q.get("m")).toBe("video");
    expect(url).not.toContain("15112345678");
    expect(await nummerAusToken(q.get("pk"))).toBe("4915112345678");
    expect(db.booked).toHaveLength(0);
  }, 15_000);

  it("Lead eines anderen Vermittlers mit gleicher Nummer: kein Treffer", async () => {
    db.leads = [lead({ customerId: "anderer", createdAt: new Date() })];
    const url = await run(form({ von: "formular", phone: "+4915112345678" }));
    expect(url).toContain("err=angaben");
  }, 15_000);

  it("Fehler behalten den Marker (z. B. fehlende Einwilligung)", async () => {
    const fd = form({ von: "formular", dk: "a", phone: "+4915112345678" });
    fd.delete("consent");
    expect(await run(fd)).toBe("/book/lohmann?von=formular&dk=a&err=consent");
  });

  it("andere Nummer, E-Mail passt: Termin am Lead im bisherigen Chat, neue Nummer nur im Verlauf", async () => {
    const url = await run(form({ von: "formular", voll: "1", name: "Max M.", email: "MAX@example.de", phone: "+4917699999999" }));
    expect(url).toBe("/book/lohmann?ok=1&a=appt1");
    expect(db.booked[0]).toMatchObject({ leadId: "lead1", conversationId: "convLead", leadPhone: "4915112345678" });
    expect(db.convs).toHaveLength(1);
    expect(db.history[0].leadId).toBe("lead1");
    expect(db.history[0].text).toContain("+4917699999999");
    expect(db.confirmations[0].to).toBe("4915112345678");
    expect(db.leads[0].phone).toBe("4915112345678");
    expect(JSON.parse(db.messages[0].body)).toMatchObject({ abweichendeNummer: true });
  });

  it("andere Nummer, E-Mail passt, Formular-Nummer ohne WhatsApp: Buchung über die neue Nummer, trotzdem am Lead", async () => {
    db.leads[0].waUnavailableAt = new Date();
    await run(form({ name: "Max M.", email: "max@example.de", phone: "+4917699999999" }));
    expect(db.booked[0]).toMatchObject({ leadId: "lead1", leadPhone: "4917699999999" });
    expect(db.booked[0].conversationId).not.toBe("convLead");
    expect(db.convs.find((c) => c.contactPhone === "4917699999999")?.leadId).toBe("lead1");
    // Formular-Nummer ohne WhatsApp (23.11.2026): neue Nummer wird WhatsApp-Kontakt, vor der Bestätigung; ein Verlaufseintrag
    expect(db.history).toHaveLength(1);
    expect(db.history[0].text).toContain("WhatsApp jetzt über die Nummer aus der Online-Buchung +4917699999999");
    expect(db.uebernahmeVorBestaetigung).toBe(true);
    expect(db.confirmations[0]?.to).toBe("4917699999999");
  });

  it("weder Nummer noch E-Mail passen: normale Buchung wie bisher, kein Verlaufseintrag", async () => {
    await run(form({ name: "Erika", email: "erika@example.de", phone: "+4917611111111" }));
    expect(db.booked[0]).toMatchObject({ leadId: null, leadPhone: "4917611111111", attendeeEmail: "erika@example.de" });
    expect(db.history).toHaveLength(0);
  });
});

describe("Seite und Kampagne", () => {
  it("Seite: Nur-Handynummer-Fassung behält Einwilligung, Datenschutz und Erinnerungs-Häkchen; zeigt keine Lead-Daten", () => {
    const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8");
    expect(page).toContain("const nurHandy = vonFormular && sp.voll !== \"1\";");
    // Einwilligung und Datenschutzhinweis hängen nicht an nurHandy
    expect(page).toContain('<input type="checkbox" name="consent" required className="mt-0.5" />');
    expect(page).toContain("Die Einladung geht an die E-Mail-Adresse aus Ihrer Anfrage.");
    expect(page).not.toMatch(/formularLead|lead\.email\}/);
  });
});
