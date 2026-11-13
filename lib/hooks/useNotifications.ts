"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Todo } from "@/lib/db";
import { formatSingaporeDate } from "@/lib/timezone";

type Permission = NotificationPermission | "unsupported";
const PERMISSION_EVENT = "todo-notification-permission";

function getPermission(): Permission {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

function subscribePermission(callback: () => void) {
  window.addEventListener("focus", callback);
  window.addEventListener(PERMISSION_EVENT, callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener("focus", callback);
    window.removeEventListener(PERMISSION_EVENT, callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

export function useNotifications() {
  const permission = useSyncExternalStore(
    subscribePermission,
    getPermission,
    () => "default" as Permission,
  );
  const [error, setError] = useState<string | null>(null);

  const requestPermission = useCallback(async () => {
    if (getPermission() === "unsupported") {
      setError("This browser does not support notifications.");
      return;
    }
    try {
      await Notification.requestPermission();
      window.dispatchEvent(new Event(PERMISSION_EVENT));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enable notifications.");
    }
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    let active = true;
    let polling = false;

    async function poll() {
      if (polling) return;
      if (getPermission() !== "granted") {
        window.dispatchEvent(new Event(PERMISSION_EVENT));
        return;
      }
      polling = true;
      try {
        const response = await fetch("/api/notifications/check", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not check reminders.");
        const result = (await response.json()) as { data: Todo[] };
        for (const todo of result.data) {
          if (!active || getPermission() !== "granted") break;
          if (!todo.due_date || todo.reminder_minutes === null) continue;
          new Notification(todo.title, {
            body: `Due ${formatSingaporeDate(todo.due_date)}`,
            tag: `todo-${todo.id}`,
          });
          const marked = await fetch(`/api/todos/${todo.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              last_notification_sent: new Date().toISOString(),
              notification_snapshot: {
                due_date: todo.due_date,
                reminder_minutes: todo.reminder_minutes,
              },
            }),
          });
          if (!marked.ok) throw new Error("Could not save reminder delivery; it may appear again.");
        }
        if (active) setError(null);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not check reminders.");
        }
      } finally {
        polling = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [permission]);

  return { permission, requestPermission, error };
}
