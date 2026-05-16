import { NextResponse } from "next/server";
import { sendToAll } from "@/lib/push";

export async function POST() {
  const result = await sendToAll({
    title: "Test 🎉",
    body: "Push-Benachrichtigungen funktionieren.",
    url: "/",
    tag: "test",
  });
  return NextResponse.json(result);
}
