"use client";

import { useEffect, useState } from "react";
import type {
  CreateTemplateDto,
  Priority,
  RecurrencePattern,
  Template,
  TemplateSubtask,
} from "@/lib/db";
import { requestJson } from "@/lib/client-http";
import { REMINDER_OPTIONS } from "@/lib/reminders";
import { parseTemplateSubtasks } from "@/lib/template-utils";

export interface TemplateDraft {
  name: string;
  description: string;
  category: string;
  title: string;
  priority: Priority;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  reminderMinutes: number | null;
  dueDateOffsetMinutes: string;
  subtasks: TemplateSubtask[];
}

interface SaveTemplateModalProps {
  initialDraft: TemplateDraft;
  template?: Template;
  onClose: () => void;
  onSaved: (template: Template) => void;
}

function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
}

export function SaveTemplateModal({
  initialDraft,
  template,
  onClose,
  onSaved,
}: SaveTemplateModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeToClose(onClose);

  const offset = draft.dueDateOffsetMinutes.trim() === ""
    ? null
    : Number(draft.dueDateOffsetMinutes);
  const offsetInvalid = offset !== null &&
    (!Number.isSafeInteger(offset) || offset < 1);
  const offsetRequired = draft.isRecurring || draft.reminderMinutes !== null;
  const subtasksInvalid = draft.subtasks.some(
    (subtask) => subtask.title.trim().length === 0,
  );
  const canSave =
    !saving &&
    draft.name.trim().length > 0 &&
    draft.title.trim().length > 0 &&
    !offsetInvalid &&
    (!offsetRequired || offset !== null) &&
    !subtasksInvalid;

  function update<K extends keyof TemplateDraft>(field: K, value: TemplateDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateSubtask(index: number, title: string) {
    setDraft((current) => ({
      ...current,
      subtasks: current.subtasks.map((subtask, itemIndex) =>
        itemIndex === index ? { ...subtask, title } : subtask,
      ),
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!canSave || offsetInvalid) {
      setError("Enter a template name and title, and resolve any required due-date offset or checklist items.");
      return;
    }

    const input: CreateTemplateDto = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      category: draft.category.trim() || undefined,
      title_template: draft.title.trim(),
      priority: draft.priority,
      is_recurring: draft.isRecurring,
      recurrence_pattern: draft.isRecurring ? draft.recurrencePattern : null,
      reminder_minutes: draft.reminderMinutes,
      due_date_offset_minutes: offset,
      subtasks: draft.subtasks.map((subtask, position) => ({
        title: subtask.title.trim(),
        position,
      })),
    };

    setSaving(true);
    try {
      const saved = await requestJson<Template>(
        template ? `/api/templates/${template.id}` : "/api/templates",
        {
          method: template ? "PUT" : "POST",
          body: JSON.stringify(input),
        },
      );
      onSaved(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="edit-dialog template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
      >
        <h2 id="save-template-title">{template ? "Edit template" : "Save as template"}</h2>
        <form className="edit-form template-form" onSubmit={save}>
          <label htmlFor="template-name">Template name</label>
          <input
            id="template-name"
            value={draft.name}
            maxLength={100}
            onChange={(event) => update("name", event.target.value)}
            autoFocus
          />
          <label htmlFor="template-title">Todo title</label>
          <input
            id="template-title"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
          />
          <label htmlFor="template-description">Description (optional)</label>
          <textarea
            id="template-description"
            value={draft.description}
            maxLength={1000}
            onChange={(event) => update("description", event.target.value)}
          />
          <label htmlFor="template-category">Category (optional)</label>
          <input
            id="template-category"
            value={draft.category}
            maxLength={100}
            list="template-category-options"
            onChange={(event) => update("category", event.target.value)}
          />
          <datalist id="template-category-options">
            <option value="Work" />
            <option value="Personal" />
            <option value="Health" />
            <option value="Finance" />
          </datalist>
          <label htmlFor="template-priority">Priority</label>
          <select
            id="template-priority"
            value={draft.priority}
            onChange={(event) => update("priority", event.target.value as Priority)}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label htmlFor="template-offset">Due date offset (minutes, optional)</label>
          <input
            id="template-offset"
            type="number"
            min="1"
            step="1"
            value={draft.dueDateOffsetMinutes}
            onChange={(event) => update("dueDateOffsetMinutes", event.target.value)}
            aria-describedby="template-offset-hint"
          />
          <p id="template-offset-hint" className="muted template-hint">
            The new due date is this many minutes from when the template is used.
            A positive offset is required for reminders and recurring todos.
          </p>
          <label htmlFor="template-reminder">Reminder</label>
          <select
            id="template-reminder"
            value={draft.reminderMinutes ?? ""}
            onChange={(event) =>
              update(
                "reminderMinutes",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
          >
            <option value="">None</option>
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>{option.label}</option>
            ))}
          </select>
          <label className="template-checkbox" htmlFor="template-recurring">
            <input
              id="template-recurring"
              type="checkbox"
              checked={draft.isRecurring}
              onChange={(event) => update("isRecurring", event.target.checked)}
            />
            Repeat
          </label>
          {draft.isRecurring && (
            <>
              <label htmlFor="template-recurrence">Recurrence pattern</label>
              <select
                id="template-recurrence"
                value={draft.recurrencePattern}
                onChange={(event) =>
                  update("recurrencePattern", event.target.value as RecurrencePattern)
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </>
          )}
          <div className="template-checklist">
            <h3>Checklist</h3>
            {draft.subtasks.map((subtask, index) => (
              <div className="template-subtask-row" key={`${index}-${subtask.position}`}>
                <label className="visually-hidden" htmlFor={`template-subtask-${index}`}>
                  Checklist item {index + 1}
                </label>
                <input
                  id={`template-subtask-${index}`}
                  value={subtask.title}
                  onChange={(event) => updateSubtask(index, event.target.value)}
                />
                <button
                  className="secondary-button"
                  type="button"
                  aria-label={`Remove checklist item ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      subtasks: current.subtasks
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((item, position) => ({ ...item, position })),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                update("subtasks", [
                  ...draft.subtasks,
                  { title: "", position: draft.subtasks.length },
                ])
              }
            >
              Add checklist item
            </button>
          </div>
          {error && <p className="message error-message" role="alert">{error}</p>}
          <div className="edit-actions">
            <button className="primary-button" type="submit" disabled={!canSave}>
              {saving ? "Saving..." : template ? "Update template" : "Save template"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

interface TemplateManagerModalProps {
  templates: Template[];
  busyId: number | null;
  onClose: () => void;
  onEdit: (template: Template) => void;
  onUse: (template: Template) => void;
  onDelete: (template: Template) => void;
}

function describeOffset(offset: number | null): string | null {
  if (offset === null) return null;
  if (offset % 1440 === 0) return `Due in ${offset / 1440} day${offset === 1440 ? "" : "s"}`;
  if (offset % 60 === 0) return `Due in ${offset / 60} hour${offset === 60 ? "" : "s"}`;
  return `Due in ${offset} minute${offset === 1 ? "" : "s"}`;
}

export function TemplateManagerModal({
  templates,
  busyId,
  onClose,
  onEdit,
  onUse,
  onDelete,
}: TemplateManagerModalProps) {
  useEscapeToClose(onClose);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && busyId === null) onClose();
      }}
    >
      <section
        className="edit-dialog template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-manager-title"
      >
        <div className="template-modal-heading">
          <h2 id="template-manager-title">Templates</h2>
          <button
            className="secondary-button"
            type="button"
            disabled={busyId !== null}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {templates.length === 0 ? (
          <p className="muted">No templates yet. Save a todo or create one from the form.</p>
        ) : (
          <ul className="template-list">
            {templates.map((template) => {
              const subtasks = parseTemplateSubtasks(template.subtasks_json);
              const offset = describeOffset(template.due_date_offset_minutes);
              return (
                <li
                  className="template-card"
                  key={template.id}
                  data-testid="template-card"
                  data-template-id={template.id}
                >
                  <div className="template-card-heading">
                    <div>
                      <h3>{template.name}</h3>
                      {template.category && <span className="template-category">{template.category}</span>}
                    </div>
                    <span className={`priority-badge priority-${template.priority}`}>
                      {template.priority}
                    </span>
                  </div>
                  <p className="template-card-title">{template.title_template}</p>
                  {template.description && <p className="muted">{template.description}</p>}
                  <div className="template-card-details">
                    {template.is_recurring && template.recurrence_pattern && (
                      <span className="recurrence-badge">{template.recurrence_pattern}</span>
                    )}
                    {template.reminder_minutes !== null && (
                      <span className="reminder-badge">
                        🔔 {REMINDER_OPTIONS.find((item) => item.minutes === template.reminder_minutes)?.short ?? `${template.reminder_minutes} min`}
                      </span>
                    )}
                    {offset && <span>{offset}</span>}
                    {subtasks.length > 0 && (
                      <span>{subtasks.length} checklist item{subtasks.length === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  <div className="template-card-actions">
                    <button className="primary-button" type="button" disabled={busyId === template.id} onClick={() => onUse(template)}>
                      Use
                    </button>
                    <button className="secondary-button" type="button" disabled={busyId !== null} onClick={() => onEdit(template)}>
                      Edit
                    </button>
                    <button className="delete-button" type="button" disabled={busyId !== null} onClick={() => onDelete(template)}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function templateDraftFromTemplate(template: Template): TemplateDraft {
  return {
    name: template.name,
    description: template.description ?? "",
    category: template.category ?? "",
    title: template.title_template,
    priority: template.priority,
    isRecurring: template.is_recurring,
    recurrencePattern: template.recurrence_pattern ?? "daily",
    reminderMinutes: template.reminder_minutes,
    dueDateOffsetMinutes: template.due_date_offset_minutes?.toString() ?? "",
    subtasks: parseTemplateSubtasks(template.subtasks_json),
  };
}
