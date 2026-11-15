import { PRICE_LIST } from "@/lib/offer-pricing";

const num = (n: number) => n.toLocaleString("de-DE");
const [small, big] = PRICE_LIST.bestandPacks;
const incl = PRICE_LIST.bestandIncludedMessages;

/** Geplante Kampagnen-Nachrichten je Monat bei der Modul-Anfrage (Ole, 15.11.2026). Nur zur Planung. */
export const BESTAND_VOLUMES = [
  { value: "inklusive", label: `Bis ${num(incl)} (im Modul inklusive)`, admin: `bis ${num(incl)}, inklusive` },
  { value: "plus_klein", label: `Bis ${num(incl + small.messages)} (später +${num(small.messages)}-Paket)`, admin: `bis ${num(incl + small.messages)}, +${num(small.messages)}-Paket` },
  { value: "plus_gross", label: `Bis ${num(incl + big.messages)} (später +${num(big.messages)}-Paket)`, admin: `bis ${num(incl + big.messages)}, +${num(big.messages)}-Paket` },
  { value: "individuell", label: `Mehr als ${num(incl + big.messages)} (eigenes Angebot)`, admin: `mehr als ${num(incl + big.messages)}, individuell` },
  { value: "unklar", label: "Weiß ich noch nicht", admin: "noch unklar" },
] as const;

export type BestandVolume = (typeof BESTAND_VOLUMES)[number]["value"];

/** Text für Admin-Push und Mail; unbekannte Werte ergeben null. */
export function bestandVolumeAdmin(value: unknown): string | null {
  return BESTAND_VOLUMES.find((v) => v.value === value)?.admin ?? null;
}
