import type { Tag } from "@/lib/db";

export const DEFAULT_TAG_COLOR = "#3B82F6";

export type TagValidation<T> =
  | { valid: true; value: T }
  | { valid: false; error: string };

export function validateTagName(value: unknown): TagValidation<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { valid: false, error: "Tag name is required" };
  }

  return { valid: true, value: value.trim() };
}

export function validateTagColor(value: unknown): TagValidation<string> {
  if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return { valid: false, error: "Color must be a valid hex code" };
  }

  return { valid: true, value: value.toUpperCase() };
}

export function getTagTextColor(color: Tag["color"]): "#000000" | "#FFFFFF" {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error("Tag color must be a six-digit hex value");
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}
