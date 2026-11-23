import { describe, expect, it } from "vitest";
import { pickTwoSlots, zuNahBeieinander } from "@/lib/whatsapp/termin-vorschlaege";

// Ole, 21.11.2026: „lieber 2 Vorschläge, die nicht nur 30 Min. auseinander liegen“
const s = (start: string) => ({ start });
const tag = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map((h) => s(`2026-11-24T${h}:00.000Z`));

describe("Zwei Terminvorschläge mit Abstand", () => {
  it("anderer Tag hat Vorrang", () => {
    expect(pickTwoSlots([...tag, s("2026-11-25T08:00:00.000Z")])?.map((x) => x.start)).toEqual(["2026-11-24T08:00:00.000Z", "2026-11-25T08:00:00.000Z"]);
  });
  it("nur ein Tag: mindestens 3 Stunden später, sonst die späteste", () => {
    expect(pickTwoSlots(tag)?.map((x) => x.start)).toEqual(["2026-11-24T08:00:00.000Z", "2026-11-24T11:00:00.000Z"]);
    expect(pickTwoSlots(tag.slice(0, 3))?.map((x) => x.start)).toEqual(["2026-11-24T08:00:00.000Z", "2026-11-24T09:00:00.000Z"]);
  });
  it("gleicherTag: bleibt am Wunschtag, mit Abstand", () => {
    expect(pickTwoSlots([...tag, s("2026-11-25T08:00:00.000Z")], { gleicherTag: true })?.map((x) => x.start)).toEqual(["2026-11-24T08:00:00.000Z", "2026-11-24T11:00:00.000Z"]);
  });
  it("zu nah: gleicher Tag unter 2 Stunden", () => {
    expect(zuNahBeieinander("2026-11-24T08:00:00.000Z", "2026-11-24T08:30:00.000Z")).toBe(true);
    expect(zuNahBeieinander("2026-11-24T08:00:00.000Z", "2026-11-24T10:00:00.000Z")).toBe(false);
    expect(zuNahBeieinander("2026-11-24T08:00:00.000Z", "2026-11-25T08:30:00.000Z")).toBe(false);
  });
});
