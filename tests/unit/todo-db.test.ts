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
