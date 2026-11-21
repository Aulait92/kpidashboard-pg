// Einrichtung: Schritt „Kranken, BU und Leben“ (Ole, 21.11.2026)
import { describe, expect, it } from "vitest";
import { CUSTOMER_SETUP_KEYS, STEP_SKIP_KEYS } from "@/lib/onboarding";
import { SETUP_STEPS } from "@/lib/selbst-einrichtung";
import { readFileSync } from "node:fs";

describe("Schritt Kranken, BU und Leben", () => {
  it("steht nach den Service-Mails, ist überspringbar und hat eine Beschriftung", () => {
    expect(CUSTOMER_SETUP_KEYS.indexOf("policenGesundheit")).toBe(CUSTOMER_SETUP_KEYS.indexOf("serviceMails") + 1);
    expect(STEP_SKIP_KEYS).toContain("policenGesundheit");
    expect(SETUP_STEPS.find((s) => s.key === "policenGesundheit")?.label).toBe("Kranken, BU und Leben freischalten");
  });
  it("erledigt mit Freigabe (AVV) oder „Brauche ich nicht“, nur wenn die Policen-Ablage eingerichtet ist", () => {
    const src = readFileSync("src/lib/onboarding.ts", "utf8");
    expect(src).toContain('done: gesundheitFreigegeben(ob.customer) || !!skip("policenGesundheit")');
    expect(src).toContain("policenGesundheitMoeglich()");
    expect(readFileSync("src/app/buyer/einrichtung/page.tsx", "utf8")).toContain("skip:policenGesundheit:nicht_noetig");
  });
});
