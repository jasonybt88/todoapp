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
    parseCommand(["create", "Test task", "--priority", "high"]),
    { command: "create", input: { title: "Test task", priority: "high" } },
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
