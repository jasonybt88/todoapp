import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined,
  options: undefined as Record<string, unknown> | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieState.value ? { value: cookieState.value } : undefined),
    set: (_name: string, value: string, options: Record<string, unknown>) => {
      cookieState.value = value || undefined;
      cookieState.options = options;
    },
  }),
}));

import {
  createSession,
  deleteSession,
  getSession,
  SESSION_TTL_SECONDS,
} from "../../lib/auth";
import {
  createSessionToken,
  verifySessionToken,
} from "../../lib/session-token";

const secret = "unit-test-secret-that-is-at-least-thirty-two-bytes";
const user = { id: 12, username: "passkey-user", created_at: "2026-01-01" };

describe("session management", () => {
  beforeEach(() => {
    cookieState.value = undefined;
    cookieState.options = undefined;
    process.env.AUTH_SECRET = secret;
  });

  it("creates, reads, and deletes a seven-day HTTP-only session cookie", async () => {
    await createSession(user);

    expect(cookieState.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    expect(cookieState.value).toBeDefined();
    expect(await getSession()).toEqual({ userId: user.id, username: user.username });

    await deleteSession();

    expect(cookieState.value).toBeUndefined();
    expect(cookieState.options).toMatchObject({ maxAge: 0, path: "/" });
    expect(await getSession()).toBeNull();
  });

  it("rejects a tampered JWT", async () => {
    const token = await createSessionToken(user, secret);
    const [header, payload, signature] = token.split(".");
    const changedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    const tampered = `${header}.${payload}.${changedSignature}`;

    await expect(verifySessionToken(tampered, secret)).resolves.toBeNull();
  });

  it("rejects an expired JWT", async () => {
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = await createSessionToken(user, secret, issuedAt);

    await expect(
      verifySessionToken(token, secret, issuedAt + SESSION_TTL_SECONDS * 1000 + 1000),
    ).resolves.toBeNull();
  });
});
