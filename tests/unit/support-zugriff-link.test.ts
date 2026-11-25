import { describe, expect, it } from "vitest";
import { pruefeZugriffToken, zugriffPfad, zugriffToken } from "@/lib/support-zugriff-link";
import { redactTokenPaths } from "@/lib/sentry-redact";

const secret = "localtestsecret_localtestsecret_0123456789";
const t0 = new Date("2026-11-25T13:00:00Z");
const plus = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("Support-Zugriff: signierter Link", () => {
  it("gilt 15 Minuten für den Admin, der ihn ausgelöst hat", () => {
    const tok = zugriffToken("zug1", "admin1", t0, secret);
    expect(pruefeZugriffToken(tok, "admin1", plus(1), secret)).toMatchObject({ ok: true, zid: "zug1", uid: "admin1" });
    expect(pruefeZugriffToken(tok, "admin1", plus(14.9), secret).ok).toBe(true);
  });

  it("läuft nach 15 Minuten ab", () => {
    const tok = zugriffToken("zug1", "admin1", t0, secret);
    expect(pruefeZugriffToken(tok, "admin1", plus(15.1), secret)).toEqual({ ok: false, grund: "abgelaufen" });
  });

  it("nur für Admins: ohne Admin-Login bzw. anderer Admin abgelehnt", () => {
    const tok = zugriffToken("zug1", "admin1", t0, secret);
    expect(pruefeZugriffToken(tok, null, plus(1), secret)).toEqual({ ok: false, grund: "fremd" });
    expect(pruefeZugriffToken(tok, "admin2", plus(1), secret)).toEqual({ ok: false, grund: "fremd" });
  });

  it("veränderte Token sind ungültig", () => {
    const tok = zugriffToken("zug1", "admin1", t0, secret);
    const [zid, uid, e, sig] = tok.split(".");
    expect(pruefeZugriffToken(`${zid}.${uid}.${Number(e) + 3600}.${sig}`, "admin1", plus(1), secret).ok).toBe(false);
    expect(pruefeZugriffToken(`zug2.${uid}.${e}.${sig}`, "admin1", plus(1), secret).ok).toBe(false);
    expect(pruefeZugriffToken(tok, "admin1", plus(1), "anderes_geheimnis_0123456789").ok).toBe(false);
    expect(pruefeZugriffToken("quatsch", "admin1", plus(1), secret).ok).toBe(false);
  });

  it("Pfad gilt in Sentry als geheim", () => {
    const pfad = zugriffPfad(zugriffToken("zug1", "admin1", t0, secret));
    expect(redactTokenPaths(`https://app.test${pfad}`)).toBe("https://app.test/api/admin/support-zugriff/[token]");
  });
});
