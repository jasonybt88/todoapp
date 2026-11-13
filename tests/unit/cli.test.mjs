import assert from "node:assert/strict";
import test from "node:test";
import { createTodoClient } from "../../cli/client.mjs";
import { executeCommand, parseCommand } from "../../cli/todo.mjs";

test("CLI client uses the shared todo routes and session cookie", async () => {
  const requests = [];
  const client = createTodoClient({
    baseUrl: "https://todo.example",
    sessionToken: "session-token",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ id: 8, title: "Test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.update(8, { completed: true });

  assert.equal(requests[0].url, "https://todo.example/api/todos/8");
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(requests[0].options.headers.Cookie, "auth_session=session-token");
  assert.deepEqual(JSON.parse(requests[0].options.body), { completed: true });
});

test("CLI client reports API errors and requires an explicit session token", async () => {
  assert.throws(
    () => createTodoClient({ sessionToken: "" }),
    /TODOAPP_SESSION_TOKEN/,
  );
  const client = createTodoClient({
    sessionToken: "token",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(client.list(), /Not authenticated/);
});

test("CLI commands parse create, update and delete arguments", async () => {
  assert.deepEqual(
    parseCommand([
      "create",
      "Test task",
      "--priority",
      "high",
      "--due-date",
      "2026-11-14T02:00:00.000Z",
      "--repeat",
      "weekly",
    ]),
    {
      command: "create",
      input: {
        title: "Test task",
        priority: "high",
        due_date: "2026-11-14T02:00:00.000Z",
        is_recurring: true,
        recurrence_pattern: "weekly",
      },
    },
  );
  assert.deepEqual(
    parseCommand(["update", "12", "--completed", "true", "--due-date", "none"]),
    {
      command: "update",
      id: "12",
      input: { completed: true, due_date: null },
    },
  );

  const result = await executeCommand(
    parseCommand(["delete", "12"]),
    { delete: async (id) => ({ success: id === "12" }) },
  );
  assert.deepEqual(result, { success: true });
});

test("CLI forwards priority updates and reports API validation errors", async () => {
  const requests = [];
  const client = createTodoClient({
    baseUrl: "https://todo.example",
    sessionToken: "session-token",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ id: 12, priority: "low" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await executeCommand(
    parseCommand(["update", "12", "--priority", "low"]),
    client,
  );
  assert.equal(requests[0].url, "https://todo.example/api/todos/12");
  assert.deepEqual(JSON.parse(requests[0].options.body), { priority: "low" });

  const rejectingClient = createTodoClient({
    sessionToken: "session-token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: "Invalid priority: urgent. Must be 'high', 'medium', or 'low'.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
  });
  await assert.rejects(
    executeCommand(
      parseCommand(["update", "12", "--priority", "urgent"]),
      rejectingClient,
    ),
    /Invalid priority: urgent/,
  );
});

test("CLI recurrence options validate patterns and disable recurrence explicitly", () => {
  assert.throws(
    () => parseCommand(["create", "No date", "--repeat", "daily"]),
    /require --due-date/,
  );
  assert.throws(
    () => parseCommand(["create", "Bad pattern", "--repeat", "fortnightly"]),
    /must be daily, weekly, monthly, or yearly/,
  );
  assert.deepEqual(
    parseCommand(["update", "12", "--no-repeat"]),
    {
      command: "update",
      id: "12",
      input: { is_recurring: false, recurrence_pattern: null },
    },
  );
});

test("CLI exposes shared tag routes with the session cookie", async () => {
  const requests = [];
  const client = createTodoClient({
    baseUrl: "https://todo.example",
    sessionToken: "session-token",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.listTags();
  await client.createTag({ name: "Work", color: "#123456" });
  await client.updateTag(4, { name: "Projects" });
  await client.deleteTag(4);
  await client.attachTag(12, 4);
  await client.detachTag(12, 4);

  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method ?? "GET"]),
    [
      ["https://todo.example/api/tags", "GET"],
      ["https://todo.example/api/tags", "POST"],
      ["https://todo.example/api/tags/4", "PUT"],
      ["https://todo.example/api/tags/4", "DELETE"],
      ["https://todo.example/api/todos/12/tags", "POST"],
      ["https://todo.example/api/todos/12/tags", "DELETE"],
    ],
  );
  assert.equal(requests[0].options.headers.Cookie, "auth_session=session-token");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    name: "Work",
    color: "#123456",
  });
  assert.deepEqual(JSON.parse(requests[4].options.body), { tag_id: 4 });
});

test("CLI parses tag CRUD and idempotent association commands", async () => {
  assert.deepEqual(
    parseCommand(["tags", "create", "Work", "--color", "#123456"]),
    {
      command: "tags",
      action: "create",
      input: { name: "Work", color: "#123456" },
    },
  );
  assert.deepEqual(
    parseCommand(["tags", "update", "4", "--name", "Projects"]),
    {
      command: "tags",
      action: "update",
      id: "4",
      input: { name: "Projects" },
    },
  );
  assert.deepEqual(parseCommand(["tags", "attach", "12", "4"]), {
    command: "tags",
    action: "attach",
    todoId: "12",
    tagId: "4",
  });
  assert.deepEqual(parseCommand(["tags", "detach", "12", "4"]), {
    command: "tags",
    action: "detach",
    todoId: "12",
    tagId: "4",
  });
  assert.throws(() => parseCommand(["tags", "delete", "0"]), /positive integer/);

  const calls = [];
  const result = await executeCommand(
    parseCommand(["tags", "attach", "12", "4"]),
    {
      attachTag: async (todoId, tagId) => {
        calls.push([todoId, tagId]);
        return { success: true };
      },
    },
  );
  assert.deepEqual(calls, [["12", "4"]]);
  assert.deepEqual(result, { success: true });
});
