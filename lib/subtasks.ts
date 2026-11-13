import type { Subtask } from "@/lib/db";

export function calculateProgress(subtasks: Subtask[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = subtasks.length;
  const completed = subtasks.filter((subtask) => subtask.completed).length;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}
