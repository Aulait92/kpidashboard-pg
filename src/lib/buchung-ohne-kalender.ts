// Buchungsseite /book/[slug] ohne verbundenen Kalender bzw. ohne freie Zeiten (Usability-Check 18.11.2026): wie auf
// /termin ein Weg zum Termin statt einer Sackgasse. Rückruf per E-Mail anfragen bzw. anrufen, mit den Kontaktdaten des
// Vermittlers aus der Erstinformation (sonst Website-Angaben, sonst Login des Inhabers). Reine Funktion für Text und
// Knöpfe, Laden in vermittlerKontakt.

import { a, type Ansprache } from "@/lib/ansprache";

export type VermittlerKontakt = { email: string | null; telefon: string | null };

export type KontaktWeg = { art: "rueckruf" | "anrufen"; label: string; href: string };

const mailOk = (v: string | null | undefined) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim() : null);
const telOk = (v: string | null | undefined) => {
  const t = (v ?? "").replace(/[^\d+]/g, "");
  return t.replace(/\D/g, "").length >= 6 ? t : null;
};

/** Text und Knöpfe; ohne Kontaktdaten nur der Satz, dass sich der Vermittler meldet. */
export function kontaktWege(k: VermittlerKontakt, an: Ansprache): { text: string; wege: KontaktWeg[] } {
  const email = mailOk(k.email);
  const tel = telOk(k.telefon);
  const wege: KontaktWeg[] = [];
  if (email) {
    const betreff = encodeURIComponent("Bitte um Rückruf für einen Termin");
    const text = encodeURIComponent("Hallo,\n\nich hätte gern einen Termin. Bitte rufen Sie mich zurück unter:\n\n");
    wege.push({ art: "rueckruf", label: "Rückruf per E-Mail anfragen", href: `mailto:${email}?subject=${betreff}&body=${text}` });
  }
  if (tel) wege.push({ art: "anrufen", label: "Anrufen", href: `tel:${tel}` });
  const text =
    email && tel
      ? a(an, "Frag gern einen Rückruf an oder ruf direkt an, dann finden wir einen Termin.", "Fragen Sie gern einen Rückruf an oder rufen Sie direkt an, dann finden wir einen Termin.")
      : email
        ? a(an, "Frag gern einen Rückruf an, dann finden wir einen Termin.", "Fragen Sie gern einen Rückruf an, dann finden wir einen Termin.")
        : tel
          ? a(an, "Ruf gern direkt an, dann finden wir einen Termin.", "Rufen Sie gern direkt an, dann finden wir einen Termin.")
          : a(an, "Wir melden uns in Kürze bei dir, um einen Termin zu vereinbaren.", "Wir melden uns in Kürze bei Ihnen, um einen Termin zu vereinbaren.");
  return { text, wege };
}

/** Kontaktdaten des Vermittlers: Erstinformation, sonst Website-Angaben, sonst E-Mail des Inhabers. */
export async function vermittlerKontakt(customerId: string): Promise<VermittlerKontakt> {
  const { prisma } = await import("@/lib/prisma");
  const [e, o, u] = await Promise.all([
    prisma.erstinformation.findUnique({ where: { customerId }, select: { email: true, telefon: true } }).catch(() => null),
    prisma.onboarding.findUnique({ where: { customerId }, select: { websiteInfo: true } }).catch(() => null),
    prisma.user.findFirst({ where: { customerId, role: "BUYER" }, orderBy: [{ teamRole: "desc" }, { createdAt: "asc" }], select: { email: true } }).catch(() => null),
  ]);
  const web = (o?.websiteInfo ?? {}) as { email?: unknown; phone?: unknown };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    email: mailOk(e?.email) ?? mailOk(str(web.email)) ?? mailOk(u?.email),
    telefon: telOk(e?.telefon) ?? telOk(str(web.phone)),
  };
}
