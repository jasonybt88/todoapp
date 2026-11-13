import { describe, expect, it } from "vitest";
import { hasValidCounterProgression } from "../../lib/counter";

describe("authenticator signature counters", () => {
  it("allows authenticators that always report zero", () => {
    expect(hasValidCounterProgression(0, 0)).toBe(true);
    expect(hasValidCounterProgression(undefined, undefined)).toBe(true);
  });

  it("requires non-zero counters to increase", () => {
    expect(hasValidCounterProgression(4, 5)).toBe(true);
    expect(hasValidCounterProgression(4, 4)).toBe(false);
    expect(hasValidCounterProgression(4, 3)).toBe(false);
    expect(hasValidCounterProgression(4, 0)).toBe(false);
  });
});
