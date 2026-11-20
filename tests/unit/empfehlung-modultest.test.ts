// Funde aus dem Modultest „Empfehlungen & Bewertungen“ (18.11.2026).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WAECHTER_HREF } from "@/lib/empfehlung/shared";
import { decodeReferralDraft, encodeReferralDraft, type ReferralDraft } from "@/lib/empfehlung/entwurf";

const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("Bewertungs-Wächter: Push und Heute-Karte führen zum richtigen Reiter", () => {
  it("Link öffnet den Reiter „Teilen & Google“, wo der Wächter steht", () => {
    expect(WAECHTER_HREF).toBe("/buyer/empfehlungen?tab=teilen#bewertungen");
    const page = src("src/app/buyer/empfehlungen/page.tsx");
    expect(page).toContain('sp.tab === "teilen"');
    // Der Wächter steht nur im Reiter „teilen“
    expect(page).toMatch(/tab === "teilen"[\s\S]*<WaechterSection/);
    expect(src("src/components/empfehlung/waechter.tsx")).toContain('id="bewertungen"');
    // Keine Links mehr ohne Reiter
    expect(src("src/components/empfehlung/server.tsx")).not.toContain('"/buyer/empfehlungen#bewertungen"');
    expect(src("src/lib/empfehlung/google-business.ts")).not.toContain('"/buyer/empfehlungen#bewertungen"');
  });
});

describe("Kontaktformular der empfohlenen Person: Eingaben bleiben bei Fehlern", () => {
  const d: ReferralDraft = { name: "Lena Vogt", phone: "4912", email: "lena@example.com", topic: "Kfz", message: "Bitte abends anrufen.", consent: true, statusConsent: false };

  it("hin und zurück ohne Verlust (auch Umlaute)", () => {
    expect(decodeReferralDraft(encodeReferralDraft(d))).toEqual(d);
    const u = { ...d, name: "Jürgen Öztürk-Weiß", message: "Grüße ✓" };
    expect(decodeReferralDraft(encodeReferralDraft(u))).toEqual(u);
  });

  it("kaputte oder fremde Werte ergeben nichts bzw. nur Text mit Längengrenze", () => {
    expect(decodeReferralDraft(null)).toBeNull();
    expect(decodeReferralDraft("%%%")).toBeNull();
    expect(decodeReferralDraft(Buffer.from("[1,2]").toString("base64url"))?.name).toBe("");
    const evil = Buffer.from(JSON.stringify({ name: { x: 1 }, phone: "49<script>151", message: "x".repeat(900), consent: "yes" })).toString("base64url");
    const r = decodeReferralDraft(evil)!;
    expect(r.name).toBe("");
    expect(r.phone).toBe("49151");
    expect(r.message).toHaveLength(500);
    expect(r.consent).toBe(false);
  });

  it("Seite setzt die Eingaben nur nach einem Fehler wieder ein, Aktion merkt sie als Cookie (nicht in der URL)", () => {
    const page = src("src/app/empfehlung/[token]/kontakt/page.tsx");
    expect(page).toMatch(/const draft = sp\.err \?/);
    expect(page).toContain("defaultValue={draft?.name}");
    expect(page).toContain("defaultChecked={draft?.statusConsent ?? false}");
    // Einwilligung als Satz unter dem Knopf (Absenden = Einwilligung), kein Häkchen mehr
    expect(page).not.toContain('name="consent"');
    const action = src("src/app/empfehlung/[token]/kontakt/actions.ts");
    expect(action).toContain("jar.set(REFERRAL_DRAFT_COOKIE");
    expect(action).toContain("httpOnly: true");
    expect(action).not.toMatch(/redirect\(`\$\{base\}\?err=\$\{code\}&/);
  });
});

describe("Handy 390 px: lange Links sprengen die Karte nicht", () => {
  it("Text zum Teilen im Kontakt und Signatur-Zeile umbrechen auch mitten im Link", () => {
    const client = src("src/components/empfehlung/client.tsx");
    expect(client).toMatch(/whitespace-pre-wrap \[overflow-wrap:anywhere\][^"]*">\{state\.text\}/);
    expect(client).toContain('<div className="min-w-0 max-w-full space-y-2" data-referral-share>');
    expect(src("src/app/buyer/empfehlungen/page.tsx")).toMatch(/\[overflow-wrap:anywhere\]" data-empfehlung-signatur>/);
  });
});
