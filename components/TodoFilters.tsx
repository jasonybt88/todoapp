"use client";

import { useEffect, useState } from "react";
import type { Priority, Tag } from "@/lib/db";
import {
  DEFAULT_FILTER_STATE, deletePreset, hasActiveFilters, loadPresets, savePreset,
  type FilterPreset, type FilterState,
} from "@/lib/filters";
import { getSingaporeNow } from "@/lib/timezone";

export function TodoFilters({ filters, tags, onChange, onImmediateSearch }: {
  filters: FilterState;
  tags: Tag[];
  onChange: (filters: FilterState) => void;
  onImmediateSearch: (search: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setPresets(loadPresets()), 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "todo-app:filter-presets" || event.key === null) setPresets(loadPresets());
    };
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); };
  }, []);

  const selectedTagExists = filters.tagId === "all" || tags.some((tag) => tag.id === filters.tagId);
  useEffect(() => {
    if (!selectedTagExists) {
      onChange({ ...filters, tagId: "all" });
    }
  }, [selectedTagExists, filters, onChange]);

  function apply(preset: FilterPreset) {
    const missingTag = preset.filters.tagId !== "all" &&
      !tags.some((tag) => tag.id === preset.filters.tagId);
    const next = { ...preset.filters, tagId: missingTag ? "all" as const : preset.filters.tagId };
    onChange(next);
    onImmediateSearch(next.search);
    setMessage(missingTag ? "The preset's tag is unavailable; showing all tags." : null);
  }

  function clearAll() {
    onChange({ ...DEFAULT_FILTER_STATE });
    onImmediateSearch("");
    setMessage(null);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setPresets(savePreset({
        id: crypto.randomUUID(), name: name.trim(), filters: { ...filters },
        createdAt: getSingaporeNow().toISOString(),
      }));
      setSaving(false);
      setExpanded(true);
      setName("");
      setMessage(null);
    } catch (error) {
      console.error("Failed to save filter preset:", error);
      setMessage(error instanceof DOMException && error.name === "QuotaExceededError"
        ? "Could not save preset — storage full." : "Could not save preset.");
    }
  }

  function remove(preset: FilterPreset) {
    if (!window.confirm(`Delete preset "${preset.name}"?`)) return;
    try {
      setPresets(deletePreset(preset.id));
      setMessage(null);
    } catch (error) {
      console.error("Failed to delete filter preset:", error);
      setMessage("Could not delete preset.");
    }
  }

  const preview = [
    filters.search.trim() && `Search: "${filters.search.trim()}"`,
    filters.priority !== "all" && `Priority: ${filters.priority}`,
    filters.tagId !== "all" && `Tag: ${tags.find((tag) => tag.id === filters.tagId)?.name ?? "Unavailable"}`,
    filters.completion !== "all" && `Completion: ${filters.completion}`,
    (filters.dueDateFrom || filters.dueDateTo) &&
      `Date: ${filters.dueDateFrom ?? "any"} to ${filters.dueDateTo ?? "any"}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="filter-controls">
      <div className="filter-search">
        <input className="todo-search" type="search" value={filters.search}
          onChange={(event) => {
            const search = event.target.value;
            onChange({ ...filters, search });
            if (!search) onImmediateSearch("");
          }}
          placeholder="Search todos and subtasks..." aria-label="Search todos and subtasks" />
        {filters.search && <button type="button" aria-label="Clear search" onClick={() => {
          onChange({ ...filters, search: "" });
          onImmediateSearch("");
        }}>×</button>}
      </div>
      <div className="todo-filters">
        <label htmlFor="priority-filter">Filter by priority</label>
        <select id="priority-filter" value={filters.priority}
          onChange={(event) => onChange({ ...filters, priority: event.target.value as Priority | "all" })}>
          <option value="all">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
        {tags.length > 0 && <>
          <label htmlFor="tag-filter">Filter by tag</label>
          <select id="tag-filter" value={selectedTagExists ? filters.tagId : "all"}
            onChange={(event) => onChange({ ...filters, tagId: event.target.value === "all" ? "all" : Number(event.target.value) })}>
            <option value="all">All Tags</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </>}
        <button type="button" className={expanded ? "filter-advanced active" : "filter-advanced"}
          aria-expanded={expanded} aria-controls="advanced-filters" onClick={() => setExpanded(!expanded)}>
          {expanded ? "▼ Advanced" : "▶ Advanced"}
        </button>
        {hasActiveFilters(filters) && <>
          <button type="button" className="filter-clear" onClick={clearAll}>Clear All</button>
          <button type="button" className="filter-save" onClick={() => { setMessage(null); setSaving(true); }}>Save Filter</button>
        </>}
      </div>
      {expanded && <div id="advanced-filters" className="advanced-filters">
        <label htmlFor="completion-filter">Completion status</label>
        <select id="completion-filter" value={filters.completion}
          onChange={(event) => onChange({ ...filters, completion: event.target.value as FilterState["completion"] })}>
          <option value="all">All Todos</option>
          <option value="incomplete">Incomplete Only</option>
          <option value="completed">Completed Only</option>
        </select>
        <label htmlFor="date-from">Due date from</label>
        <input id="date-from" type="date" value={filters.dueDateFrom ?? ""}
          onChange={(event) => onChange({ ...filters, dueDateFrom: event.target.value || null })} />
        <label htmlFor="date-to">Due date to</label>
        <input id="date-to" type="date" value={filters.dueDateTo ?? ""}
          onChange={(event) => onChange({ ...filters, dueDateTo: event.target.value || null })} />
        {presets.length > 0 && <div className="filter-presets" aria-label="Saved filters">
          {presets.map((preset) => <span className="filter-preset" key={preset.id}>
            <button type="button" onClick={() => apply(preset)}>{preset.name}</button>
            <button type="button" aria-label={`Delete preset ${preset.name}`} onClick={() => remove(preset)}>×</button>
          </span>)}
        </div>}
      </div>}
      {message && !saving && <p className="message error-message" role="alert">{message}</p>}
      {saving && <div className="modal-backdrop" role="presentation">
        <section className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="save-filter-title"
          onKeyDown={(event) => { if (event.key === "Escape") setSaving(false); }}>
          <h2 id="save-filter-title">Save Filter</h2>
          <p>{preview}</p>
          {message && <p className="message error-message" role="alert">{message}</p>}
          <form className="edit-form" onSubmit={save}>
            <label htmlFor="filter-name">Filter name</label>
            <input id="filter-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
            <div className="edit-actions">
              <button className="primary-button" type="submit" disabled={!name.trim()}>Save</button>
              <button className="secondary-button" type="button" onClick={() => setSaving(false)}>Cancel</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}
