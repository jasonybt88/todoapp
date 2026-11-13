import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import {
  createTodoExport,
  formatSingaporeDateStamp,
  serializeTodosAsCsv,
} from "@/lib/todo-export";
import { todoDB } from "@/lib/db";
import { getSingaporeNow } from "@/lib/timezone";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be json or csv", 400);
  }

  const now = getSingaporeNow();
  const filenameDate = formatSingaporeDateStamp(now);
  const todos = todoDB.findAllByUser(session.userId);

  if (format === "csv") {
    return new NextResponse(serializeTodosAsCsv(todos), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="todos-${filenameDate}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  const payload = createTodoExport(todos, now);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="todos-${filenameDate}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
