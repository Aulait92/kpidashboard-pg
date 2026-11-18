import { describe, expect, it } from "vitest";
import {
  BONUS_VORLAGEN,
  bonusErinnerungStopp,
  bonusMail,
  bonusVorlage,
  faelligeBonusSchritte,
  whatsappErlaubtAus,
  type BonusAngebot,
} from "@/lib/vertrieb/bonus-erinnerung";
import { berlinTagesendeIso, eur } from "@/lib/offer-pricing";

const B = eur(300);
import { metaTemplateProblems } from "@/lib/whatsapp/template-plan";
import { SUPPORT_TEMPLATES } from "@/lib/vertrieb/termin-whatsapp";

const basis = (p: Partial<BonusAngebot> = {}): BonusAngebot => ({
  status: "sent",
  isTest: false,
  validUntil: new Date("2026-12-01T12:00:00Z"),
  declinedAt: null,
  acceptedAt: null,
  abschlussBonus: 300,
  abschlussBonusBis: berlinTagesendeIso("2026-11-20"),
  sentAt: new Date("2026-11-16T09:00:00Z"),
  createdAt: new Date("2026-11-16T08:00:00Z"),
  setupFee: 990,
  allowPayLater: false,
  bonusMailVorabAt: null,
  bonusMailLetzterAt: null,
  bonusPushAt: null,
  bonusWhatsAppAt: null,
  ...p,
});

describe("Bonus-Erinnerung: Plan", () => {
  it("Tag vor Ablauf ab 9 Uhr, letzter Tag 9 und 13 Uhr, nur bis 19 Uhr", () => {
    expect(faelligeBonusSchritte(basis(), new Date("2026-11-19T07:59:00Z"))).toEqual([]); // 8:59 Berlin
    expect(faelligeBonusSchritte(basis(), new Date("2026-11-19T08:00:00Z"))).toEqual(["vorab"]);
    expect(faelligeBonusSchritte(basis(), new Date("2026-11-19T18:00:00Z"))).toEqual([]); // 19 Uhr: nicht nachholen
    expect(faelligeBonusSchritte(basis(), new Date("2026-11-20T08:00:00Z"))).toEqual(["letzter", "push"]);
    expect(faelligeBonusSchritte(basis(), new Date("2026-11-20T12:00:00Z"))).toEqual(["letzter", "push", "whatsapp"]);
    const erledigt = basis({ bonusMailLetzterAt: new Date(), bonusPushAt: new Date(), bonusWhatsAppAt: new Date() });
    expect(faelligeBonusSchritte(erledigt, new Date("2026-11-20T12:00:00Z"))).toEqual([]);
  });

  it("Vortags-Mail nur bei mindestens 3 Tagen zwischen Versand und Frist", () => {
    expect(faelligeBonusSchritte(basis({ sentAt: new Date("2026-11-17T09:00:00Z") }), new Date("2026-11-19T08:00:00Z"))).toEqual(["vorab"]);
    expect(faelligeBonusSchritte(basis({ sentAt: new Date("2026-11-18T09:00:00Z") }), new Date("2026-11-19T08:00:00Z"))).toEqual([]);
  });

  it("Stopp: Entwurf, angenommen, abgelehnt, abgelaufen, neuere Version, Test", () => {
    const now = new Date("2026-11-20T08:00:00Z");
    expect(bonusErinnerungStopp(basis(), now)).toBeNull();
    expect(bonusErinnerungStopp(basis({ status: "draft" }), now)).toMatch(/Status/);
    expect(bonusErinnerungStopp(basis({ status: "accepted", acceptedAt: now }), now)).toMatch(/Status/);
    expect(bonusErinnerungStopp(basis({ declinedAt: now }), now)).toBe("abgelehnt");
    expect(bonusErinnerungStopp(basis({ validUntil: new Date("2026-11-19T00:00:00Z") }), now)).toBe("abgelaufen");
    expect(bonusErinnerungStopp(basis(), now, { ersetzt: true })).toBe("neuere Version");
    expect(bonusErinnerungStopp(basis({ isTest: true }), now)).toBe("Testangebot");
    expect(bonusErinnerungStopp(basis({ abschlussBonus: null }), now)).toBe("kein Bonus offen");
  });
});

describe("Bonus-Erinnerung: Texte", () => {
  it("Mails ohne Gedankenstriche, später zahlen nur wenn erlaubt", () => {
    const o = { betrag: 300, fristIso: "2026-11-20", number: "PG-2026-0007", du: false, spaeterZahlen: true };
    const vorab = bonusMail("vorab", o);
    expect(vorab.subject).toBe(`Noch bis morgen: ${B} Abschlussbonus`);
    expect(vorab.paragraphs).toContain("Sie können jetzt annehmen und erst später zahlen.");
    const letzter = bonusMail("letzter", { ...o, spaeterZahlen: false, du: true });
    expect(letzter.subject).toBe(`Heute bis 23:59 Uhr: ${B} Abschlussbonus`);
    expect(letzter.paragraphs.join(" ")).not.toMatch(/später zahlen/);
    expect(letzter.paragraphs[0]).toMatch(/^kurze Erinnerung zu unserem Angebot PG-2026-0007: Dein Abschlussbonus/);
    for (const t of [vorab, letzter]) expect([t.subject, ...t.paragraphs].join(" ")).not.toMatch(/[–—]/);
  });

  it("WhatsApp-Vorlagen: Metas Regeln, eingereicht mit der Support-Nummer, Wortlaut von Ole", () => {
    for (const v of BONUS_VORLAGEN) {
      expect(metaTemplateProblems(v.body, [...v.examples]), v.name).toEqual([]);
      expect(SUPPORT_TEMPLATES.map((t) => t.name)).toContain(v.name);
      expect(v.body).not.toMatch(/Garantie/);
    }
    const sie = BONUS_VORLAGEN.find((v) => !v.du && !v.spaeter)!;
    expect(sie.body).toBe(
      "Hallo {{1}}, hier ist Ole. Nur kurz, damit es nicht untergeht: Ihr Bonus von {{2}} aufs Setup gilt noch bis heute Abend. Hier der Link: {{3}} Wenn noch etwas offen ist, schreiben Sie mir einfach hier.",
    );
    expect(BONUS_VORLAGEN.find((v) => v.du && v.spaeter)!.body).toMatch(/Du kannst jetzt annehmen und erst später zahlen\. Wenn noch etwas offen ist, schreib mir einfach hier\.$/);
  });

  it("Vorlage nur, wenn freigegeben und nicht als MARKETING eingestuft", () => {
    expect(bonusVorlage(false, false, () => false)).toBeNull();
    expect(bonusVorlage(false, true, (_n, version) => version === 2)?.name).toBe("pg_vertrieb_bonus_spaeter_sie_v1");
  });

  it("WhatsApp erlaubt: von Hand vor Automatik", () => {
    expect(whatsappErlaubtAus({ manuell: null, terminWhatsApp: true, eingehend: false })).toEqual({ erlaubt: true, quelle: "termin" });
    expect(whatsappErlaubtAus({ manuell: false, terminWhatsApp: true, eingehend: true })).toEqual({ erlaubt: false, quelle: "manuell" });
    expect(whatsappErlaubtAus({ manuell: null, terminWhatsApp: false, eingehend: true })).toEqual({ erlaubt: true, quelle: "whatsapp" });
    expect(whatsappErlaubtAus({ manuell: null, terminWhatsApp: false, eingehend: false })).toEqual({ erlaubt: false, quelle: null });
  });
});
