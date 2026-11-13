import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isUniqueConstraintError, tagDB, type CreateTagInput } from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";
import {
  DEFAULT_TAG_COLOR,
  validateTagColor,
  validateTagName,
} from "@/lib/tags";

const allowedFields = new Set(["name", "color"]);

export async function GET() {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  return NextResponse.json(tagDB.findAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return errorResponse("Request contains an unsupported field", 400);
  }

  const name = validateTagName(body.name);
  if (!name.valid) {
    return errorResponse(name.error, 400);
  }

  let color = DEFAULT_TAG_COLOR;
  if (Object.hasOwn(body, "color")) {
    const validatedColor = validateTagColor(body.color);
    if (!validatedColor.valid) {
      return errorResponse(validatedColor.error, 400);
    }
    color = validatedColor.value;
  }

  try {
    const input: CreateTagInput = { name: name.value, color };
    return NextResponse.json(tagDB.create(session.userId, input), { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return errorResponse("A tag with this name already exists", 409);
    }
    throw error;
  }
}
