import { beforeAll, describe, expect, it } from "vitest";

type DatabaseModule = typeof import("../../lib/db");
let database: DatabaseModule;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  database = await import("../../lib/db");
});

function createUser(username: string) {
  return database.createUserWithAuthenticator(
    username,
    `credential-${username}`,
    new Uint8Array([1, 2, 3]),
    0,
    [],
  );
}

describe("todo persistence", () => {
  it("applies defaults, returns related rows, and scopes lists by user", () => {
    const firstUser = createUser("todo-owner");
    const secondUser = createUser("other-owner");
    const firstTodo = database.todoDB.create(firstUser.id, {
      title: "  Buy groceries  ",
    });

    database.todoDB.create(secondUser.id, { title: "Private todo" });

    expect(firstTodo).toMatchObject({
      user_id: firstUser.id,
      title: "Buy groceries",
      completed: false,
      due_date: null,
      priority: "medium",
      is_recurring: false,
      recurrence_pattern: null,
      reminder_minutes: null,
      subtasks: [],
      tags: [],
    });
    expect(database.todoDB.findAllByUser(firstUser.id)).toHaveLength(1);
    expect(database.todoDB.findAllByUser(secondUser.id)).toHaveLength(1);
  });

  it("updates only supplied fields and cascades parent deletion", () => {
    const user = createUser("cascade-owner");
    const todo = database.todoDB.create(user.id, { title: "Parent" });
    const subtask = database.subtaskDB.create(todo.id, { title: "Child" });

    const updated = database.todoDB.update(todo.id, { completed: true });
    expect(updated).toMatchObject({
      title: "Parent",
      completed: true,
      priority: "medium",
    });

    database.todoDB.delete(todo.id);
    expect(database.todoDB.findById(todo.id)).toBeNull();
    expect(database.subtaskDB.findByTodoId(todo.id)).toEqual([]);
    expect(database.subtaskDB.findByTodoId(subtask.todo_id)).toEqual([]);
  });

  it("creates one recurring instance atomically and copies current todo fields", () => {
    const user = createUser("recurrence-owner");
    const todo = database.todoDB.create(user.id, {
      title: "Pay rent",
      due_date: "2026-01-31T01:00:00.000Z",
      priority: "high",
      is_recurring: true,
      recurrence_pattern: "monthly",
      reminder_minutes: 30,
    });

    const completed = database.todoDB.updateAndCreateNextInstance(
      todo.id,
      user.id,
      { completed: true },
    );
    expect(completed).toMatchObject({
      todo: { id: todo.id, completed: true, is_recurring: true },
      nextInstance: {
        title: "Pay rent",
        completed: false,
        due_date: "2026-02-28T01:00:00.000Z",
        priority: "high",
        is_recurring: true,
        recurrence_pattern: "monthly",
        reminder_minutes: 30,
      },
    });

    const repeatedCompletion = database.todoDB.updateAndCreateNextInstance(
      todo.id,
      user.id,
      { completed: true },
    );
    expect(repeatedCompletion).toEqual({ todo: completed?.todo });
    expect(database.todoDB.findAllByUser(user.id)).toHaveLength(2);
  });

  it("does not create recurring instances for other users or non-recurring todos", () => {
    const owner = createUser("nonrecurring-owner");
    const otherUser = createUser("nonrecurring-other");
    const todo = database.todoDB.create(owner.id, { title: "One-off" });

    expect(
      database.todoDB.updateAndCreateNextInstance(todo.id, otherUser.id, {
        completed: true,
      }),
    ).toBeNull();
    expect(
      database.todoDB.updateAndCreateNextInstance(todo.id, owner.id, {
        completed: true,
      }),
    ).toEqual({
      todo: expect.objectContaining({ completed: true }),
    });
    expect(database.todoDB.findAllByUser(owner.id)).toHaveLength(1);
  });

  it("seeds holidays and includes adjacent-month holidays in the visible range", () => {
    const december = database.holidayDB.findByMonth(2026, 12);
    expect(december).toContainEqual(
      expect.objectContaining({ date: "2026-12-25", name: "Christmas Day" }),
    );
    expect(december).toContainEqual(
      expect.objectContaining({ date: "2027-01-01", name: "New Year's Day" }),
    );
    expect(database.holidayDB.findByMonth(2027, 2)).toContainEqual(
      expect.objectContaining({ date: "2027-02-08", name: "Chinese New Year (observed)" }),
    );
  });
});

describe("subtask persistence", () => {
  it("preserves position gaps, scopes mutations, and cascades parent deletion", () => {
    const owner = createUser("subtask-owner");
    const other = createUser("subtask-other");
    const todo = database.todoDB.create(owner.id, { title: "Checklist" });
    const first = database.subtaskDB.createForUser(todo.id, owner.id, { title: "First" });
    const second = database.subtaskDB.createForUser(todo.id, owner.id, { title: "Second" });
    expect(first?.position).toBe(0);
    expect(second?.position).toBe(1);
    if (!first || !second) throw new Error("Subtask creation failed");
    expect(database.subtaskDB.createForUser(todo.id, other.id, { title: "Unauthorized" })).toBeNull();
    expect(database.subtaskDB.updateForUser(first.id, other.id, { completed: true })).toBeNull();
    expect(database.subtaskDB.deleteForUser(first.id, other.id)).toBe(false);
    expect(database.subtaskDB.updateForUser(first.id, owner.id, { title: "Renamed", completed: true }))
      .toMatchObject({ title: "Renamed", completed: true });
    expect(database.subtaskDB.deleteForUser(first.id, owner.id)).toBe(true);
    const third = database.subtaskDB.createForUser(todo.id, owner.id, { title: "Third" });
    expect(third?.position).toBe(2);
    expect(database.subtaskDB.findByTodoId(todo.id).map((item) => item.position)).toEqual([1, 2]);
    expect(database.todoDB.findById(todo.id)?.completed).toBe(false);
    database.todoDB.delete(todo.id);
    expect(database.subtaskDB.findByTodoId(todo.id)).toEqual([]);
    expect(database.subtaskDB.findByIdForUser(second.id, owner.id)).toBeNull();
  });
});

describe("reminder persistence", () => {
  it("finds each preset at its exact Singapore date boundary, including overdue reminders", () => {
    const due = new Date("2026-03-01T16:00:00.000Z");
    for (const minutes of [15, 30, 60, 120, 1440, 2880, 10080]) {
      const owner = createUser(`reminder-${minutes}`);
      const todo = database.todoDB.create(owner.id, {
        title: `Reminder ${minutes}`,
        due_date: due.toISOString(),
        reminder_minutes: minutes,
      });

      const boundary = due.getTime() - minutes * 60_000;
      expect(database.todoDB.findDueReminders(owner.id, new Date(boundary - 1))).toEqual([]);
      expect(database.todoDB.findDueReminders(owner.id, new Date(boundary)).map((item) => item.id))
        .toEqual([todo.id]);
      expect(database.todoDB.findDueReminders(owner.id, new Date(due.getTime() + 86400_000)).map((item) => item.id))
        .toEqual([todo.id]);
    }
  });

  it("scopes, suppresses and re-arms notifications only when reminder settings change", () => {
    const owner = createUser("reminder-owner");
    const other = createUser("reminder-other");
    const due = "2026-03-01T16:00:00.000Z";
    const now = new Date("2026-03-01T15:50:00.000Z");
    const todo = database.todoDB.create(owner.id, {
      title: "Due soon",
      due_date: due,
      reminder_minutes: 15,
    });
    expect(database.todoDB.findDueReminders(other.id, now)).toEqual([]);
    database.todoDB.update(todo.id, { completed: true });
    expect(database.todoDB.findDueReminders(owner.id, now)).toEqual([]);
    database.todoDB.update(todo.id, { completed: false });
    database.todoDB.update(todo.id, { last_notification_sent: now.toISOString() });
    expect(database.todoDB.findDueReminders(owner.id, now)).toEqual([]);
    expect(database.todoDB.update(todo.id, { title: "Renamed", due_date: due })?.last_notification_sent)
      .toBe(now.toISOString());
    expect(database.todoDB.update(todo.id, { reminder_minutes: 30 })?.last_notification_sent)
      .toBeNull();
    expect(database.todoDB.findDueReminders(owner.id, now).map((item) => item.id)).toEqual([todo.id]);
    database.todoDB.update(todo.id, { last_notification_sent: now.toISOString() });
    expect(database.todoDB.update(todo.id, { due_date: "2026-03-01T16:10:00.000Z" })?.last_notification_sent)
      .toBeNull();
  });
});
