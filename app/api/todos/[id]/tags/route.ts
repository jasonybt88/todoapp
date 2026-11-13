import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tagDB, todoDB } from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

async function updateTodoTag(
  request: NextRequest,
  params: Promise<{ id: string }>,
  method: "attach" | "detach",
) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const todoId = parseId((await params).id);
  if (todoId === null) {
    return errorResponse("Todo not found", 404);
  }

  const body = await readJsonObject(request);
  if (!body || Object.keys(body).length !== 1) {
    return errorResponse("Request body must contain only tag_id", 400);
  }
  const tagId = body.tag_id;
  if (typeof tagId !== "number" || !Number.isSafeInteger(tagId) || tagId <= 0) {
    return errorResponse("tag_id must be a positive integer", 400);
  }

  const updated = method === "attach"
    ? tagDB.attachToTodo(todoId, tagId, session.userId)
    : tagDB.detachFromTodo(todoId, tagId, session.userId);
  if (!updated) {
    return errorResponse("Todo or tag not found", 404);
  }

  const todo = todoDB.findById(todoId);
  return todo && todo.user_id === session.userId
    ? NextResponse.json(todo)
    : errorResponse("Todo not found", 404);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return updateTodoTag(request, params, "attach");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return updateTodoTag(request, params, "detach");
}
