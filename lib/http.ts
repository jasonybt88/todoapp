import { NextResponse } from "next/server";

export function parsePositiveId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let value: unknown;
  try {
    value = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const username = value.trim();
  return /^[A-Za-z0-9._-]{3,32}$/.test(username) ? username : null;
}

export function getWebAuthnConfig(): {
  rpName: string;
  rpId: string;
  origin: string;
} {
  const { RP_NAME: rpName, RP_ID: rpId, RP_ORIGIN: origin } = process.env;
  if (!rpName || !rpId || !origin) {
    throw new Error("RP_NAME, RP_ID, and RP_ORIGIN must be configured");
  }

  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.origin !== origin ||
    (parsedOrigin.protocol !== "https:" &&
      !(parsedOrigin.protocol === "http:" && parsedOrigin.hostname === "localhost") &&
      !(parsedOrigin.protocol === "http:" && parsedOrigin.hostname === "127.0.0.1"))
  ) {
    throw new Error("RP_ORIGIN must be an HTTPS origin, except for local development");
  }

  if (
    parsedOrigin.hostname !== rpId &&
    !parsedOrigin.hostname.endsWith(`.${rpId}`)
  ) {
    throw new Error("RP_ID must match RP_ORIGIN or be one of its parent domains");
  }

  return { rpName, rpId, origin };
}
