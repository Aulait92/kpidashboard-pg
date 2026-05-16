import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { sendToUser } from "@/lib/push";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendToUser(session.userId, {
    title: "Test 🎉",
    body: "Push-Benachrichtigungen funktionieren.",
    url: "/",
    tag: "test",
  });
  return NextResponse.json(result);
}
