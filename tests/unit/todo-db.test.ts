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

describe("tag persistence", () => {
  it("scopes tag names by user and returns current tag data on todos", () => {
    const owner = createUser("tag-owner");
    const other = createUser("tag-other");
    const work = database.tagDB.create(owner.id, { name: "Work" });
    const otherWork = database.tagDB.create(other.id, { name: "Work" });
    const personal = database.tagDB.create(owner.id, {
      name: "Personal",
      color: "#123456",
    });

    expect(work.color).toBe("#3B82F6");
    expect(otherWork.id).not.toBe(work.id);
    expect(database.tagDB.findAllByUser(owner.id)).toHaveLength(2);
    expect(database.tagDB.findById(work.id, other.id)).toBeNull();
    expect(() => database.tagDB.create(owner.id, { name: "Work" })).toThrow();

    const todo = database.todoDB.create(owner.id, {
      title: "Tagged todo",
      tag_ids: [work.id, personal.id],
    });
    expect(todo.tags.map((tag) => tag.name)).toEqual(["Personal", "Work"]);

    const updated = database.tagDB.update(work.id, owner.id, {
      name: "Projects",
      color: "#112233",
    });
    expect(updated).toMatchObject({ name: "Projects", color: "#112233" });
    expect(database.todoDB.findById(todo.id)?.tags).toContainEqual(updated);
    expect(database.tagDB.update(work.id, other.id, { name: "Hidden" })).toBeNull();
  });

  it("attaches and detaches idempotently and rejects cross-user relationships", () => {
    const owner = createUser("tag-attach-owner");
    const other = createUser("tag-attach-other");
    const todo = database.todoDB.create(owner.id, { title: "Todo" });
    const tag = database.tagDB.create(owner.id, { name: "Repeat" });
    const otherTag = database.tagDB.create(other.id, { name: "Private" });

    expect(database.tagDB.attachToTodo(todo.id, tag.id, owner.id)).toBe(true);
    expect(database.tagDB.attachToTodo(todo.id, tag.id, owner.id)).toBe(true);
    expect(database.tagDB.findByTodoId(todo.id)).toHaveLength(1);
    expect(database.tagDB.detachFromTodo(todo.id, tag.id, owner.id)).toBe(true);
    expect(database.tagDB.detachFromTodo(todo.id, tag.id, owner.id)).toBe(true);
    expect(database.tagDB.findByTodoId(todo.id)).toEqual([]);
    expect(database.tagDB.attachToTodo(todo.id, otherTag.id, owner.id)).toBe(false);
    expect(database.tagDB.detachFromTodo(todo.id, otherTag.id, owner.id)).toBe(false);
  });

  it("replaces todo tags atomically and cascades only the deleted tag links", () => {
    const owner = createUser("tag-cascade-owner");
    const other = createUser("tag-cascade-other");
    const kept = database.tagDB.create(owner.id, { name: "Keep" });
    const removed = database.tagDB.create(owner.id, { name: "Remove" });
    const foreign = database.tagDB.create(other.id, { name: "Foreign" });
    const todo = database.todoDB.create(owner.id, {
      title: "Parent",
      tag_ids: [kept.id, removed.id],
    });
    const additionalTodos = Array.from({ length: 50 }, (_, index) =>
      database.todoDB.create(owner.id, {
        title: `Cascade ${index}`,
        tag_ids: [removed.id],
      }),
    );

    expect(() =>
      database.todoDB.update(todo.id, { tag_ids: [foreign.id] }),
    ).toThrow("Tag not found");
    expect(database.todoDB.findById(todo.id)?.tags.map((tag) => tag.id))
      .toEqual([kept.id, removed.id]);

    expect(database.tagDB.delete(removed.id, other.id)).toBe(false);
    expect(database.tagDB.delete(removed.id, owner.id)).toBe(true);
    expect(database.todoDB.findById(todo.id)?.tags.map((tag) => tag.id))
      .toEqual([kept.id]);
    expect(additionalTodos.every((item) =>
      database.todoDB.findById(item.id)?.tags.length === 0,
    )).toBe(true);
  });
});
