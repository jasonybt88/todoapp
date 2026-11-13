"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateTagInput,
  CreateTodoInput,
  Priority,
  Tag,
  Todo,
  UpdateTagInput,
  UpdateTodoInput,
} from "@/lib/db";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { isReminderMinutes, REMINDER_OPTIONS } from "@/lib/reminders";
import { ManageTagsModal, TagPill, TagSelector } from "@/components/TagControls";
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
  tagIds: number[];
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
  onFilterTag,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onFilterTag: (tag: Tag) => void;
}) {
  return (
    <li className={`todo-item${todo.completed ? " todo-completed" : ""}`} data-testid="todo-card">
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
        {todo.tags.map((tag) => (
          <TagPill
            key={tag.id}
            tag={tag}
            label={`Filter by tag ${tag.name}`}
            onClick={() => onFilterTag(tag)}
          />
        ))}
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [tagFilter, setTagFilter] = useState<number | "all">("all");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const createDraftRevision = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(getSingaporeNow);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const notifications = useNotifications();

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<Todo[]>("/api/todos"),
      requestJson<Tag[]>("/api/tags"),
    ])
      .then(([todoResult, tagResult]) => {
        if (active) {
          setTodos(todoResult);
          setTags(tagResult);
        }
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

  const sections = useMemo(
    () =>
      sectionTodos(
        todos.filter(
          (todo) =>
            (priorityFilter === "all" || todo.priority === priorityFilter) &&
            (tagFilter === "all" || todo.tags.some((tag) => tag.id === tagFilter)),
        ),
        now,
      ),
    [todos, now, priorityFilter, tagFilter],
  );

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

    const input: CreateTodoInput = {
      title: validatedTitle.value,
      priority,
      due_date: validatedDueDate.value,
      reminder_minutes: reminderMinutes,
      tag_ids: selectedTagIds,
    };
    const temporaryId = -Date.now();
    const optimisticTodo: Todo = {
      id: temporaryId,
      user_id: userId,
      title: input.title,
      completed: false,
      due_date: input.due_date ?? null,
      priority,
      is_recurring: false,
      recurrence_pattern: null,
      reminder_minutes: reminderMinutes,
      last_notification_sent: null,
      created_at: getSingaporeNow().toISOString(),
      updated_at: null,
      subtasks: [],
      tags: tags.filter((tag) => selectedTagIds.includes(tag.id)),
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
        setSelectedTagIds([]);
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
    const { tag_ids: tagIds, ...todoFields } = input;
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              ...todoFields,
              ...(tagIds === undefined
                ? {}
                : { tags: tags.filter((tag) => tagIds.includes(tag.id)) }),
            }
          : todo,
      ),
    );
    try {
      const saved = await requestJson<Todo>(`/api/todos/${id}`, {
        ...todoRequest("PUT", input),
      });
      setTodos((current) => current.map((todo) => (todo.id === id ? saved : todo)));
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

  async function createTag(input: CreateTagInput) {
    const created = await requestJson<Tag>("/api/tags", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setTags((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async function updateTag(id: number, input: UpdateTagInput) {
    const updated = await requestJson<Tag>(`/api/tags/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
    setTags((current) =>
      current
        .map((tag) => (tag.id === id ? updated : tag))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setTodos((current) =>
      current.map((todo) => ({
        ...todo,
        tags: todo.tags.map((tag) => (tag.id === id ? updated : tag)),
      })),
    );
  }

  async function deleteTag(id: number) {
    await requestJson<{ success: boolean }>(`/api/tags/${id}`, {
      method: "DELETE",
    });
    setTags((current) => current.filter((tag) => tag.id !== id));
    setTodos((current) =>
      current.map((todo) => ({
        ...todo,
        tags: todo.tags.filter((tag) => tag.id !== id),
      })),
    );
    setSelectedTagIds((current) => current.filter((tagId) => tagId !== id));
    setEditDraft((current) =>
      current
        ? { ...current, tagIds: current.tagIds.filter((tagId) => tagId !== id) }
        : current,
    );
    if (tagFilter === id) setTagFilter("all");
  }

  function startEditing(todo: Todo) {
    setEditing(todo);
    setEditDraft({
      title: todo.title,
      dueDate: todo.due_date ? formatSingaporeDateTimeInput(todo.due_date) : "",
      priority: todo.priority,
      reminderMinutes: todo.reminder_minutes,
      tagIds: todo.tags.map((tag) => tag.id),
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

    const saved = await updateTodo(editing.id, {
      title: validatedTitle.value,
      due_date: validatedDueDate.value,
      priority: editDraft.priority,
      ...(editDraft.reminderMinutes !== editing.reminder_minutes
        ? { reminder_minutes: editDraft.reminderMinutes }
        : {}),
      tag_ids: editDraft.tagIds,
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
        <div className="notification-controls">
          <span className="muted">{todos.length} total</span>
          <button
            type="button"
            className={notifications.permission === "granted" ? "notifications-on" : "notifications-enable"}
            disabled={notifications.permission === "granted" || notifications.permission === "unsupported" || notifications.permission === "denied"}
            onClick={() => void notifications.requestPermission()}
          >
            {notifications.permission === "granted" ? "🔔 Notifications On" :
              notifications.permission === "denied" ? "Notifications blocked in browser" :
                notifications.permission === "unsupported" ? "Notifications unavailable" : "🔔 Enable Notifications"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setManageTagsOpen(true)}
          >
            Manage Tags
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
      </form>

      <div className="todo-tag-entry">
        <span className="tag-field-label">Tags</span>
        <TagSelector
          tags={tags}
          selectedIds={selectedTagIds}
          onToggle={(id) => {
            createDraftRevision.current += 1;
            setSelectedTagIds((current) =>
              current.includes(id)
                ? current.filter((tagId) => tagId !== id)
                : [...current, id],
            );
          }}
        />
      </div>

      <div className="todo-filters">
        <label htmlFor="priority-filter">Filter by priority</label>
        <select
          id="priority-filter"
          value={priorityFilter}
          onChange={(event) =>
            setPriorityFilter(event.target.value as Priority | "all")
          }
        >
          <option value="all">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
        <label htmlFor="tag-filter">Filter by tag</label>
        <select
          id="tag-filter"
          value={tagFilter}
          onChange={(event) =>
            setTagFilter(event.target.value === "all" ? "all" : Number(event.target.value))
          }
        >
          <option value="all">All Tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>
      </div>

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
      ) : (
        <div className="todo-sections">
          <TodoSection title="Overdue" todos={sections.overdue} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} onFilterTag={(tag) => setTagFilter(tag.id)} />
          <TodoSection title="Pending" todos={sections.pending} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} onFilterTag={(tag) => setTagFilter(tag.id)} />
          <TodoSection title="Completed" todos={sections.completed} onToggle={toggleTodo} onEdit={startEditing} onDelete={deleteTodo} onFilterTag={(tag) => setTagFilter(tag.id)} />
        </div>
      )}

      {manageTagsOpen && (
        <ManageTagsModal
          tags={tags}
          onClose={() => setManageTagsOpen(false)}
          onCreate={createTag}
          onUpdate={updateTag}
          onDelete={deleteTag}
        />
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
                  })
                }
              />
              <ReminderSelect
                id="edit-reminder"
                value={editDraft.reminderMinutes}
                disabled={!editDraft.dueDate}
                onChange={(value) => setEditDraft({ ...editDraft, reminderMinutes: value })}
              />
              <span className="tag-field-label">Tags</span>
              <TagSelector
                tags={tags}
                selectedIds={editDraft.tagIds}
                onToggle={(id) =>
                  setEditDraft({
                    ...editDraft,
                    tagIds: editDraft.tagIds.includes(id)
                      ? editDraft.tagIds.filter((tagId) => tagId !== id)
                      : [...editDraft.tagIds, id],
                  })
                }
              />
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
  onFilterTag,
}: {
  title: string;
  todos: Todo[];
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onFilterTag: (tag: Tag) => void;
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
              onFilterTag={onFilterTag}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
