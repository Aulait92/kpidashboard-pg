// Integritätssperre bei Meta (Policen-Flow) und Unternehmensverifizierung: Fehlererkennung, Backoff, Grund, Anzeige.
import { describe, expect, it } from "vitest";
import {
  flowStandText,
  GRUND_INTEGRITAET,
  GRUND_VERIFIZIERUNG_FEHLT,
  istIntegritaetsSperre,
  sperreVorbei,
  sperrGrund,
  STATUS_META_GESPERRT,
} from "@/lib/policen/flow/meta-sperre";
import { abgleichFaellig, kanalFuerKonto, metaVerifizierungAnzeige } from "@/lib/whatsapp/meta-verifizierung";
import { parsePartnerChannel } from "@/lib/whatsapp/dialog360-partner";
import { META_DAUER, META_KNOPF, META_NUTZEN, META_SCHRITTE, META_TITEL } from "@/components/meta-verifizierung";

const HOUR = 60 * 60 * 1000;
const PROD_FEHLER =
  '360dialog flows 400: {"error":{"message":"Blocked by Integrity","type":"OAuthException","code":139000,"error_subcode":4233020,"is_transient":false,"error_user_title":"Integrity requirements not met"}}';

describe("istIntegritaetsSperre", () => {
  it("erkennt den Produktionsfehler (code 139000 / subcode 4233020)", () => {
    expect(istIntegritaetsSperre(new Error(PROD_FEHLER))).toBe(true);
    expect(istIntegritaetsSperre(new Error('360dialog flows 400: {"error":{"code":139000,"error_subcode":4233020}}'))).toBe(true);
    expect(istIntegritaetsSperre("Integrity requirements not met")).toBe(true);
  });
  it("andere Fehler nicht", () => {
    expect(istIntegritaetsSperre(new Error('360dialog flows 400: {"error":{"code":100,"message":"Invalid parameter"}}'))).toBe(false);
    expect(istIntegritaetsSperre(new Error("validation_errors: []"))).toBe(false);
    expect(istIntegritaetsSperre(new Error('{"code":139000,"message":"Something else"}'))).toBe(false);
    expect(istIntegritaetsSperre(null)).toBe(false);
  });
});

describe("Grund und Backoff", () => {
  it("Grund: not_verified → Verifizierung fehlt, sonst allgemein", () => {
    expect(sperrGrund("not_verified")).toBe(GRUND_VERIFIZIERUNG_FEHLT);
    expect(sperrGrund("pending_verification")).toBe(GRUND_VERIFIZIERUNG_FEHLT);
    expect(sperrGrund("verified")).toBe(GRUND_INTEGRITAET);
    expect(sperrGrund(null)).toBe(GRUND_INTEGRITAET);
    expect(GRUND_VERIFIZIERUNG_FEHLT).toBe("Formular bei Meta gesperrt: Unternehmensverifizierung fehlt");
    expect(GRUND_INTEGRITAET).toBe("Formular bei Meta gesperrt (Integrität)");
  });
  it("gesperrt: erst nach der Wartezeit, sofort bei bestätigter Verifizierung", () => {
    const now = new Date("2026-11-27T20:00:00Z");
    const rec = { status: STATUS_META_GESPERRT, fehler: GRUND_VERIFIZIERUNG_FEHLT, naechsterVersuchAt: new Date(now.getTime() + 20 * HOUR) };
    expect(sperreVorbei(rec, "not_verified", now)).toBe(false);
    expect(sperreVorbei(rec, "verified", now)).toBe(true);
    expect(sperreVorbei(rec, "not_verified", new Date(now.getTime() + 21 * HOUR))).toBe(true);
    // Allgemeine Integritätssperre: Verifizierung allein hebt sie nicht auf
    expect(sperreVorbei({ ...rec, fehler: GRUND_INTEGRITAET }, "verified", now)).toBe(false);
    expect(sperreVorbei({ ...rec, status: "fehler" }, "not_verified", now)).toBe(true);
  });
  it("Stand für den Admin", () => {
    const at = new Date("2026-11-28T20:00:00Z");
    expect(flowStandText(null, { schalterAn: false })).toMatch(/Schalter aus/);
    expect(flowStandText(null, { schalterAn: true })).toBe("Policen-Formular: noch nicht angelegt");
    expect(flowStandText({ status: STATUS_META_GESPERRT, fehler: GRUND_VERIFIZIERUNG_FEHLT, naechsterVersuchAt: at, publishedAt: null }, { schalterAn: true })).toBe(
      "Formular bei Meta gesperrt: Unternehmensverifizierung fehlt, nächster Versuch 28.11., 21:00",
    );
    expect(flowStandText({ status: "veroeffentlicht", fehler: null, naechsterVersuchAt: null, publishedAt: at }, { schalterAn: true })).toMatch(/^Policen-Formular: veröffentlicht seit/);
  });
});

describe("Unternehmensverifizierung (Cache und Anzeige)", () => {
  const roh = {
    id: "iFqtssCH",
    created_at: "2026-11-26T14:05:51Z",
    availability_status: "ready",
    setup_info: { phone_number: "4923494121124", phone_name: "Tierfairgleich" },
    waba_account: { id: "zSvngOWA", external_id: "2907971772922220", on_behalf_of_business_info: { name: "CL Capital Living GmbH" }, fb_account_status: "not_verified" },
    client: { id: "SR4fMRdvCL", name: "CL Capital Living GmbH", partner_payload: "cmwug7vka0v085opnko0i1gn3" },
  };
  it("Partner-Liste liefert fb_account_status, Business-Name und WABA-ID", () => {
    const c = parsePartnerChannel(roh)!;
    expect(c.fbAccountStatus).toBe("not_verified");
    expect(c.businessName).toBe("CL Capital Living GmbH");
    expect(c.wabaExternalId).toBe("2907971772922220");
  });
  it("Zuordnung: Channel-ID, sonst WABA-ID, sonst Kunden-ID", () => {
    const a = parsePartnerChannel(roh)!;
    const b = parsePartnerChannel({ ...roh, id: "andere", waba_account: { ...roh.waba_account, external_id: "999", fb_account_status: "verified" }, client: { ...roh.client, partner_payload: "c2" } })!;
    expect(kanalFuerKonto([b, a], { customerId: "x", dialog360ChannelId: "iFqtssCH", wabaId: null })?.id).toBe("iFqtssCH");
    expect(kanalFuerKonto([a, b], { customerId: "x", dialog360ChannelId: null, wabaId: "999" })?.id).toBe("andere");
    expect(kanalFuerKonto([b, a], { customerId: "cmwug7vka0v085opnko0i1gn3", dialog360ChannelId: null, wabaId: null })?.id).toBe("iFqtssCH");
    expect(kanalFuerKonto([a], { customerId: "y", dialog360ChannelId: "nix", wabaId: null })).toBeNull();
  });
  it("Abgleich: nie geprüft sofort, verifiziert täglich, offen alle 6 Std.", () => {
    const now = new Date("2026-11-27T20:00:00Z");
    const vor = (h: number) => new Date(now.getTime() - h * HOUR);
    expect(abgleichFaellig({ metaBusinessStatus: null, metaBusinessCheckedAt: null }, now)).toBe(true);
    expect(abgleichFaellig({ metaBusinessStatus: "verified", metaBusinessCheckedAt: vor(10) }, now)).toBe(false);
    expect(abgleichFaellig({ metaBusinessStatus: "verified", metaBusinessCheckedAt: vor(24) }, now)).toBe(true);
    expect(abgleichFaellig({ metaBusinessStatus: "not_verified", metaBusinessCheckedAt: vor(5) }, now)).toBe(false);
    expect(abgleichFaellig({ metaBusinessStatus: "not_verified", metaBusinessCheckedAt: vor(6) }, now)).toBe(true);
  });
  it("Anzeige nur mit Nummer, möglichem Formular, bekanntem Stand; offen nur, wenn Meta das Formular sperrt", () => {
    const o = { verbunden: true, formularMoeglich: true, flowGesperrt: true };
    expect(metaVerifizierungAnzeige({ ...o, metaStatus: "not_verified" })).toBe("offen");
    expect(metaVerifizierungAnzeige({ ...o, metaStatus: "verified" })).toBe("erledigt");
    expect(metaVerifizierungAnzeige({ ...o, metaStatus: "verified", flowGesperrt: false })).toBe("erledigt");
    // Prod 27.11.2026: nicht verifiziert, Flow trotzdem veröffentlicht → kein Hinweis
    expect(metaVerifizierungAnzeige({ ...o, metaStatus: "not_verified", flowGesperrt: false })).toBeNull();
    expect(metaVerifizierungAnzeige({ ...o, metaStatus: null })).toBeNull();
    expect(metaVerifizierungAnzeige({ ...o, verbunden: false, metaStatus: "not_verified" })).toBeNull();
    expect(metaVerifizierungAnzeige({ ...o, formularMoeglich: false, metaStatus: "not_verified" })).toBeNull();
  });
  it("Texte: Sie-Form, kurz, ohne Gedankenstriche, Hauptaktion als Handlung", () => {
    const alle = [META_TITEL, META_NUTZEN, META_DAUER, META_KNOPF, ...META_SCHRITTE];
    for (const t of alle) expect(t).not.toMatch(/[–—]/);
    expect(META_NUTZEN.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBe(1);
    expect(META_KNOPF).toBe("Verifizierung bei Meta starten");
    expect(alle.join(" ")).not.toMatch(/\b(du|dein|dich)\b/i);
  });
});
