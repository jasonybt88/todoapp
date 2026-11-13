import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isUniqueConstraintError, tagDB, type UpdateTagInput } from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";
import { validateTagColor, validateTagName } from "@/lib/tags";

const allowedFields = new Set(["name", "color"]);

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parseId((await params).id);
  if (id === null) {
    return errorResponse("Tag not found", 404);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return errorResponse("Request contains an unsupported field", 400);
  }
  if (Object.keys(body).length === 0) {
    return errorResponse("Provide a tag name or color to update", 400);
  }

  const input: UpdateTagInput = {};
  if (Object.hasOwn(body, "name")) {
    const name = validateTagName(body.name);
    if (!name.valid) {
      return errorResponse(name.error, 400);
    }
    input.name = name.value;
  }
  if (Object.hasOwn(body, "color")) {
    const color = validateTagColor(body.color);
    if (!color.valid) {
      return errorResponse(color.error, 400);
    }
    input.color = color.value;
  }

  try {
    const tag = tagDB.update(id, session.userId, input);
    return tag
      ? NextResponse.json(tag)
      : errorResponse("Tag not found", 404);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return errorResponse("A tag with this name already exists", 409);
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parseId((await params).id);
  if (id === null || !tagDB.delete(id, session.userId)) {
    return errorResponse("Tag not found", 404);
  }
  return NextResponse.json({ success: true });
}
