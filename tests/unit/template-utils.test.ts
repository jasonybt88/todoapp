import { describe, expect, it } from "vitest";
import {
  parseTemplateSubtasks,
  resolveTemplateDueDate,
  serializeTemplateSubtasks,
} from "../../lib/template-utils";

describe("template utilities", () => {
  it("round-trips an ordered checklist and safely ignores malformed JSON", () => {
    const subtasks = [
      { title: "First", position: 0 },
      { title: "Second", position: 2 },
    ];
    expect(serializeTemplateSubtasks(subtasks)).toBe(JSON.stringify(subtasks));
    expect(parseTemplateSubtasks(serializeTemplateSubtasks(subtasks))).toEqual(subtasks);
    expect(serializeTemplateSubtasks([])).toBeNull();
    expect(parseTemplateSubtasks("{")).toEqual([]);
    expect(parseTemplateSubtasks(JSON.stringify([{ title: "Missing position" }]))).toEqual([]);
  });

  it("calculates a relative due date and rejects unusable offsets", () => {
    const now = new Date("2026-03-01T10:00:00.000Z");
    expect(resolveTemplateDueDate(90, now)).toBe("2026-03-01T11:30:00.000Z");
    expect(resolveTemplateDueDate(null, now)).toBeNull();
    expect(resolveTemplateDueDate(0, now)).toBeNull();
    expect(resolveTemplateDueDate(Number.MAX_SAFE_INTEGER, now)).toBeNull();
  });
});
