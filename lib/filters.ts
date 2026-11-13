import type { Priority, Todo } from "@/lib/db";

export interface FilterState {
  search: string;
  priority: Priority | "all";
  tagId: number | "all";
  completion: "all" | "incomplete" | "completed";
  dueDateFrom: string | null;
  dueDateTo: string | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: "", priority: "all", tagId: "all", completion: "all",
  dueDateFrom: null, dueDateTo: null,
};

export function hasActiveFilters(f: FilterState): boolean {
  return Boolean(f.search.trim() || f.priority !== "all" || f.tagId !== "all" ||
    f.completion !== "all" || f.dueDateFrom || f.dueDateTo);
}

export function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  let result = todos;
  const query = filters.search.trim().toLowerCase();
  if (query) {
    result = result.filter((todo) =>
      todo.title.toLowerCase().includes(query) ||
      (todo.subtasks ?? []).some((subtask) => subtask.title.toLowerCase().includes(query)));
  }
  if (filters.priority !== "all") result = result.filter((todo) => todo.priority === filters.priority);
  if (filters.tagId !== "all") {
    result = result.filter((todo) => (todo.tags ?? []).some((tag) => tag.id === filters.tagId));
  }
  if (filters.completion !== "all") {
    result = result.filter((todo) => todo.completed === (filters.completion === "completed"));
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    result = result.filter((todo) => {
      if (!todo.due_date) return false;
      const time = new Date(todo.due_date).getTime();
      if (!Number.isFinite(time)) return false;
      const date = new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return (!filters.dueDateFrom || date >= filters.dueDateFrom) &&
        (!filters.dueDateTo || date <= filters.dueDateTo);
    });
  }
  return result;
}

const PRESETS_KEY = "todo-app:filter-presets";

function isPreset(value: unknown): value is FilterPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Record<string, unknown>;
  if (typeof preset.id !== "string" || typeof preset.name !== "string" ||
      typeof preset.createdAt !== "string" || !preset.filters ||
      typeof preset.filters !== "object") return false;
  const f = preset.filters as Record<string, unknown>;
  return typeof f.search === "string" &&
    (f.priority === "all" || f.priority === "high" || f.priority === "medium" || f.priority === "low") &&
    (f.tagId === "all" || (typeof f.tagId === "number" && Number.isSafeInteger(f.tagId) && f.tagId > 0)) &&
    (f.completion === "all" || f.completion === "incomplete" || f.completion === "completed") &&
    (f.dueDateFrom === null || (typeof f.dueDateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.dueDateFrom))) &&
    (f.dueDateTo === null || (typeof f.dueDateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.dueDateTo)));
}

export function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isPreset)) {
      throw new Error("Invalid filter preset data");
    }
    return parsed;
  } catch (error) {
    console.error("Failed to load filter presets:", error);
    return [];
  }
}

export function savePreset(preset: FilterPreset): FilterPreset[] {
  const presets = [...loadPresets(), preset];
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}

export function deletePreset(id: string): FilterPreset[] {
  const presets = loadPresets().filter((preset) => preset.id !== id);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}
