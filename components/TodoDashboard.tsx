"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateTodoInput,
  Priority,
  RecurrencePattern,
  Subtask,
  Todo,
  UpdateTodoInput,
} from "@/lib/db";
import { SubtaskList, type SubtaskOperations } from "@/components/SubtaskList";
import { TodoFilters } from "@/components/TodoFilters";
import { requestJson } from "@/lib/client-http";
import { applyFilters, DEFAULT_FILTER_STATE, type FilterState } from "@/lib/filters";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { isReminderMinutes, REMINDER_OPTIONS } from "@/lib/reminders";
import { formatSingaporeDate, formatSingaporeDateTimeInput, getSingaporeNow } from "@/lib/timezone";
import { sectionTodos, validateDueDate, validateTodoTitle } from "@/lib/todo";

interface TodoDashboardProps {
  userId: number;
}

interface EditDraft {
  title: string;
  dueDate: string;
  priority: Priority;
  reminderMinutes: number | null;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
}

interface UpdateTodoResponse {
  todo: Todo;
  nextInstance?: Todo;
}

function ReminderSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>Reminder</label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "") onChange(null);
          else {
            const minutes = Number(value);
            if (isReminderMinutes(minutes)) onChange(minutes);
          }
        }}
      >
        <option value="">None</option>
        {value !== null && !isReminderMinutes(value) && (
          <option value={value}>Previously set: {value} minutes</option>
        )}
        {REMINDER_OPTIONS.map((option) => (
          <option key={option.minutes} value={option.minutes}>{option.label}</option>
        ))}
      </select>
    </>
  );
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

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
  onSubtasksChange,
  onError,
  operations,
  isTodoActive,
  nextTemporaryId,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onSubtasksChange: (id: number, update: (subtasks: Subtask[]) => Subtask[]) => void;
  onError: (message: string | null) => void;
  operations: SubtaskOperations;
  isTodoActive: (id: number) => boolean;
  nextTemporaryId: () => number;
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
        {todo.reminder_minutes !== null && isReminderMinutes(todo.reminder_minutes) && (
          <span className="reminder-badge" aria-label="Reminder">
            {"🔔"} {REMINDER_OPTIONS.find((option) => option.minutes === todo.reminder_minutes)?.short}
          </span>
        )}
        <span
          className={`priority-badge priority-${todo.priority}`}
          aria-label={`${PRIORITY_LABELS[todo.priority]} priority`}
        >
          {PRIORITY_LABELS[todo.priority]}
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
      <SubtaskList todoId={todo.id} subtasks={todo.subtasks}
        onChange={(update) => onSubtasksChange(todo.id, update)} onError={onError}
        operations={operations} isTodoActive={isTodoActive} nextTemporaryId={nextTemporaryId} />
    </li>
  );
}

export function TodoDashboard({ userId }: TodoDashboardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTER_STATE });
  const [debouncedSearch, setDebouncedSearch] = useDebounce(filters.search);
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const createDraftRevision = useRef(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("daily");
  const deletedTodoIds = useRef(new Set<number>());
  const dashboardActive = useRef(true);
  const nextSubtaskId = useRef(-1);
  const [subtaskOperations] = useState<SubtaskOperations>(() => ({
    queues: new Map(),
    sequences: new Map(),
    confirmed: new Map(),
    removed: new Set(),
  }));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(getSingaporeNow);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const notifications = useNotifications();

  useEffect(() => {
    dashboardActive.current = true;
    return () => { dashboardActive.current = false; };
  }, []);

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

  const tags = useMemo(() => {
    const found = new Map<number, Todo["tags"][number]>();
    for (const todo of todos) for (const tag of todo.tags ?? []) found.set(tag.id, tag);
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [todos]);
  const { priority: filterPriority, tagId, completion, dueDateFrom, dueDateTo } = filters;
  const sections = useMemo(() => sectionTodos(applyFilters(todos, {
    search: debouncedSearch, priority: filterPriority, tagId, completion, dueDateFrom, dueDateTo,
  }), now), [todos, now, debouncedSearch, filterPriority, tagId, completion, dueDateFrom, dueDateTo]);
  const matchingCount = sections.overdue.length + sections.pending.length + sections.completed.length;

  function updateSubtasks(id: number, update: (subtasks: Subtask[]) => Subtask[]) {
    setTodos((current) => current.map((todo) =>
      todo.id === id ? { ...todo, subtasks: update(todo.subtasks) } : todo));
  }

  function isTodoActive(id: number) {
    return dashboardActive.current && !deletedTodoIds.current.has(id);
  }

  function nextTemporaryId() {
    return nextSubtaskId.current--;
  }

  async function addTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const submittedRevision = createDraftRevision.current;
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
      reminder_minutes: reminderMinutes,
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
      reminder_minutes: reminderMinutes,
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
      if (createDraftRevision.current === submittedRevision) {
        setTitle("");
        setPriority("medium");
        setDueDate("");
        setReminderMinutes(null);
        setIsRecurring(false);
        setRecurrencePattern("daily");
      }
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
          todo.id === id ? { ...result.todo, subtasks: todo.subtasks } : todo,
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
        current.map((todo) => (todo.id === id ? { ...previous, subtasks: todo.subtasks } : todo)),
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
    deletedTodoIds.current.add(todo.id);
    setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      await requestJson<{ success: boolean }>(
        `/api/todos/${todo.id}`,
        todoRequest("DELETE"),
      );
    } catch (cause) {
      deletedTodoIds.current.delete(todo.id);
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
      reminderMinutes: todo.reminder_minutes,
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
      ...(editDraft.reminderMinutes !== editing.reminder_minutes
        ? { reminder_minutes: editDraft.reminderMinutes }
        : {}),
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
        <div className="todo-heading-actions">
          <Link className="calendar-list-link" href="/calendar">
            Calendar
          </Link>
          <span className="muted">{todos.length} total</span>
          <button
            className={notifications.permission === "granted" ? "notifications-on" : "notifications-enable"}
            type="button"
            disabled={notifications.permission === "granted" || notifications.permission === "unsupported" || notifications.permission === "denied"}
            onClick={() => void notifications.requestPermission()}
          >
            {notifications.permission === "granted" ? "🔔 Notifications On" :
              notifications.permission === "denied" ? "Notifications blocked in browser" :
                notifications.permission === "unsupported" ? "Notifications unavailable" : "🔔 Enable Notifications"}
          </button>
        </div>
      </div>

      <form className="todo-form" onSubmit={addTodo}>
        <label className="visually-hidden" htmlFor="new-todo-title">
          Todo title
        </label>
        <input
          id="new-todo-title"
          value={title}
          onChange={(event) => {
            createDraftRevision.current += 1;
            setTitle(event.target.value);
          }}
          placeholder="What needs to be done?"
          aria-label="Todo title"
        />
        <label className="visually-hidden" htmlFor="new-todo-priority">
          Priority
        </label>
        <select
          id="new-todo-priority"
          value={priority}
          onChange={(event) => {
            createDraftRevision.current += 1;
            setPriority(event.target.value as Priority);
          }}
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
            createDraftRevision.current += 1;
            setDueDate(event.target.value);
            if (!event.target.value) setReminderMinutes(null);
            if (!event.target.value) setIsRecurring(false);
          }}
        />
        <ReminderSelect
          id="new-reminder"
          value={reminderMinutes}
          disabled={!dueDate}
          onChange={(value) => {
            createDraftRevision.current += 1;
            setReminderMinutes(value);
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
              onChange={(event) => {
                createDraftRevision.current += 1;
                setIsRecurring(event.target.checked);
              }}
            />
            Repeat
          </label>
          {isRecurring && (
            <select
              aria-label="Recurrence pattern"
              value={recurrencePattern}
              onChange={(event) => {
                createDraftRevision.current += 1;
                setRecurrencePattern(event.target.value as RecurrencePattern);
              }}
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

      <TodoFilters filters={filters} tags={tags} onChange={setFilters} onImmediateSearch={setDebouncedSearch} />

      {error && (
        <p className="message error-message" role="alert">
          {error}
        </p>
      )}
      {notifications.error && (
        <p className="message error-message" role="alert">{notifications.error}</p>
      )}
      {loading ? (
        <p className="muted" role="status">Loading todos...</p>
      ) : todos.length === 0 ? (
        <p className="muted">You have no todos yet.</p>
      ) : matchingCount === 0 ? (
        <p className="muted">No todos match your filters.</p>
      ) : (
        <div className="todo-sections">
          <TodoSection title="Overdue" todos={sections.overdue} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} onSubtasksChange={updateSubtasks} onError={setError} operations={subtaskOperations} isTodoActive={isTodoActive} nextTemporaryId={nextTemporaryId} />
          <TodoSection title="Pending" todos={sections.pending} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} onSubtasksChange={updateSubtasks} onError={setError} operations={subtaskOperations} isTodoActive={isTodoActive} nextTemporaryId={nextTemporaryId} />
          <TodoSection title="Completed" todos={sections.completed} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} onSubtasksChange={updateSubtasks} onError={setError} operations={subtaskOperations} isTodoActive={isTodoActive} nextTemporaryId={nextTemporaryId} />
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
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    dueDate: event.target.value,
                    reminderMinutes: event.target.value ? editDraft.reminderMinutes : null,
                    isRecurring: event.target.value ? editDraft.isRecurring : false,
                  })
                }
              />
              <ReminderSelect
                id="edit-reminder"
                value={editDraft.reminderMinutes}
                disabled={!editDraft.dueDate}
                onChange={(value) => setEditDraft({ ...editDraft, reminderMinutes: value })}
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
  onSubtasksChange,
  onError,
  operations,
  isTodoActive,
  nextTemporaryId,
}: {
  title: string;
  todos: Todo[];
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onSubtasksChange: (id: number, update: (subtasks: Subtask[]) => Subtask[]) => void;
  onError: (message: string | null) => void;
  operations: SubtaskOperations;
  isTodoActive: (id: number) => boolean;
  nextTemporaryId: () => number;
}) {
  const headingId = `section-${title.toLowerCase()}`;
  if (todos.length === 0) return null;
  return (
    <section className="todo-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{title} ({todos.length})</h3>
      <ul className="todo-list">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onSubtasksChange={onSubtasksChange}
              onError={onError}
              operations={operations}
              isTodoActive={isTodoActive}
              nextTemporaryId={nextTemporaryId}
            />
          ))}
      </ul>
    </section>
  );
}
