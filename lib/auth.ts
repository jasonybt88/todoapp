import { cookies } from "next/headers";
import type { User } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "@/lib/session-token";

export {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type Session,
} from "@/lib/session-token";

export function getSessionSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && new TextEncoder().encode(secret).byteLength >= 32
    ? secret
    : null;
}

export async function createSession(user: User): Promise<void> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET must contain at least 32 bytes");
  }

  const token = await createSessionToken(user, secret);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const secret = getSessionSecret();

  if (!token || !secret) {
    return null;
  }

  return verifySessionToken(token, secret);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}
