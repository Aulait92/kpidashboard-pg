// Admin v2, Paket A5: Systemzustand lädt alle Prüfungen, auch ohne Meta/Stripe/Google-Zugang (dann Fehler bzw. „aus“).
import { describe, expect, it } from "vitest";
import { ladeSystemzustand } from "@/lib/admin-neu/systemzustand-server";
import { requireTestDb } from "./db";

requireTestDb();

describe("Systemzustand (A5)", () => {
  it("liefert jede Prüfung mit Ampel und Link, Probleme zuerst", async () => {
    const p = await ladeSystemzustand(new Date());
    expect(p.map((x) => x.key).sort()).toEqual(["bank", "google", "jobs", "linkedin", "mail-eingang", "meta", "status", "stripe", "sync", "werbekosten", "whatsapp"]);
    expect(p.every((x) => x.href.startsWith("/admin/neu/") && x.text.length > 0)).toBe(true);
    const rang = { fehler: 0, warnung: 1, aus: 2, ok: 3 } as const;
    expect(p.map((x) => rang[x.ampel])).toEqual([...p.map((x) => rang[x.ampel])].sort((a, b) => a - b));
  });
});
