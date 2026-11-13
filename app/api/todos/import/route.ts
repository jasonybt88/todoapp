import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { todoExportSchema } from "@/lib/todo-export";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON format", 400);
  }

  const parsed = todoExportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "Failed to import todos. Please check the file format.",
      400,
    );
  }

  try {
    const result = todoDB.importAll(session.userId, parsed.data.todos);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Todo import failed:", error);
    return errorResponse("Failed to import todos", 500);
  }
}
