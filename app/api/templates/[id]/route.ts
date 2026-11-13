import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { templateDB } from "@/lib/db";
import {
  errorResponse,
  parsePositiveId,
  readJsonObject,
} from "@/lib/http";
import { validateTemplateFields } from "@/lib/template-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parsePositiveId((await params).id);
  if (id === null) {
    return errorResponse("Template not found", 404);
  }
  const existing = templateDB.findByIdForUser(id, session.userId);
  if (!existing) {
    return errorResponse("Template not found", 404);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  const result = validateTemplateFields(body, existing);
  if (!result.valid) {
    return errorResponse(result.error, 400);
  }

  const template = templateDB.updateForUser(id, session.userId, result.input);
  return template
    ? NextResponse.json(template)
    : errorResponse("Template not found", 404);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parsePositiveId((await params).id);
  if (id === null || !templateDB.deleteForUser(id, session.userId)) {
    return errorResponse("Template not found", 404);
  }
  return NextResponse.json({ success: true });
}
