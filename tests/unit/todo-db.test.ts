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
});
