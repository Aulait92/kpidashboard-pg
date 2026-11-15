// Erstinformation des Vermittlers (§ 15/16 VersVermV; Ole, 15.11.2026): speichern, öffentliche Adresse
// /erstinformation/<token>, Stand für Einrichtung und „Heute“. Reine Regeln: erstinformation-shared.ts.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicUrlOr } from "@/lib/public-url";
import {
  ERSTINFO_MAX_BYTES,
  asVermittlerStatus,
  erstinfoFehlt,
  isPdf,
  normalizeErstinfoUrl,
  normalizeRegisterNummer,
  statusFromImpressum,
  type VermittlerStatus,
} from "@/lib/erstinformation-shared";

const newToken = () => crypto.randomBytes(9).toString("base64url");

/** Datensatz holen bzw. anlegen (Token entsteht einmal und bleibt). Registernummer aus dem Impressum vorbelegt. */
export async function getOrCreateErstinfo(customerId: string) {
  const found = await prisma.erstinformation.findUnique({ where: { customerId }, select: { id: true, token: true } });
  if (found) return found;
  const web = (await prisma.onboarding.findUnique({ where: { customerId }, select: { websiteInfo: true } }).catch(() => null))?.websiteInfo as
    | { registerNumber?: string | null }
    | null
    | undefined;
  try {
    return await prisma.erstinformation.create({
      data: { customerId, token: newToken(), registerNummer: normalizeRegisterNummer(web?.registerNumber) },
      select: { id: true, token: true },
    });
  } catch {
    // Gleichzeitig angelegt
    return prisma.erstinformation.findUniqueOrThrow({ where: { customerId }, select: { id: true, token: true } });
  }
}

/** Öffentliche Adresse der Erstinformation dieses Kunden (immer erreichbar, auch ohne PDF oder Link). */
export async function erstinfoUrlFor(customerId: string): Promise<string> {
  const { token } = await getOrCreateErstinfo(customerId);
  // Eigene Buchungsadresse, sonst App; ohne APP_URL (lokal, Tests) die Standardadresse
  return publicUrlOr(`/erstinformation/${token}`);
}

export type ErstinfoView = {
  token: string | null;
  status: VermittlerStatus;
  statusAt: Date | null;
  registerNummer: string | null;
  url: string | null;
  fileName: string | null;
  size: number | null;
  updatedAt: Date | null;
  fehlt: string[];
  vollstaendig: boolean;
  /** Angaben aus dem Impressum der Website (zum Gegenprüfen) */
  impressum: { companyName: string | null; address: string | null; registerType: string | null; registerNumber: string | null; status: VermittlerStatus | null } | null;
};

export async function loadErstinfo(customerId: string): Promise<ErstinfoView> {
  const [c, e] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true, onboarding: { select: { websiteInfo: true } } } }),
    prisma.erstinformation.findUnique({
      where: { customerId },
      select: { token: true, statusAt: true, registerNummer: true, url: true, fileName: true, size: true, updatedAt: true },
    }),
  ]);
  const web = (c?.onboarding?.websiteInfo ?? null) as { companyName?: string | null; address?: string | null; registerType?: string | null; registerNumber?: string | null } | null;
  const impressum = web
    ? {
        companyName: web.companyName?.trim() || null,
        address: web.address?.trim() || null,
        registerType: web.registerType?.trim() || null,
        registerNumber: normalizeRegisterNummer(web.registerNumber),
        status: statusFromImpressum(web.registerType),
      }
    : null;
  const registerNummer = e?.registerNummer ?? impressum?.registerNumber ?? null;
  // Registernummer aus dem Impressum übernehmen (öffentliche Seite und Assistent lesen den Datensatz)
  if (!e?.registerNummer && impressum?.registerNumber) {
    await getOrCreateErstinfo(customerId).catch(() => null);
    await prisma.erstinformation.update({ where: { customerId }, data: { registerNummer: impressum.registerNumber } }).catch(() => null);
  }
  const fehlt = erstinfoFehlt({ registerNummer: !!registerNummer, dokument: !!(e?.url || e?.fileName), anschrift: !!impressum?.address });
  return {
    token: e?.token ?? null,
    status: asVermittlerStatus(c?.vermittlerTyp),
    statusAt: e?.statusAt ?? null,
    registerNummer,
    url: e?.url ?? null,
    fileName: e?.fileName ?? null,
    size: e?.size ?? null,
    updatedAt: e?.updatedAt ?? null,
    fehlt,
    vollstaendig: fehlt.length === 0,
    impressum,
  };
}

/** Braucht dieser Kunde die Erstinformation? Nur mit WhatsApp-Assistent (Paket mit Software). */
export async function erstinfoRelevant(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true } });
  return !!c && c.plan !== "service";
}

export type SaveErstinfoInput = {
  status: string;
  registerNummer: string;
  url?: string | null;
  file?: { name: string; data: Uint8Array } | null;
  /** Hochgeladenes PDF entfernen */
  removeFile?: boolean;
  userId?: string | null;
};

export async function saveErstinfo(customerId: string, input: SaveErstinfoInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.status === "tippgeber") return { ok: false, error: "tippgeber" };
  if (!["makler", "mehrfachvertreter", "vertreter"].includes(input.status)) return { ok: false, error: "Bitte Ihren Status wählen." };
  const reg = normalizeRegisterNummer(input.registerNummer);
  if (!reg) return { ok: false, error: "Bitte die Registernummer im Format D-XXXX-XXXXX-XX eingeben (steht im Vermittlerregister bzw. auf Ihrer IHK-Urkunde)." };
  const url = input.url?.trim() ? normalizeErstinfoUrl(input.url) : null;
  if (input.url?.trim() && !url) return { ok: false, error: "Der Link ist ungültig. Bitte die vollständige Adresse eingeben, z. B. https://ihre-agentur.de/erstinformation." };
  const file = input.file && input.file.data.length ? input.file : null;
  if (file) {
    if (file.data.length > ERSTINFO_MAX_BYTES) return { ok: false, error: "Das PDF ist zu groß (höchstens 5 MB)." };
    if (!isPdf(file.data)) return { ok: false, error: "Bitte ein PDF hochladen." };
  }
  const { id } = await getOrCreateErstinfo(customerId);
  const current = await prisma.erstinformation.findUniqueOrThrow({ where: { id }, select: { fileName: true, url: true } });
  const hasDoc = !!(file || url || (current.fileName && !input.removeFile));
  // Eigene Erstinformation ist freiwillig (Ole, 15.11.2026): ohne erstellen wir sie aus dem Impressum, dafür muss die Anschrift bekannt sein
  if (!hasDoc) {
    const web = (await prisma.onboarding.findUnique({ where: { customerId }, select: { websiteInfo: true } }))?.websiteInfo as { address?: string | null } | null | undefined;
    if (!web?.address?.trim()) {
      return { ok: false, error: "Wir haben Ihre Anschrift noch nicht aus dem Impressum. Bitte laden Sie Ihre Erstinformation als PDF hoch oder tragen Sie den Link dazu ein." };
    }
  }
  const status = input.status as VermittlerStatus;
  const before = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, vermittlerTyp: true } });
  if (before && before.vermittlerTyp !== status) {
    await prisma.customer.update({ where: { id: customerId }, data: { vermittlerTyp: status } });
    // Makler oder nicht bestimmt auch Provisionssätze und Garantien: Admin informieren
    if ((before.vermittlerTyp === "makler") !== (status === "makler")) {
      const { sendToAdmins } = await import("@/lib/push");
      await sendToAdmins({
        title: `Vermittlerstatus geändert: ${before.name}`,
        body: `Erstinformation: ${before.vermittlerTyp} → ${status}. Provisionssätze und Garantien prüfen.`,
        url: `/admin/kunden/${customerId}`,
        tag: `vermittlerstatus:${customerId}`,
      }).catch(() => {});
    }
  }
  await prisma.erstinformation.update({
    where: { id },
    data: {
      registerNummer: reg,
      statusAt: new Date(),
      url,
      updatedById: input.userId ?? null,
      ...(file
        ? { fileName: file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 160) || "erstinformation.pdf", contentType: "application/pdf", size: file.data.length, data: Buffer.from(file.data) }
        : input.removeFile
          ? { fileName: null, contentType: null, size: null, data: null }
          : {}),
    },
  });
  return { ok: true };
}
