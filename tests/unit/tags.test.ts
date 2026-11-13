import { describe, expect, it } from "vitest";
import {
  getTagTextColor,
  validateTagColor,
  validateTagName,
} from "../../lib/tags";

function contrastRatio(foreground: string, background: string): number {
  function luminance(color: string): number {
    const channels = color
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255);
    if (!channels || channels.length !== 3) {
      throw new Error("Expected a six-digit hex color");
    }

    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("tag validation", () => {
  it("trims non-empty names and rejects blank or non-string values", () => {
    expect(validateTagName("  Work  ")).toEqual({ valid: true, value: "Work" });
    expect(validateTagName("  ")).toMatchObject({ valid: false });
    expect(validateTagName(12)).toMatchObject({ valid: false });
  });

  it("accepts only six-digit hex colors and normalizes their case", () => {
    expect(validateTagColor("#3b82f6")).toEqual({
      valid: true,
      value: "#3B82F6",
    });
    expect(validateTagColor("red")).toMatchObject({ valid: false });
    expect(validateTagColor("#ZZZ")).toMatchObject({ valid: false });
  });

  it("chooses accessible foreground text for valid tag colors", () => {
    for (const background of ["#3B82F6", "#111111", "#FFFFFF", "#F59E0B"]) {
      expect(
        contrastRatio(getTagTextColor(background), background),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(getTagTextColor("#3B82F6")).toBe("#000000");
    expect(getTagTextColor("#111111")).toBe("#FFFFFF");
  });
});
