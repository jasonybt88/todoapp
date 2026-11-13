"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Holiday, Priority, Todo } from "@/lib/db";
import {
  formatCalendarDate,
  generateCalendarGrid,
  getSingaporeDateKey,
} from "@/lib/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_TODOS = 3;

type CalendarTodo = Pick<Todo, "id" | "title" | "due_date" | "priority" | "completed">;

interface CalendarViewProps {
  year: number;
  month: number;
  onNavigate: (year: number, month: number) => void;
}

interface CalendarData {
  todos: CalendarTodo[];
  holidays: Holiday[];
}

interface LoadedCalendarData extends CalendarData {
  monthKey: string;
}

const EMPTY_TODOS: CalendarTodo[] = [];
const EMPTY_HOLIDAYS: Holiday[] = [];

function isCalendarTodo(value: unknown): value is CalendarTodo {
  if (typeof value !== "object" || value === null) return false;
  const todo = value as Record<string, unknown>;
  return (
    typeof todo.id === "number" &&
    typeof todo.title === "string" &&
    (typeof todo.due_date === "string" || todo.due_date === null) &&
    (todo.priority === "high" || todo.priority === "medium" || todo.priority === "low") &&
    typeof todo.completed === "boolean"
  );
}

function isHoliday(value: unknown): value is Holiday {
  if (typeof value !== "object" || value === null) return false;
  const holiday = value as Record<string, unknown>;
  return (
    typeof holiday.id === "number" &&
    typeof holiday.date === "string" &&
    typeof holiday.name === "string"
  );
}

function responseError(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    return String(data.error);
  }
  return fallback;
}

async function fetchCalendarData(
  year: number,
  month: number,
  signal: AbortSignal,
): Promise<CalendarData> {
  const [todosResponse, holidaysResponse] = await Promise.all([
    fetch("/api/todos", { signal }),
    fetch(`/api/holidays?year=${year}&month=${String(month).padStart(2, "0")}`, {
      signal,
    }),
  ]);
  const [todosResult, holidaysResult]: [unknown, unknown] = await Promise.all([
    todosResponse.json(),
    holidaysResponse.json(),
  ]);

  if (!todosResponse.ok) {
    throw new Error(responseError(todosResult, "Todos could not be loaded."));
  }
  if (!holidaysResponse.ok) {
    throw new Error(responseError(holidaysResult, "Holidays could not be loaded."));
  }
  if (
    !Array.isArray(todosResult) ||
    typeof holidaysResult !== "object" ||
    holidaysResult === null ||
    !("holidays" in holidaysResult) ||
    !Array.isArray(holidaysResult.holidays) ||
    !todosResult.every(isCalendarTodo) ||
    !holidaysResult.holidays.every(isHoliday)
  ) {
    throw new Error("The calendar response was invalid.");
  }

  return { todos: todosResult, holidays: holidaysResult.holidays };
}

function monthLabel(year: number, month: number): string {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, 1);
  date.setUTCHours(0, 0, 0, 0);
  return new Intl.DateTimeFormat("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function priorityLabel(priority: Priority): string {
  return `${priority[0].toUpperCase()}${priority.slice(1)}`;
}

export function CalendarView({ year, month, onNavigate }: CalendarViewProps) {
  const [calendarData, setCalendarData] = useState<LoadedCalendarData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ monthKey: string; message: string } | null>(null);
  const monthKey = `${year}-${month}`;
  const currentData = calendarData?.monthKey === monthKey ? calendarData : null;
  const todos = currentData?.todos ?? EMPTY_TODOS;
  const holidays = currentData?.holidays ?? EMPTY_HOLIDAYS;
  const error = loadError?.monthKey === monthKey ? loadError.message : null;
  const loading = !currentData && !error;

  useEffect(() => {
    const controller = new AbortController();
    fetchCalendarData(year, month, controller.signal)
      .then(({ todos: loadedTodos, holidays: loadedHolidays }) => {
        setCalendarData({ monthKey, todos: loadedTodos, holidays: loadedHolidays });
        setLoadError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError({
          monthKey,
          message: cause instanceof Error ? cause.message : "Calendar could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [year, month, monthKey]);

  useEffect(() => {
    if (!selectedDate) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedDate(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedDate]);

  const days = useMemo(() => generateCalendarGrid(year, month), [year, month]);
  const todosByDate = useMemo(() => {
    const result = new Map<string, CalendarTodo[]>();
    for (const todo of todos) {
      if (!todo.due_date || Number.isNaN(Date.parse(todo.due_date))) continue;
      const date = getSingaporeDateKey(todo.due_date);
      const dueOnDate = result.get(date) ?? [];
      dueOnDate.push(todo);
      result.set(date, dueOnDate);
    }
    return result;
  }, [todos]);
  const holidaysByDate = useMemo(
    () => new Map(holidays.map((holiday) => [holiday.date, holiday])),
    [holidays],
  );
  const selectedTodos = selectedDate ? todosByDate.get(selectedDate) ?? [] : [];
  const selectedHoliday = selectedDate ? holidaysByDate.get(selectedDate) ?? null : null;

  function navigate(nextYear: number, nextMonth: number) {
    setSelectedDate(null);
    onNavigate(nextYear, nextMonth);
  }

  function moveMonth(offset: number) {
    const next = new Date(0);
    next.setUTCFullYear(year, month - 1 + offset, 1);
    next.setUTCHours(0, 0, 0, 0);
    navigate(next.getUTCFullYear(), next.getUTCMonth() + 1);
  }

  function goToToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    navigate(Number(values.year), Number(values.month));
  }

  return (
    <main className="calendar-shell">
      <header className="calendar-heading">
        <div>
          <p className="eyebrow">Todo App</p>
          <h1>Calendar</h1>
        </div>
        <Link className="calendar-list-link" href="/">
          List
        </Link>
      </header>

      <section className="calendar-card" aria-label="Monthly calendar">
        <div className="calendar-toolbar">
          <div className="calendar-month-controls">
            <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
              ‹
            </button>
            <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
              ›
            </button>
            <h2 aria-live="polite">{monthLabel(year, month)}</h2>
          </div>
          <button className="secondary-button calendar-today-button" type="button" onClick={goToToday}>
            Today
          </button>
        </div>

        {error && <p className="message error-message" role="alert">{error}</p>}
        {loading && <p className="muted" role="status">Loading calendar...</p>}

        <div className="calendar-grid">
          {WEEKDAYS.map((weekday) => (
            <div className="calendar-weekday" key={weekday}>
              {weekday}
            </div>
          ))}
          {days.map((day) => {
            const dayTodos = todosByDate.get(day.date) ?? [];
            const holiday = holidaysByDate.get(day.date);
            const visibleTodos = dayTodos.slice(0, MAX_VISIBLE_TODOS);
            const overflow = dayTodos.length - visibleTodos.length;
            const classNames = [
              "calendar-day",
              day.isCurrentMonth ? "" : "calendar-day-adjacent",
              day.isCurrentMonth && day.isPast ? "calendar-day-past" : "",
              day.isToday ? "calendar-day-today" : "",
              day.isWeekend ? "calendar-day-weekend" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                className={classNames}
                data-testid="calendar-day"
                data-date={day.date}
                type="button"
                aria-label={`${formatCalendarDate(day.date)}${holiday ? `, ${holiday.name}` : ""}, ${dayTodos.length} todos`}
                onClick={() => setSelectedDate(day.date)}
                key={day.date}
              >
                <span className="calendar-day-number">{Number(day.date.slice(-2))}</span>
                {holiday && <span className="calendar-holiday">{holiday.name}</span>}
                {visibleTodos.map((todo) => (
                  <span
                    className={`calendar-todo-pill calendar-priority-${todo.priority}${todo.completed ? " calendar-todo-completed" : ""}`}
                    key={todo.id}
                    title={`${todo.title} (${priorityLabel(todo.priority)})`}
                  >
                    {todo.title}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="calendar-overflow">+{overflow} more</span>
                )}
              </button>
            );
          })}
        </div>
        {selectedDate && (
          <DayTodosModal
            date={selectedDate}
            todos={selectedTodos}
            holiday={selectedHoliday}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </section>
    </main>
  );
}

function DayTodosModal({
  date,
  todos,
  holiday,
  onClose,
}: {
  date: string;
  todos: CalendarTodo[];
  holiday: Holiday | null;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="day-todos-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-todos-title"
      >
        <div className="day-todos-heading">
          <div>
            <p className="eyebrow">Day details</p>
            <h2 id="day-todos-title">{formatCalendarDate(date)}</h2>
          </div>
          <button className="day-todos-close" type="button" aria-label="Close day details" onClick={onClose}>
            ×
          </button>
        </div>
        {holiday && <p className="calendar-modal-holiday">{holiday.name}</p>}
        {todos.length === 0 ? (
          <p className="muted">No todos due on this day.</p>
        ) : (
          <ul className="day-todo-list">
            {todos.map((todo) => (
              <li className={todo.completed ? "day-todo-completed" : ""} key={todo.id}>
                <span className="day-todo-title">{todo.title}</span>
                <span className={`priority-badge priority-${todo.priority}`}>
                  {priorityLabel(todo.priority)}
                </span>
                <span className="day-todo-status">
                  {todo.completed ? "Completed" : "Incomplete"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
