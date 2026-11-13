import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { getSingaporeNow } from "@/lib/timezone";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  return NextResponse.json({
    success: true,
    data: todoDB.findDueReminders(session.userId, getSingaporeNow()),
  });
}
