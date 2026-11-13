import { afterEach, describe, expect, it, vi } from "vitest";
import type { Todo } from "../../lib/db";
import { applyFilters, DEFAULT_FILTER_STATE, deletePreset, hasActiveFilters, loadPresets, savePreset, type FilterState } from "../../lib/filters";

function todo(id: number, overrides: Partial<Todo> = {}): Todo {
  return {
    id, user_id: 1, title: `Task ${id}`, completed: false, due_date: null,
    priority: "medium", is_recurring: false, recurrence_pattern: null,
    reminder_minutes: null, last_notification_sent: null, created_at: "2026-01-01",
    updated_at: null, subtasks: [], tags: [], ...overrides,
  };
}
const tag = { id: 7, user_id: 1, name: "Work", color: "#123456", created_at: "2026-01-01" };
const items = [
  todo(1, { title: "Team Meeting", priority: "high", due_date: "2026-01-01T17:00:00.000Z", tags: [tag],
    subtasks: [{ id: 1, todo_id: 1, title: "Slides", completed: false, position: 0, created_at: "2026-01-01" }] }),
  todo(2, { priority: "low", completed: true, due_date: "2026-01-03T02:00:00.000Z" }),
  todo(3),
];
const filter = (overrides: Partial<FilterState>) => applyFilters(items, { ...DEFAULT_FILTER_STATE, ...overrides }).map((item) => item.id);

describe("todo filters", () => {
  it("matches titles and subtasks case-insensitively and trims search", () => {
    expect(filter({ search: " MEETING " })).toEqual([1]);
    expect(filter({ search: "SLIDES" })).toEqual([1]);
    expect(filter({ search: "absent" })).toEqual([]);
    expect(filter({ search: "  " })).toEqual([1, 2, 3]);
  });
  it("filters priority, tag and completion independently", () => {
    expect(filter({ priority: "high" })).toEqual([1]);
    expect(filter({ priority: "low" })).toEqual([2]);
    expect(filter({ priority: "medium" })).toEqual([3]);
    expect(filter({ tagId: 7 })).toEqual([1]);
    expect(filter({ tagId: 9 })).toEqual([]);
    expect(filter({ completion: "incomplete" })).toEqual([1, 3]);
    expect(filter({ completion: "completed" })).toEqual([2]);
    expect(filter({})).toEqual([1, 2, 3]);
  });
  it("applies inclusive Singapore-local date bounds and strict intersections", () => {
    expect(filter({ dueDateFrom: "2026-01-03" })).toEqual([2]);
    expect(filter({ dueDateTo: "2026-01-02" })).toEqual([1]);
    expect(filter({ dueDateFrom: "2026-01-02", dueDateTo: "2026-01-02" })).toEqual([1]);
    expect(filter({ dueDateFrom: "2026-01-04", dueDateTo: "2026-01-02" })).toEqual([]);
    expect(filter({ search: "slides", priority: "high", tagId: 7, completion: "incomplete",
      dueDateFrom: "2026-01-02", dueDateTo: "2026-01-02" })).toEqual([1]);
    expect(filter({ search: "slides", priority: "high", tagId: 7, completion: "completed" })).toEqual([]);
  });
  it("detects each active dimension and ignores whitespace", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, search: "  " })).toBe(false);
    for (const change of [{ search: "x" }, { priority: "high" }, { tagId: 7 },
      { completion: "completed" }, { dueDateFrom: "2026-01-01" }, { dueDateTo: "2026-01-01" }] as Partial<FilterState>[]) {
      expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, ...change })).toBe(true);
    }
  });
  it("filters 1000 todos in under 100ms", () => {
    const large = Array.from({ length: 1000 }, (_, index) => todo(index, { due_date: "2026-01-01T17:00:00Z", tags: [tag] }));
    const start = performance.now();
    expect(applyFilters(large, { ...DEFAULT_FILTER_STATE, search: "task", tagId: 7, dueDateFrom: "2026-01-02" })).toHaveLength(1000);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("filter presets", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("round-trips and deletes presets and handles malformed data", () => {
    let data: string | null = null;
    vi.stubGlobal("localStorage", {
      getItem: () => data,
      setItem: (_key: string, value: string) => { data = value; },
    });
    const preset = { id: "1", name: "Work", filters: { ...DEFAULT_FILTER_STATE, tagId: 7 }, createdAt: "2026-01-01" };
    expect(savePreset(preset)).toEqual([preset]);
    expect(loadPresets()).toEqual([preset]);
    expect(deletePreset("1")).toEqual([]);
    data = "{broken";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadPresets()).toEqual([]);
    data = '[{"id":1}]';
    expect(loadPresets()).toEqual([]);
    expect(log).toHaveBeenCalledTimes(2);
  });
});
