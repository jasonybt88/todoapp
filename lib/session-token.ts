import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "auth_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
  userId: number;
  username: string;
}

interface SessionUser {
  id: number;
  username: string;
}

function secretKey(secret: string): Uint8Array {
  const key = new TextEncoder().encode(secret);
  if (key.byteLength < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 bytes");
  }
  return key;
}

export async function createSessionToken(
  user: SessionUser,
  secret: string,
  issuedAt = Date.now(),
): Promise<string> {
  const issuedAtSeconds = Math.floor(issuedAt / 1000);

  return new SignJWT({ userId: user.id, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("todoapp")
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + SESSION_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifySessionToken(
  token: string,
  secret: string,
  currentTime = Date.now(),
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ["HS256"],
      issuer: "todoapp",
      currentDate: new Date(currentTime),
    });

    if (
      typeof payload.userId !== "number" ||
      !Number.isInteger(payload.userId) ||
      typeof payload.username !== "string"
    ) {
      return null;
    }

    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}
