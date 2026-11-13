"use client";

import { useState, type FormEvent } from "react";
import type { CreateTagInput, Tag, UpdateTagInput } from "@/lib/db";
import {
  DEFAULT_TAG_COLOR,
  getTagTextColor,
  validateTagColor,
} from "@/lib/tags";

export function TagPill({
  tag,
  selected = false,
  onClick,
  label,
}: {
  tag: Tag;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const className = `tag-pill${selected ? " tag-pill-selected" : ""}`;
  const style = {
    backgroundColor: tag.color,
    color: getTagTextColor(tag.color),
  };
  const content = (
    <>
      {selected && <span aria-hidden="true">✓</span>}
      <span className="tag-pill-name">{tag.name}</span>
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={className}
      style={style}
      aria-pressed={selected}
      aria-label={label ?? `${selected ? "Deselect" : "Select"} tag ${tag.name}`}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className={className} style={style}>{content}</span>
  );
}

export function TagSelector({
  tags,
  selectedIds,
  onToggle,
}: {
  tags: Tag[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="tag-selector" role="group" aria-label="Todo tags">
      {tags.length === 0 ? (
        <span className="muted">No tags yet. Create one with Manage Tags.</span>
      ) : (
        tags.map((tag) => (
          <TagPill
            key={tag.id}
            tag={tag}
            selected={selectedIds.includes(tag.id)}
            onClick={() => onToggle(tag.id)}
          />
        ))
      )}
    </div>
  );
}

function colorPickerValue(value: string): string {
  const validated = validateTagColor(value);
  return validated.valid ? validated.value : DEFAULT_TAG_COLOR;
}

export function ManageTagsModal({
  tags,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  tags: Tag[];
  onClose: () => void;
  onCreate: (input: CreateTagInput) => Promise<void>;
  onUpdate: (id: number, input: UpdateTagInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_TAG_COLOR);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState(DEFAULT_TAG_COLOR);
  const [error, setError] = useState<string | null>(null);

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await onCreate({ name, color });
      setName("");
      setColor(DEFAULT_TAG_COLOR);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create tag.");
    }
  }

  function startEditing(tag: Tag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setEditingColor(tag.color);
    setError(null);
  }

  async function saveTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingId === null) return;
    setError(null);
    try {
      await onUpdate(editingId, { name: editingName, color: editingColor });
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update tag.");
    }
  }

  async function deleteTag(tag: Tag) {
    if (!window.confirm(`Delete "${tag.name}" from all todos?`)) return;
    setError(null);
    try {
      await onDelete(tag.id);
      if (editingId === tag.id) setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete tag.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="manage-tags-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-tags-title"
      >
        <div className="manage-tags-heading">
          <h2 id="manage-tags-title">Manage Tags</h2>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="message error-message" role="alert">{error}</p>}
        <ul className="tag-manage-list">
          {tags.map((tag) => (
            <li key={tag.id}>
              {editingId === tag.id ? (
                <form className="tag-edit-form" onSubmit={saveTag}>
                  <label>
                    Name
                    <input
                      aria-label="Edit tag name"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                  </label>
                  <label>
                    Color
                    <span className="tag-color-fields">
                      <input
                        type="color"
                        aria-label="Edit tag color picker"
                        value={colorPickerValue(editingColor)}
                        onChange={(event) => setEditingColor(event.target.value)}
                      />
                      <input
                        aria-label="Edit tag color hex"
                        value={editingColor}
                        onChange={(event) => setEditingColor(event.target.value)}
                      />
                    </span>
                  </label>
                  <div className="tag-manage-actions">
                    <button className="primary-button" type="submit">Update</button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <TagPill tag={tag} selected />
                  <div className="tag-manage-actions">
                    <button
                      type="button"
                      className="tag-action"
                      onClick={() => startEditing(tag)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="tag-action tag-delete-action"
                      onClick={() => void deleteTag(tag)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="tag-create-form" onSubmit={createTag}>
          <label htmlFor="new-tag-name">Tag name</label>
          <input
            id="new-tag-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Tag name"
          />
          <label htmlFor="new-tag-color-hex">Tag color</label>
          <span className="tag-color-fields">
            <input
              type="color"
              aria-label="Tag color picker"
              value={colorPickerValue(color)}
              onChange={(event) => setColor(event.target.value)}
            />
            <input
              id="new-tag-color-hex"
              aria-label="Tag color hex"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </span>
          <button className="primary-button" type="submit">Create Tag</button>
        </form>
      </section>
    </div>
  );
}
