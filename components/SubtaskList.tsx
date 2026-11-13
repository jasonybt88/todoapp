"use client";

import { useEffect, useRef, useState } from "react";
import type { Subtask } from "@/lib/db";
import { requestJson } from "@/lib/client-http";
import { calculateProgress } from "@/lib/subtasks";

type SubtaskChange = (update: (subtasks: Subtask[]) => Subtask[]) => void;

export interface SubtaskOperations {
  queues: Map<number, Promise<void>>;
  sequences: Map<number, number>;
  confirmed: Map<number, boolean>;
  removed: Set<number>;
}

export function SubtaskList({
  todoId,
  subtasks,
  onChange,
  onError,
  operations,
  isTodoActive,
  nextTemporaryId,
}: {
  todoId: number;
  subtasks: Subtask[];
  onChange: SubtaskChange;
  onError: (message: string | null) => void;
  operations: SubtaskOperations;
  isTodoActive: (id: number) => boolean;
  nextTemporaryId: () => number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const mounted = useRef(true);
  const progress = calculateProgress(subtasks);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function addSubtask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || adding || todoId < 1) return;
    const temporaryId = nextTemporaryId();
    const temporary: Subtask = {
      id: temporaryId,
      todo_id: todoId,
      title: trimmed,
      completed: false,
      position: subtasks.reduce((max, item) => Math.max(max, item.position), -1) + 1,
      created_at: new Date().toISOString(),
    };
    setTitle("");
    setAdding(true);
    onError(null);
    onChange((current) => [...current, temporary]);
    try {
      const saved = await requestJson<Subtask>(`/api/todos/${todoId}/subtasks`, {
        method: "POST",
        body: JSON.stringify({ title: trimmed }),
      });
      if (isTodoActive(todoId)) {
        onChange((current) => current.map((item) => item.id === temporaryId ? saved : item)
          .sort((a, b) => a.position - b.position || a.id - b.id));
      }
    } catch (cause) {
      if (isTodoActive(todoId)) {
        onChange((current) => current.filter((item) => item.id !== temporaryId));
        if (mounted.current) setTitle((current) => current || trimmed);
        onError(cause instanceof Error ? cause.message : "Could not add subtask.");
      }
    } finally {
      if (mounted.current) setAdding(false);
    }
  }

  function toggleSubtask(subtask: Subtask, completed: boolean) {
    const sequence = (operations.sequences.get(subtask.id) ?? 0) + 1;
    operations.sequences.set(subtask.id, sequence);
    if (!operations.confirmed.has(subtask.id)) operations.confirmed.set(subtask.id, subtask.completed);
    onError(null);
    onChange((current) => current.map((item) => item.id === subtask.id ? { ...item, completed } : item));

    const previous = operations.queues.get(subtask.id) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (!isTodoActive(todoId) || operations.removed.has(subtask.id)) return;
      try {
        const saved = await requestJson<Subtask>(`/api/subtasks/${subtask.id}`, {
          method: "PUT",
          body: JSON.stringify({ completed }),
        });
        operations.confirmed.set(subtask.id, saved.completed);
        if (isTodoActive(todoId) && !operations.removed.has(subtask.id) && operations.sequences.get(subtask.id) === sequence) {
          onChange((current) => current.map((item) => item.id === saved.id ? saved : item));
        }
      } catch (cause) {
        if (isTodoActive(todoId) && !operations.removed.has(subtask.id)) {
          if (operations.sequences.get(subtask.id) === sequence) {
            const lastConfirmed = operations.confirmed.get(subtask.id) ?? subtask.completed;
            onChange((current) => current.map((item) =>
              item.id === subtask.id ? { ...item, completed: lastConfirmed } : item));
          }
          onError(cause instanceof Error ? cause.message : "Could not update subtask.");
        }
      }
    });
    operations.queues.set(subtask.id, next);
    void next.then(() => {
      if (operations.queues.get(subtask.id) === next && !operations.removed.has(subtask.id)) {
        operations.queues.delete(subtask.id);
        operations.sequences.delete(subtask.id);
        operations.confirmed.delete(subtask.id);
      }
    });
  }

  async function deleteSubtask(subtask: Subtask) {
    operations.removed.add(subtask.id);
    onError(null);
    onChange((current) => current.filter((item) => item.id !== subtask.id));
    try {
      await requestJson<{ success: boolean }>(`/api/subtasks/${subtask.id}`, { method: "DELETE" });
      await operations.queues.get(subtask.id);
      operations.queues.delete(subtask.id);
      operations.sequences.delete(subtask.id);
      operations.confirmed.delete(subtask.id);
      operations.removed.delete(subtask.id);
    } catch (cause) {
      if (isTodoActive(todoId)) {
        operations.removed.delete(subtask.id);
        const completed = operations.confirmed.get(subtask.id) ?? subtask.completed;
        onChange((current) => [...current, { ...subtask, completed }]
          .sort((a, b) => a.position - b.position || a.id - b.id));
        onError(cause instanceof Error ? cause.message : "Could not delete subtask.");
      }
    }
  }

  return (
    <div className="subtasks">
      <button
        type="button"
        className="subtasks-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "▼" : "▶"} Subtasks
      </button>
      {progress.total > 0 && (
        <div className="subtask-progress">
          <div className="subtask-progress-label">
            <span>{progress.completed}/{progress.total} subtasks</span>
            <span>{progress.percent}%</span>
          </div>
          <div
            className="subtask-progress-track"
            role="progressbar"
            aria-label="Subtask progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div className={`subtask-progress-fill${progress.percent === 100 ? " is-complete" : ""}`}
              style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}
      {expanded && (
        <div className="subtask-details">
          <ul className="subtask-list">
            {subtasks.map((subtask) => (
              <li key={subtask.id} className="subtask-item">
                <label>
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    disabled={subtask.id < 1}
                    onChange={(event) => toggleSubtask(subtask, event.target.checked)}
                    aria-label={`Mark subtask "${subtask.title}" as ${subtask.completed ? "incomplete" : "complete"}`}
                  />
                  <span className={subtask.completed ? "subtask-completed" : ""}>{subtask.title}</span>
                </label>
                <button type="button" disabled={subtask.id < 1} onClick={() => void deleteSubtask(subtask)}
                  aria-label={`Delete subtask ${subtask.title}`}>✕</button>
              </li>
            ))}
          </ul>
          <form className="subtask-form" onSubmit={(event) => void addSubtask(event)}>
            <input value={title} onChange={(event) => setTitle(event.target.value)}
              placeholder="Add subtask..." aria-label="Subtask title" />
            <button type="submit" disabled={!title.trim() || adding || todoId < 1}>Add</button>
          </form>
        </div>
      )}
    </div>
  );
}
