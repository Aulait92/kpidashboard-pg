// N26-CSV (Ole, 22.11.2026: geschäftliche Ausgaben vom Privatkonto, einmalig über die Ops-Aktion bank_csv_importieren)
import { describe, expect, it } from "vitest";
import { parseBankCsv } from "@/lib/bank/csv";

describe("N26-Export", () => {
  it("neuer englischer Export", () => {
    const csv = [
      '"Booking Date","Value Date","Partner Name","Partner Iban","Type","Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"',
      '"2026-10-14","2026-10-14","Meta Platforms Ireland","","Presentment","Facebook Ads","Hauptkonto","-249.90","","",""',
      '"2026-10-15","2026-10-15","Max Muster","DE00","Credit Transfer","Rückzahlung","Hauptkonto","50.00","","",""',
    ].join("\n");
    const r = parseBankCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ bookingDate: "2026-10-14", amount: -249.9, counterparty: "Meta Platforms Ireland", purpose: "Facebook Ads" });
    expect(r.rows[1].amount).toBe(50);
  });

  it("alter deutscher Export", () => {
    const csv = ['"Datum","Empfänger","Kontonummer","Transaktionstyp","Verwendungszweck","Kategorie","Betrag (EUR)","Betrag (Fremdwährung)","Fremdwährung","Wechselkurs"', '"2026-09-03","OpenAI","","MasterCard Zahlung","ChatGPT","Geschäft","-20.00","","",""'].join("\n");
    const r = parseBankCsv(csv);
    expect(r.rows[0]).toMatchObject({ bookingDate: "2026-09-03", amount: -20, counterparty: "OpenAI", purpose: "ChatGPT" });
  });
});
