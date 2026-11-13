"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CreateTodoInput,
  Priority,
  RecurrencePattern,
  Todo,
  UpdateTodoInput,
} from "@/lib/db";
import { formatSingaporeDate, formatSingaporeDateTimeInput, getSingaporeNow } from "@/lib/timezone";
import { sectionTodos, validateDueDate, validateTodoTitle } from "@/lib/todo";

interface TodoDashboardProps {
  userId: number;
}

interface EditDraft {
  title: string;
  dueDate: string;
  priority: Priority;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
}

interface UpdateTodoResponse {
  todo: Todo;
  nextInstance?: Todo;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "The request could not be completed.");
  }
  return data;
}

function todoRequest(method: "PUT" | "DELETE", body?: UpdateTodoInput) {
  return {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

function TodoRow({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  return (
    <li
      className={`todo-item${todo.completed ? " todo-completed" : ""}`}
      data-testid="todo-card"
      data-todo-id={todo.id}
    >
      <label className="todo-main">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={(event) => onToggle(todo.id, event.target.checked)}
          aria-label={`Mark "${todo.title}" as ${todo.completed ? "incomplete" : "complete"}`}
        />
        <span className="todo-text">
          <strong>{todo.title}</strong>
          {todo.due_date && (
            <span className="todo-due-date">{formatSingaporeDate(todo.due_date)}</span>
          )}
        </span>
      </label>
      <div className="todo-meta">
        <span className={`priority-badge priority-${todo.priority}`}>
          {todo.priority}
        </span>
        {todo.is_recurring && todo.recurrence_pattern && (
          <span className="recurrence-badge">🔄 {todo.recurrence_pattern}</span>
        )}
        <button type="button" onClick={() => onEdit(todo)} aria-label={`Edit ${todo.title}`}>
          Edit
        </button>
        <button
          className="delete-button"
          type="button"
          onClick={() => onDelete(todo)}
          aria-label={`Delete ${todo.title}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export function TodoDashboard({ userId }: TodoDashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("daily");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(getSingaporeNow);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    let active = true;
    requestJson<Todo[]>("/api/todos")
      .then((result) => {
        if (active) setTodos(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Todos could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getSingaporeNow()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!editing) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEditing(null);
        setEditDraft(null);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [editing]);

  const sections = useMemo(() => sectionTodos(todos, now), [todos, now]);

  async function addTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validatedTitle = validateTodoTitle(title);
    if (!validatedTitle.valid) {
      setError(validatedTitle.error);
      return;
    }

    const validatedDueDate = dueDate
      ? validateDueDate(dueDate, getSingaporeNow(), true)
      : { valid: true as const, value: null };
    if (!validatedDueDate.valid) {
      setError(validatedDueDate.error);
      return;
    }
    if (isRecurring && validatedDueDate.value === null) {
      setError("Recurring todos require a due date");
      return;
    }

    const input: CreateTodoInput = {
      title: validatedTitle.value,
      priority,
      due_date: validatedDueDate.value,
      is_recurring: isRecurring,
      recurrence_pattern: isRecurring ? recurrencePattern : null,
    };
    const temporaryId = -Date.now();
    const optimisticTodo: Todo = {
      id: temporaryId,
      user_id: userId,
      title: input.title,
      completed: false,
      due_date: input.due_date ?? null,
      priority,
      is_recurring: isRecurring,
      recurrence_pattern: isRecurring ? recurrencePattern : null,
      reminder_minutes: null,
      last_notification_sent: null,
      created_at: getSingaporeNow().toISOString(),
      updated_at: null,
      subtasks: [],
      tags: [],
    };
    setTodos((current) => [...current, optimisticTodo]);

    try {
      const saved = await requestJson<Todo>("/api/todos", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setTodos((current) =>
        current.map((todo) => (todo.id === temporaryId ? saved : todo)),
      );
      setTitle("");
      setPriority("medium");
      setDueDate("");
      setIsRecurring(false);
      setRecurrencePattern("daily");
    } catch (cause) {
      setTodos((current) => current.filter((todo) => todo.id !== temporaryId));
      setError(cause instanceof Error ? cause.message : "Could not create todo. Please try again.");
    }
  }

  async function updateTodo(id: number, input: UpdateTodoInput): Promise<boolean> {
    const previous = todos.find((todo) => todo.id === id);
    if (!previous) return false;

    setError(null);
    setTodos((current) =>
      current.map((todo) => (todo.id === id ? { ...todo, ...input } : todo)),
    );
    try {
      const result = await requestJson<UpdateTodoResponse>(`/api/todos/${id}`, {
        ...todoRequest("PUT", input),
      });
      setTodos((current) => {
        const updated = current.map((todo) =>
          todo.id === id ? result.todo : todo,
        );
        if (
          result.nextInstance &&
          !updated.some((todo) => todo.id === result.nextInstance?.id)
        ) {
          updated.push(result.nextInstance);
        }
        return updated;
      });
      return true;
    } catch (cause) {
      setTodos((current) =>
        current.map((todo) => (todo.id === id ? previous : todo)),
      );
      setError(cause instanceof Error ? cause.message : "Could not update todo. Please try again.");
      return false;
    }
  }

  async function toggleTodo(id: number, completed: boolean) {
    await updateTodo(id, { completed });
  }

  async function deleteTodo(todo: Todo) {
    setError(null);
    setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      await requestJson<{ success: boolean }>(
        `/api/todos/${todo.id}`,
        todoRequest("DELETE"),
      );
    } catch (cause) {
      setTodos((current) =>
        current.some((item) => item.id === todo.id) ? current : [...current, todo],
      );
      setError(cause instanceof Error ? cause.message : "Could not delete todo. Please try again.");
    }
  }

  function startEditing(todo: Todo) {
    setEditing(todo);
    setEditDraft({
      title: todo.title,
      dueDate: todo.due_date ? formatSingaporeDateTimeInput(todo.due_date) : "",
      priority: todo.priority,
      isRecurring: todo.is_recurring,
      recurrencePattern: todo.recurrence_pattern ?? "daily",
    });
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editDraft) return;

    const validatedTitle = validateTodoTitle(editDraft.title);
    if (!validatedTitle.valid) {
      setError("Title cannot be empty");
      return;
    }
    const validatedDueDate = editDraft.dueDate
      ? validateDueDate(editDraft.dueDate, getSingaporeNow(), false)
      : { valid: true as const, value: null };
    if (!validatedDueDate.valid) {
      setError(validatedDueDate.error);
      return;
    }
    if (editDraft.isRecurring && validatedDueDate.value === null) {
      setError("Recurring todos require a due date");
      return;
    }

    const saved = await updateTodo(editing.id, {
      title: validatedTitle.value,
      due_date: validatedDueDate.value,
      priority: editDraft.priority,
      is_recurring: editDraft.isRecurring,
      recurrence_pattern: editDraft.isRecurring
        ? editDraft.recurrencePattern
        : null,
    });
    if (saved) {
      setEditing(null);
      setEditDraft(null);
    }
  }

  return (
    <section className="todo-dashboard" aria-labelledby="todos-title">
      <div className="todo-heading">
        <div>
          <p className="eyebrow">Your tasks</p>
          <h2 id="todos-title">Todos</h2>
        </div>
        <span className="muted">{todos.length} total</span>
      </div>

      <form className="todo-form" onSubmit={addTodo}>
        <label className="visually-hidden" htmlFor="new-todo-title">
          Todo title
        </label>
        <input
          id="new-todo-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to be done?"
          aria-label="Todo title"
        />
        <label className="visually-hidden" htmlFor="new-todo-priority">
          Priority
        </label>
        <select
          id="new-todo-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label className="visually-hidden" htmlFor="new-todo-due-date">
          Due date and time (Singapore)
        </label>
        <input
          id="new-todo-due-date"
          type="datetime-local"
          value={dueDate}
          onChange={(event) => {
            setDueDate(event.target.value);
            if (!event.target.value) setIsRecurring(false);
          }}
        />
        <button className="primary-button" type="submit" disabled={loading}>
          Add
        </button>
        <div className="recurrence-fields">
          <label>
            <input
              type="checkbox"
              checked={isRecurring}
              disabled={!dueDate}
              onChange={(event) => setIsRecurring(event.target.checked)}
            />
            Repeat
          </label>
          {isRecurring && (
            <select
              aria-label="Recurrence pattern"
              value={recurrencePattern}
              onChange={(event) =>
                setRecurrencePattern(event.target.value as RecurrencePattern)
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          )}
          {!dueDate && <span>Set a due date to enable repeat</span>}
        </div>
      </form>

      {error && (
        <p className="message error-message" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="muted" role="status">Loading todos...</p>
      ) : (
        <div className="todo-sections">
          <TodoSection title="Overdue" todos={sections.overdue} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} />
          <TodoSection title="Pending" todos={sections.pending} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} />
          <TodoSection title="Completed" todos={sections.completed} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} />
        </div>
      )}

      {editing && editDraft && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditing(null);
              setEditDraft(null);
            }
          }}
        >
          <section
            className="edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-todo-title"
          >
            <h2 id="edit-todo-title">Edit todo</h2>
            <form className="edit-form" onSubmit={saveEdit}>
              <label htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                value={editDraft.title}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, title: event.target.value })
                }
                autoFocus
              />
              <label htmlFor="edit-priority">Priority</label>
              <select
                id="edit-priority"
                value={editDraft.priority}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    priority: event.target.value as Priority,
                  })
                }
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <label htmlFor="edit-due-date">Due date and time (Singapore)</label>
              <input
                id="edit-due-date"
                type="datetime-local"
                value={editDraft.dueDate}
                onChange={(event) => setEditDraft({
                  ...editDraft,
                  dueDate: event.target.value,
                  isRecurring: event.target.value ? editDraft.isRecurring : false,
                })}
              />
              <div className="recurrence-fields">
                <label htmlFor="edit-recurring">
                  <input
                    id="edit-recurring"
                    type="checkbox"
                    checked={editDraft.isRecurring}
                    disabled={!editDraft.dueDate}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        isRecurring: event.target.checked,
                      })
                    }
                  />
                  Repeat
                </label>
                {editDraft.isRecurring && (
                  <select
                    aria-label="Recurrence pattern"
                    value={editDraft.recurrencePattern}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        recurrencePattern: event.target.value as RecurrencePattern,
                      })
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                )}
                {!editDraft.dueDate && <span>Set a due date to enable repeat</span>}
              </div>
              <div className="edit-actions">
                <button className="primary-button" type="submit">Update</button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setEditDraft(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function TodoSection({
  title,
  todos,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  todos: Todo[];
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  const headingId = `section-${title.toLowerCase()}`;
  return (
    <section className="todo-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{title} ({todos.length})</h3>
      {todos.length === 0 ? (
        <p className="empty-section">No {title.toLowerCase()} todos.</p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
