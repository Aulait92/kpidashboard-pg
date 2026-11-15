// „Modul anfragen“ mit Fenster und geplanter Menge (Ole, 15.11.2026): Menge landet im Änderungsprotokoll
// und in der Nachricht an uns; unbekannte Werte werden ignoriert.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ userId: "", customerId: "", pushes: [] as { body: string }[] }));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, email: "x@example.test", preview: false, userId: st.userId, teamRole: "owner" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: async (p: { body: string }) => {
    st.pushes.push(p);
  },
}));

import { prisma } from "@/lib/prisma";
import { requestBestandModuleAction } from "@/app/buyer/bestand/actions";
import { bestandVolumeAdmin } from "@/lib/bestand/volumen";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Bestandskunden-Modul anfragen", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    // Modul vorerst ausgeblendet (lib/bestand/sichtbar.ts): Testkunde mit Schalter
    const c = await makeCustomer({ bestandSichtbar: true });
    customerId = c.id;
    st.userId = (await makeBuyer(c.id, "owner")).id;
    st.customerId = c.id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  it("kennt nur feste Mengen", () => {
    expect(bestandVolumeAdmin("plus_gross")).toBe("bis 2.500, +2.000-Paket");
    expect(bestandVolumeAdmin("quatsch")).toBeNull();
    expect(bestandVolumeAdmin(null)).toBeNull();
  });

  it("speichert die Anfrage mit geplanter Menge", async () => {
    const fd = new FormData();
    fd.set("volume", "plus_klein");
    expect(await requestBestandModuleAction({}, fd)).toEqual({ ok: true });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.bestandRequestedAt).not.toBeNull();
    const log = await prisma.auditLog.findFirst({ where: { customerId, action: "bestand.request" } });
    expect(JSON.stringify(log?.details)).toContain("+500-Paket");
    expect(st.pushes.at(-1)?.body).toContain("geplant: bis 1.000, +500-Paket");
  });
});
