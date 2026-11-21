// Termine per Weiterleitung blockieren (Ole, 21.11.2026): weitergeleitete Outlook-Einladung an die persönliche
// Termin-Adresse blockiert die Zeit im App-Kalender. Parser (Einladung, Serie, Aktualisierung, Absage, Windows-TZID,
// keine Kalenderdatei), MIME (text/calendar, eingebettete Nachricht), Zuordnung über den Token, Blockierung
// anlegen/verschieben/freigeben, kein Betreff in der Datenbank, Texte ohne Gedankenstriche.
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Datenbank im Speicher ─────────────────────────────────────────────────

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  weiterleitung: [] as Record<string, unknown>[],
  blocks: [] as Record<string, unknown>[],
  eingang: {} as Record<string, unknown>,
  termine: [] as Record<string, unknown>[],
  users: [] as { email: string; customerId: string }[],
  advisorEmail: null as string | null,
  mails: [] as { to: string; subject: string; paragraphs: string[] }[],
  pushes: [] as { ziel: string; title: string; body: string }[],
}));

function passt(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v instanceof Date) return row[k] instanceof Date && (row[k] as Date).getTime() === v.getTime();
    if (v && typeof v === "object") return true;
    return row[k] === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    kalenderWeiterleitung: {
      findUnique: async ({ where }: { where: Row }) => db.weiterleitung.find((r) => passt(r, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        db.weiterleitung.push(data);
        return data;
      },
    },
    customer: { findUnique: async () => ({ dataDeletedAt: null }) },
    mailEingang: {
      create: async ({ data }: { data: Row }) => ({ id: `ein_${String(data.resendEmailId)}`, contactMailId: null, weitergeleitetAt: null, pushAt: null, versuche: 1 }),
      count: async () => 0,
      update: async ({ data }: { data: Row }) => {
        Object.assign(db.eingang, data);
        return db.eingang;
      },
    },
    calendarBlock: {
      findMany: async ({ where }: { where: Row }) =>
        db.blocks.filter((r) => passt(r, where)).sort((a, b) => (a.startsAt as Date).getTime() - (b.startsAt as Date).getTime()),
      deleteMany: async ({ where }: { where: Row }) => {
        const vorher = db.blocks.length;
        db.blocks = db.blocks.filter((r) => !passt(r, where));
        return { count: vorher - db.blocks.length };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        db.blocks.push(...data.map((d, i) => ({ id: `b${db.blocks.length + i}`, ...d })));
        return { count: data.length };
      },
    },
    appointment: {
      findMany: async ({ where }: { where: { startsAt: { gt: Date; lt: Date } } }) =>
        db.termine.filter((t) => (t.startsAt as Date) > where.startsAt.gt && (t.startsAt as Date) < where.startsAt.lt),
    },
    user: { findFirst: async ({ where }: { where: { email: { equals: string } } }) => (db.users.some((u) => u.email === where.email.equals) ? { id: "u1" } : null) },
    agentConfig: { findUnique: async () => ({ advisorEmail: db.advisorEmail }) },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});

vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  getAppUrl: () => "https://app.test",
  sendCustomerMail: async (o: { to: string; subject: string; paragraphs: string[] }) => {
    db.mails.push({ to: o.to, subject: o.subject, paragraphs: o.paragraphs });
    return { ok: true };
  },
}));

vi.mock("@/lib/push", () => ({
  sendToUser: async (id: string, p: { title: string; body: string }) => db.pushes.push({ ziel: id, ...p }),
  sendToBuyersOfCustomer: async (id: string, p: { title: string; body: string }) => db.pushes.push({ ziel: id, ...p }),
}));

import {
  ianaZone,
  kalenderAusMime,
  neuerToken,
  parseTerminAdresse,
  rueckmeldungErfolg,
  rueckmeldungFehler,
  terminAdresse,
  termineAusKalendern,
  ueberschneidungPush,
  zeitText,
} from "@/lib/calendar/termin-weiterleitung";
import { verarbeiteTerminMail, wendeTerminAn } from "@/lib/calendar/termin-weiterleitung-server";
import { parseAntwortAdresse } from "@/lib/mail/antwort-adresse";
import { verarbeiteMailEingang } from "@/lib/mail/eingang";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import type { EingangApi } from "@/lib/mail/eingang-api";

// ─── Kalenderdaten ─────────────────────────────────────────────────────────

const NOW = new Date("2026-11-21T12:00:00Z");

const VTZ = (name: string) => `BEGIN:VTIMEZONE
TZID:${name}
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE`;

function ics(o: { method?: string; uid?: string; seq?: number; start: string; end: string; tz?: string; vtz?: string; extra?: string[]; ohneTzBlock?: boolean }): string {
  const tz = o.tz ?? "W. Europe Standard Time";
  return [
    "BEGIN:VCALENDAR",
    "PRODID:Microsoft Exchange Server 2010",
    "VERSION:2.0",
    ...(o.method ? [`METHOD:${o.method}`] : []),
    ...(o.ohneTzBlock ? [] : [VTZ(o.vtz ?? tz)]),
    "BEGIN:VEVENT",
    "ORGANIZER;CN=Chefin:mailto:chefin@allianz.de",
    "ATTENDEE;CN=Henrik Lohmann:mailto:henrik.lohmann@allianz.de",
    "SUMMARY;LANGUAGE=de-DE:Vertriebsrunde Bezirk Nord (vertraulich)",
    `DTSTART;TZID=${tz}:${o.start}`,
    `DTEND;TZID=${tz}:${o.end}`,
    `UID:${o.uid ?? "040000008200E00074C5B7101A82E00800000000ABCDEF"}`,
    `SEQUENCE:${o.seq ?? 0}`,
    "LOCATION:Büro Hamburg",
    ...(o.extra ?? []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .join("\r\n")
    .replace(/\r?\n/g, "\r\n");
}

const iso = (d: Date) => d.toISOString();

describe("Termin-Adresse", () => {
  it("Token: 20 Zeichen base32, Adresse auf der Eingangs-Domain, Zerlegen", () => {
    const t = neuerToken();
    expect(t).toMatch(/^[a-z2-7]{20}$/);
    expect(neuerToken()).not.toBe(t);
    const a = terminAdresse(t);
    expect(a).toBe(`termine-${t}@antwort.dein-beratungstermin.de`);
    expect(parseTerminAdresse(`Termine <${a.toUpperCase()}>`)).toBe(t);
    expect(parseTerminAdresse(a.replace("@", "+x@"))).toBe(t);
    expect(parseTerminAdresse(`termine-${t}@andere.de`)).toBeNull();
    expect(parseTerminAdresse("termine-kurz@antwort.dein-beratungstermin.de")).toBeNull();
    expect(parseTerminAdresse("mueller.abcdefgh@antwort.dein-beratungstermin.de")).toBeNull();
    // Die Antwortadresse bleibt unberührt
    expect(parseAntwortAdresse("mueller.abcdefgh@antwort.dein-beratungstermin.de")?.code).toBe("abcdefgh");
  });
});

describe("Termine auslesen", () => {
  it("Outlook-Einladung mit VTIMEZONE (Windows-Name): Beginn und Ende in Berliner Zeit", () => {
    const r = termineAusKalendern([ics({ method: "REQUEST", start: "20261125T100000", end: "20261125T110000" })], NOW);
    expect(r.aktionen).toHaveLength(1);
    const a = r.aktionen[0];
    expect(a.art).toBe("blockieren");
    expect(a.serie).toBe(false);
    expect(a.vorkommen).toBeNull();
    expect(a.uidHash).toMatch(/^[0-9a-f]{32}$/);
    expect(a.zeiten.map((z) => [iso(z.start), iso(z.end)])).toEqual([["2026-11-25T09:00:00.000Z", "2026-11-25T10:00:00.000Z"]]);
  });

  it("Windows-TZID ohne VTIMEZONE, auch im Sommer; IANA-Name; eigene Zone der Datei", () => {
    const winter = termineAusKalendern([ics({ start: "20261125T100000", end: "20261125T103000", ohneTzBlock: true })], NOW);
    expect(iso(winter.aktionen[0].zeiten[0].start)).toBe("2026-11-25T09:00:00.000Z");
    const sommer = termineAusKalendern([ics({ start: "20270707T100000", end: "20270707T110000", ohneTzBlock: true })], NOW);
    expect(iso(sommer.aktionen[0].zeiten[0].start)).toBe("2027-07-07T08:00:00.000Z");
    const iana = termineAusKalendern([ics({ start: "20261125T100000", end: "20261125T110000", tz: "Europe/Berlin", ohneTzBlock: true })], NOW);
    expect(iso(iana.aktionen[0].zeiten[0].start)).toBe("2026-11-25T09:00:00.000Z");
    const eigen = termineAusKalendern([ics({ start: "20270707T100000", end: "20270707T110000", tz: "Customized Time Zone" })], NOW);
    expect(iso(eigen.aktionen[0].zeiten[0].start)).toBe("2027-07-07T08:00:00.000Z");
    expect(ianaZone("(UTC+01:00) Amsterdam, Berlin, Bern, Rom, Stockholm, Wien")).toBe("Europe/Berlin");
    expect(ianaZone("/mozilla.org/20050126_1/Europe/Berlin")).toBe("Europe/Berlin");
    expect(ianaZone("GMT Standard Time")).toBe("Europe/London");
  });

  it("Serie: Vorkommen der nächsten 90 Tage, ohne ausgelassene (EXDATE), über die Zeitumstellung hinweg", () => {
    const r = termineAusKalendern(
      [ics({ start: "20261124T080000", end: "20261124T090000", extra: ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=W. Europe Standard Time:20261201T080000"] })],
      NOW,
    );
    const a = r.aktionen[0];
    expect(a.serie).toBe(true);
    // 24.11. bis einschließlich 16.02. = 13 Dienstage, einer ausgelassen
    expect(a.zeiten).toHaveLength(12);
    expect(a.zeiten.map((z) => iso(z.start))).not.toContain("2026-12-01T07:00:00.000Z");
    expect(iso(a.zeiten[0].start)).toBe("2026-11-24T07:00:00.000Z");
    expect(a.zeiten.every((z) => z.vorkommen && z.vorkommen.getTime() === z.start.getTime())).toBe(true);
    expect(a.zeiten[a.zeiten.length - 1].start.getTime()).toBeLessThan(NOW.getTime() + 90 * 86_400_000);
    // Obergrenze
    const viele = termineAusKalendern([ics({ start: "20261121T150000", end: "20261121T151500", extra: ["RRULE:FREQ=DAILY"] })], NOW, { max: 20 });
    expect(viele.aktionen[0].zeiten).toHaveLength(20);
  });

  it("Aktualisierung (höhere SEQUENCE gewinnt), Absage (CANCEL), einzelnes Vorkommen (RECURRENCE-ID)", () => {
    const alt = ics({ method: "REQUEST", seq: 0, start: "20261125T100000", end: "20261125T110000" });
    const neu = ics({ method: "REQUEST", seq: 1, start: "20261126T140000", end: "20261126T150000" });
    const beide = termineAusKalendern([neu, alt], NOW);
    expect(beide.aktionen).toHaveLength(1);
    expect(beide.aktionen[0].sequence).toBe(1);
    expect(iso(beide.aktionen[0].zeiten[0].start)).toBe("2026-11-26T13:00:00.000Z");

    const absage = termineAusKalendern([ics({ method: "CANCEL", seq: 2, start: "20261126T140000", end: "20261126T150000", extra: ["STATUS:CANCELLED"] })], NOW);
    expect(absage.aktionen[0]).toMatchObject({ art: "freigeben", sequence: 2, zeiten: [] });
    expect(absage.aktionen[0].uidHash).toBe(beide.aktionen[0].uidHash);

    const einzel = termineAusKalendern(
      [ics({ method: "REQUEST", seq: 3, start: "20261208T090000", end: "20261208T100000", extra: ["RECURRENCE-ID;TZID=W. Europe Standard Time:20261208T080000"] })],
      NOW,
    );
    expect(einzel.aktionen[0]).toMatchObject({ art: "blockieren", serie: true });
    expect(iso(einzel.aktionen[0].vorkommen!)).toBe("2026-12-08T07:00:00.000Z");
    expect(iso(einzel.aktionen[0].zeiten[0].start)).toBe("2026-12-08T08:00:00.000Z");
  });

  it("Kein Termin, Antworten, Vergangenes, eigene Einladungen der App, ganztägig", () => {
    expect(termineAusKalendern([], NOW).aktionen).toEqual([]);
    expect(termineAusKalendern(["kein Kalender"], NOW).aktionen).toEqual([]);
    expect(termineAusKalendern([ics({ method: "REPLY", start: "20261125T100000", end: "20261125T110000" })], NOW).aktionen).toEqual([]);
    const vorbei = termineAusKalendern([ics({ start: "20261120T100000", end: "20261120T110000" })], NOW);
    expect(vorbei).toMatchObject({ aktionen: [], vergangen: 1 });
    const eigen = termineAusKalendern([ics({ uid: "abc123@terminbuchung", start: "20261125T100000", end: "20261125T110000" })], NOW);
    expect(eigen).toMatchObject({ aktionen: [], eigene: 1 });
    const ganz = termineAusKalendern(
      ["BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:urlaub\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261203\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"],
      NOW,
    );
    expect(ganz.aktionen[0].zeiten.map((z) => [iso(z.start), iso(z.end)])).toEqual([["2026-11-30T23:00:00.000Z", "2026-12-02T23:00:00.000Z"]]);
  });
});

describe("Kalenderteile in der Mail", () => {
  const kal = ics({ method: "REQUEST", start: "20261125T100000", end: "20261125T110000" });
  it("Outlook-Weiterleitung: text/calendar (base64) in multipart/alternative", () => {
    const mime = [
      "From: Henrik <henrik.lohmann@allianz.de>",
      "Subject: WG: Vertriebsrunde",
      'Content-Type: multipart/mixed; boundary="aussen"',
      "",
      "--aussen",
      'Content-Type: multipart/alternative; boundary="innen"',
      "",
      "--innen",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Siehe unten",
      "--innen",
      'Content-Type: text/calendar; charset="utf-8"; method=REQUEST',
      "Content-Transfer-Encoding: base64",
      "",
      ...(Buffer.from(kal, "utf8").toString("base64").match(/.{1,76}/g) ?? []),
      "--innen--",
      "--aussen--",
      "",
    ].join("\r\n");
    const k = kalenderAusMime(Buffer.from(mime, "latin1"));
    expect(k).toHaveLength(1);
    expect(termineAusKalendern(k, NOW).aktionen).toHaveLength(1);
  });

  it("Als Anlage weitergeleitet: message/rfc822 mit invite.ics (quoted-printable)", () => {
    const qp = kal.replace(/=/g, "=3D").replace(/ü/g, "=C3=BC");
    const innen = ["Subject: Vertriebsrunde", 'Content-Type: multipart/mixed; boundary="b2"', "", "--b2", "Content-Type: text/plain", "", "Hallo", "--b2", 'Content-Type: application/octet-stream; name="invite.ics"', 'Content-Disposition: attachment; filename="invite.ics"', "Content-Transfer-Encoding: quoted-printable", "", qp, "--b2--", ""].join("\r\n");
    const mime = ['Content-Type: multipart/mixed; boundary="b1"', "", "--b1", "Content-Type: text/plain", "", "FYI", "--b1", "Content-Type: message/rfc822", "", innen, "--b1--", ""].join("\r\n");
    const k = kalenderAusMime(mime);
    expect(k).toHaveLength(1);
    expect(iso(termineAusKalendern(k, NOW).aktionen[0].zeiten[0].start)).toBe("2026-11-25T09:00:00.000Z");
  });

  it("Ohne Kalenderteil: nichts", () => {
    expect(kalenderAusMime("Content-Type: text/plain\r\n\r\nTermin am Dienstag um 10 Uhr")).toEqual([]);
  });
});

// ─── Datenbank ─────────────────────────────────────────────────────────────

const KEY = "kunde1";
const TOKEN = "abcdefghijklmnopqrst";

function api(roh: string): EingangApi {
  return {
    mail: async (id: string) => ({
      id,
      from: "Henrik Lohmann <henrik.lohmann@allianz.de>",
      to: [terminAdresse(TOKEN)],
      subject: "WG: Vertriebsrunde Bezirk Nord (vertraulich)",
      text: "Siehe Einladung",
      html: null,
      headers: {},
      authentication: null,
      rawUrl: "https://resend.test/raw",
    }),
    anhaenge: async () => [],
    anhang: async () => null,
    datei: async () => Buffer.from(roh, "utf8"),
  };
}

const mimeMit = (k: string) => `Content-Type: text/calendar; method=REQUEST\r\n\r\n${k}`;

async function weiterleiten(k: string, id = "e1") {
  db.eingang = {};
  return verarbeiteTerminMail({ eingangId: id, emailId: id, token: TOKEN, now: NOW, api: api(mimeMit(k)), zeile: { weitergeleitetAt: null, pushAt: null } });
}

describe("Blockieren über die Termin-Adresse", () => {
  beforeEach(() => {
    db.weiterleitung = [{ calendarKey: KEY, customerId: KEY, token: TOKEN }];
    db.blocks = [];
    db.termine = [];
    db.mails = [];
    db.pushes = [];
    db.users = [{ email: "henrik.lohmann@allianz.de", customerId: KEY }];
    db.advisorEmail = null;
    process.env.RESEND_API_KEY = "re_test";
  });

  it("Einladung → Block mit Herkunft; ohne Betreff, Ort, Teilnehmer; Bestätigung per Mail", async () => {
    const r = await weiterleiten(ics({ method: "REQUEST", start: "20261125T100000", end: "20261125T110000" }));
    expect(r.ergebnis).toBe("termin");
    expect(db.blocks).toHaveLength(1);
    const b = db.blocks[0];
    expect(Object.keys(b).sort()).toEqual(["calendarKey", "customerId", "endsAt", "id", "note", "quelle", "sequence", "startsAt", "uidHash", "vorkommen"]);
    expect(b).toMatchObject({ calendarKey: KEY, quelle: "weitergeleitet", sequence: 0, note: null, vorkommen: null });
    const gespeichert = JSON.stringify([db.blocks, db.eingang]);
    for (const geheim of ["Vertriebsrunde", "vertraulich", "Hamburg", "chefin", "henrik", "040000008200E0007"]) expect(gespeichert).not.toContain(geheim);
    expect(db.mails).toHaveLength(1);
    expect(db.mails[0].to).toBe("henrik.lohmann@allianz.de");
    expect(db.mails[0].subject).toBe("Zeit blockiert: Mi., 25.11., 10 bis 11 Uhr");
    expect(db.eingang).toMatchObject({ ergebnis: "termin", zuordnung: "termin" });
  });

  it("Aktualisierung verschiebt, ältere Fassung ändert nichts, Absage gibt frei", async () => {
    await weiterleiten(ics({ method: "REQUEST", seq: 1, start: "20261125T100000", end: "20261125T110000" }));
    await weiterleiten(ics({ method: "REQUEST", seq: 2, start: "20261126T140000", end: "20261126T153000" }), "e2");
    expect(db.blocks.map((b) => [iso(b.startsAt as Date), iso(b.endsAt as Date), b.sequence])).toEqual([["2026-11-26T13:00:00.000Z", "2026-11-26T14:30:00.000Z", 2]]);
    expect(db.mails[1].subject).toBe("Zeit verschoben: Do., 26.11., 14 bis 15:30 Uhr");

    await weiterleiten(ics({ method: "REQUEST", seq: 1, start: "20261125T100000", end: "20261125T110000" }), "e3");
    expect(iso(db.blocks[0].startsAt as Date)).toBe("2026-11-26T13:00:00.000Z");
    expect(db.mails[2].subject).toBe("Ältere Fassung, nichts geändert");

    await weiterleiten(ics({ method: "CANCEL", seq: 3, start: "20261126T140000", end: "20261126T153000" }), "e4");
    expect(db.blocks).toEqual([]);
    expect(db.mails[3].subject).toBe("Zeit wieder frei: Do., 26.11., 14 bis 15:30 Uhr");
  });

  it("Serie: ein Block je Vorkommen; Einzeländerung verschiebt nur dieses; Absage der Serie gibt alle frei", async () => {
    await weiterleiten(ics({ seq: 0, start: "20261124T080000", end: "20261124T090000", extra: ["RRULE:FREQ=WEEKLY;BYDAY=TU"] }));
    expect(db.blocks).toHaveLength(13);
    expect(db.mails[0].subject).toBe("Serie blockiert: 13 Termine ab Di., 24.11., 8 bis 9 Uhr");
    await weiterleiten(ics({ seq: 1, start: "20261202T120000", end: "20261202T130000", extra: ["RECURRENCE-ID;TZID=W. Europe Standard Time:20261201T080000"] }), "e2");
    expect(db.blocks).toHaveLength(13);
    const starts = db.blocks.map((b) => iso(b.startsAt as Date));
    expect(starts).toContain("2026-12-02T11:00:00.000Z");
    expect(starts).not.toContain("2026-12-01T07:00:00.000Z");
    await weiterleiten(ics({ method: "CANCEL", seq: 1, start: "20261124T080000", end: "20261124T090000", extra: ["RRULE:FREQ=WEEKLY;BYDAY=TU"] }), "e3");
    expect(db.blocks).toEqual([]);
  });

  it("Gebuchter Lead-Termin in der Zeit: bleibt, Push und Hinweis in der Mail", async () => {
    db.termine = [{ customerId: KEY, status: "booked", startsAt: new Date("2026-11-25T09:30:00Z"), endsAt: new Date("2026-11-25T10:00:00Z"), leadId: "l1", lead: { name: "Julia Schneider" } }];
    await weiterleiten(ics({ start: "20261125T100000", end: "20261125T110000" }));
    expect(db.pushes).toHaveLength(1);
    expect(db.pushes[0]).toMatchObject({ ziel: KEY, title: "Überschneidung", body: "Termin mit Julia Schneider am Mi., 25.11., 10:30 Uhr liegt in einer blockierten Zeit.", url: "/buyer/leads/l1" });
    expect(db.mails[0].paragraphs.join(" ")).toContain("Termin mit Julia Schneider am Mi., 25.11., 10:30 Uhr. Er bleibt bestehen");
  });

  it("Unbekannter Token, kein Termin, fremder Absender", async () => {
    db.weiterleitung = [];
    expect((await weiterleiten(ics({ start: "20261125T100000", end: "20261125T110000" }))).grund).toBe("termin_unbekannt");
    expect(db.blocks).toEqual([]);

    db.weiterleitung = [{ calendarKey: KEY, customerId: KEY, token: TOKEN }];
    db.eingang = {};
    const leer = await verarbeiteTerminMail({ eingangId: "e5", emailId: "e5", token: TOKEN, now: NOW, api: api("Content-Type: text/plain\r\n\r\nHallo"), zeile: { weitergeleitetAt: null, pushAt: null } });
    expect(leer).toMatchObject({ ergebnis: "hinweis", grund: "termin_kein_termin" });
    expect(db.mails.at(-1)?.subject).toBe("Kein Termin gefunden");

    // Fremder Absender ohne Kalenderdatei: keine Mail, kein Push
    db.users = [];
    db.mails = [];
    await verarbeiteTerminMail({ eingangId: "e6", emailId: "e6", token: TOKEN, now: NOW, api: api("Content-Type: text/plain\r\n\r\nSpam"), zeile: { weitergeleitetAt: null, pushAt: null } });
    expect(db.mails).toEqual([]);
    expect(db.pushes).toEqual([]);
    // Fremder Absender mit Termin: blockiert, Bestätigung als Push statt Mail
    await weiterleiten(ics({ start: "20261125T100000", end: "20261125T110000" }), "e7");
    expect(db.blocks).toHaveLength(1);
    expect(db.mails).toEqual([]);
    expect(db.pushes[0].title).toBe("Zeit blockiert: Mi., 25.11., 10 bis 11 Uhr");
  });

  it("Mail-Eingang: Mails an die Termin-Adresse gehen in die Terminverarbeitung (auch bei ausgeschaltetem Antwort-Eingang)", async () => {
    db.eingang = {};
    const r = await verarbeiteMailEingang(
      { type: "email.received", data: { email_id: "e8", to: [`Termine <${terminAdresse(TOKEN)}>`] } },
      { now: NOW, api: api(mimeMit(ics({ start: "20261125T100000", end: "20261125T110000" }))) },
    );
    expect(r).toMatchObject({ ergebnis: "termin", eingangId: "ein_e8" });
    expect(db.blocks).toHaveLength(1);
  });

  it("wendeTerminAn direkt: Absage ohne Block = nicht gefunden", async () => {
    const r = await wendeTerminAn(KEY, KEY, [{ uidHash: "x", sequence: 0, art: "freigeben", vorkommen: null, serie: false, zeiten: [] }], NOW);
    expect(r.angewendet[0].art).toBe("nicht_gefunden");
  });
});

describe("Texte", () => {
  it("Zeiten lesbar, Sie-Form, ohne Gedankenstriche", () => {
    const s = new Date("2026-11-25T09:00:00Z");
    expect(zeitText(s, new Date("2026-11-25T10:00:00Z"))).toBe("Mi., 25.11., 10 bis 11 Uhr");
    expect(zeitText(s, new Date("2026-11-26T11:15:00Z"))).toBe("Mi., 25.11., 10 Uhr bis Do., 26.11., 12:15 Uhr");
    expect(zeitText(new Date("2026-11-30T23:00:00Z"), new Date("2026-12-02T23:00:00Z"))).toBe("Di., 01.12. bis Mi., 02.12., ganztägig");
    const z = [{ start: s, end: new Date("2026-11-25T10:00:00Z"), vorkommen: null }];
    const texte = [
      rueckmeldungErfolg([{ art: "blockiert", serie: false, zeiten: z }], [{ name: "Julia", start: s, leadId: null }]),
      rueckmeldungErfolg([{ art: "verschoben", serie: true, zeiten: [...z, ...z] }], []),
      rueckmeldungErfolg([{ art: "freigegeben", serie: false, zeiten: z }], []),
      rueckmeldungErfolg([{ art: "nicht_gefunden", serie: false, zeiten: [] }], []),
      rueckmeldungFehler("kein_termin"),
      rueckmeldungFehler("vergangen"),
      rueckmeldungFehler("eigener"),
    ];
    for (const t of texte) for (const x of [t.betreff, ...t.absaetze]) expect(hatGedankenstrich(x)).toBe(false);
    expect(hatGedankenstrich(ueberschneidungPush({ name: "Julia", start: s, leadId: null }).body)).toBe(false);
    expect(texte[0].absaetze[0]).toBe("Wir haben diese Zeit in Ihrem App-Kalender blockiert: Mi., 25.11., 10 bis 11 Uhr. Dort bieten wir keine Lead-Termine an.");
  });
});
