import { SOURCES } from "@/lib/vertrieb/crm";

// „Kunden nach Kanal (ohne Gekündigt)“: gemeinsam für Kunden → Pipeline (alter Admin) und
// Zahlen → Übersicht → Vertrieb (neuer Admin). Reine Rechnung auf den schon geladenen Kunden-Kontakten.

export type KanalKunde = { customerSource: string | null; customerStage: string | null; monthlyValue: number | null };
export type KanalZeile = { source: string | null; count: number; mrrAktiv: number };

export function kundenNachKanal(customers: KanalKunde[]): KanalZeile[] {
  return [...SOURCES.map((x) => x.id as string), null].flatMap((src) => {
    const list = customers.filter((c) => (c.customerSource ?? null) === src && c.customerStage !== "GEKUENDIGT");
    if (!list.length) return [];
    const mrrAktiv = list.filter((c) => c.customerStage === "AKTIV").reduce((a, c) => a + (c.monthlyValue ?? 0), 0);
    return [{ source: src, count: list.length, mrrAktiv }];
  });
}
