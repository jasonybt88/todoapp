export function createTodoClient({
  baseUrl = process.env.TODOAPP_URL ?? "http://localhost:3000",
  sessionToken = process.env.TODOAPP_SESSION_TOKEN,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!sessionToken) {
    throw new Error("Set TODOAPP_SESSION_TOKEN to your auth_session cookie value.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("This Node.js version does not provide fetch.");
  }

  const apiUrl = new URL("/api/todos", baseUrl);

  function todoUrl(id) {
    return new URL(`${apiUrl.pathname}/${encodeURIComponent(id)}`, apiUrl.origin);
  }

  async function request(url, { method = "GET", body } = {}) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        Cookie: `auth_session=${encodeURIComponent(sessionToken)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? `Request failed with status ${response.status}`);
    }
    return result;
  }

  return {
    list() {
      return request(apiUrl);
    },
    get(id) {
      return request(todoUrl(id));
    },
    create(input) {
      return request(apiUrl, { method: "POST", body: input });
    },
    update(id, input) {
      return request(todoUrl(id), {
        method: "PUT",
        body: input,
      });
    },
    delete(id) {
      return request(todoUrl(id), {
        method: "DELETE",
      });
    },
  };
}
