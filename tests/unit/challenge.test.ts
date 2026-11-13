import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let saveChallenge: typeof import("../../lib/db").saveChallenge;
let consumeChallenge: typeof import("../../lib/db").consumeChallenge;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  const database = await import("../../lib/db");
  saveChallenge = database.saveChallenge;
  consumeChallenge = database.consumeChallenge;
});

describe("WebAuthn challenges", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a challenge to be consumed only once", () => {
    saveChallenge("replay-user", "registration", "single-use-challenge");

    expect(consumeChallenge("replay-user", "registration")).toBe(
      "single-use-challenge",
    );
    expect(consumeChallenge("replay-user", "registration")).toBeNull();
  });

  it("rejects challenges after their five-minute expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    saveChallenge("expired-user", "authentication", "expired-challenge");

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(consumeChallenge("expired-user", "authentication")).toBeNull();
  });
});
