import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const user = findUserById(session.userId);
  if (!user) {
    return errorResponse("Not authenticated", 401);
  }

  return NextResponse.json({ user });
}
