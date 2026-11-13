import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createTag } from "./helpers";

async function addVirtualAuthenticator(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function register(page: Page, context: BrowserContext): Promise<void> {
  await page.goto("/login");
  await addVirtualAuthenticator(context, page);
  await page.getByLabel("Username").fill(`tags-${Date.now()}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
}

function contrastRatio(foreground: string, background: string): number {
  function luminance(color: string): number {
    const channels = color.match(/\d+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) {
      throw new Error(`Unexpected computed color: ${color}`);
    }
    const [red, green, blue] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("manages, assigns, filters, edits, and deletes tags from the dashboard", async ({
  page,
  context,
}) => {
  await register(page, context);

  await page.getByRole("button", { name: "Manage Tags" }).click();
  const manager = page.getByRole("dialog", { name: "Manage Tags" });
  await manager.getByLabel("Tag name").fill("Work");
  await manager.getByLabel("Tag color hex").fill("#3b82f6");
  await manager.getByRole("button", { name: "Create Tag" }).click();
  await expect(manager.getByText("Work", { exact: true })).toBeVisible();
  await manager.getByLabel("Tag name").fill("Home");
  await manager.getByLabel("Tag color hex").fill("#111111");
  await manager.getByRole("button", { name: "Create Tag" }).click();
  await expect(manager.getByText("Home", { exact: true })).toBeVisible();
  await manager.getByRole("button", { name: "Close" }).click();

  await page.getByLabel("Todo title").fill("Tagged task");
  const createTags = page.getByRole("group", { name: "Todo tags" });
  await createTags.getByRole("button", { name: "Select tag Work" }).click();
  await createTags.getByRole("button", { name: "Select tag Home" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.getByTestId("todo-card").filter({ hasText: "Tagged task" });
  await expect(card.getByRole("button", { name: "Filter by tag Work" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Filter by tag Home" })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const pillColors = await card.locator(".tag-pill").evaluateAll((pills) =>
      pills.map((pill) => {
        const style = getComputedStyle(pill);
        return { foreground: style.color, background: style.backgroundColor };
      }),
    );
    expect(pillColors).toHaveLength(2);
    for (const colors of pillColors) {
      expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByLabel("Todo title").fill("Untagged task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Untagged task", { exact: true })).toBeVisible();

  const tagFilter = page.getByLabel("Filter by tag", { exact: true });
  await tagFilter.selectOption({ label: "Home" });
  await expect(page.getByTestId("todo-card")).toHaveCount(1);
  await expect(page.getByText("Tagged task", { exact: true })).toBeVisible();
  await expect(page.getByText("Untagged task", { exact: true })).toHaveCount(0);
  await tagFilter.selectOption({ label: "All Tags" });

  await card.getByRole("button", { name: "Edit Tagged task" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit todo" });
  await editDialog
    .getByRole("group", { name: "Todo tags" })
    .getByRole("button", { name: "Deselect tag Home" })
    .click();
  await editDialog.getByRole("button", { name: "Update" }).click();
  await expect(editDialog).toBeHidden();
  await expect(card.getByRole("button", { name: "Filter by tag Home" })).toHaveCount(0);

  await page.getByRole("button", { name: "Manage Tags" }).click();
  const workRow = page
    .getByRole("dialog", { name: "Manage Tags" })
    .getByRole("listitem")
    .filter({ hasText: "Work" });
  await workRow.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit tag name").fill("Projects");
  await page.getByLabel("Edit tag color hex").fill("#222222");
  await page.getByRole("dialog", { name: "Manage Tags" })
    .getByRole("button", { name: "Update" })
    .click();
  await expect(card.getByRole("button", { name: "Filter by tag Projects" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Filter by tag Work" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();

  await card.getByRole("button", { name: "Filter by tag Projects" }).click();
  await expect(tagFilter).toHaveValue(/^\d+$/);
  await expect(page.getByTestId("todo-card")).toHaveCount(1);
  await expect(page.getByText("Untagged task", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage Tags" }).click();
  const projectsRow = page
    .getByRole("dialog", { name: "Manage Tags" })
    .getByRole("listitem")
    .filter({ hasText: "Projects" });
  page.once("dialog", (dialog) => dialog.accept());
  await projectsRow.getByRole("button", { name: "Delete" }).click();
  await expect(tagFilter).toHaveValue("all");
  await expect(page.getByTestId("todo-card")).toHaveCount(2);
  await expect(card.getByRole("button", { name: "Filter by tag Projects" })).toHaveCount(0);
});

test("validates and scopes tag APIs, supports idempotent links, and cascades deletes", async ({
  page,
  context,
  browser,
}) => {
  expect((await page.request.get("/api/tags")).status()).toBe(401);
  expect((await page.request.post("/api/tags", { data: { name: "Work" } })).status())
    .toBe(401);
  expect((await page.request.put("/api/tags/1", {
    data: { name: "Work" },
  })).status()).toBe(401);
  expect((await page.request.delete("/api/tags/1")).status()).toBe(401);
  expect((await page.request.post("/api/todos/1/tags", {
    data: { tag_id: 1 },
  })).status()).toBe(401);
  expect((await page.request.delete("/api/todos/1/tags", {
    data: { tag_id: 1 },
  })).status()).toBe(401);

  await register(page, context);
  await page.request.get("/api/tags");
  const tagLatencies: number[] = [];
  const startedAt = performance.now();
  const latencyTag = await page.request.post("/api/tags", {
    data: { name: "Latency" },
  });
  tagLatencies.push(performance.now() - startedAt);
  const latencyTagBody = (await latencyTag.json()) as { id: number };
  const listedAt = performance.now();
  const listedTags = await page.request.get("/api/tags");
  tagLatencies.push(performance.now() - listedAt);
  const updatedAt = performance.now();
  const latencyUpdate = await page.request.put(`/api/tags/${latencyTagBody.id}`, {
    data: { name: "Latency updated" },
  });
  tagLatencies.push(performance.now() - updatedAt);
  const deletedAt = performance.now();
  const latencyDelete = await page.request.delete(`/api/tags/${latencyTagBody.id}`);
  tagLatencies.push(performance.now() - deletedAt);
  expect(latencyTag.status()).toBe(201);
  expect(listedTags.status()).toBe(200);
  expect(latencyUpdate.status()).toBe(200);
  expect(latencyDelete.status()).toBe(200);
  expect(tagLatencies.reduce((sum, duration) => sum + duration, 0) / tagLatencies.length)
    .toBeLessThan(300);

  const blankName = await page.request.post("/api/tags", { data: { name: "  " } });
  const badColor = await page.request.post("/api/tags", {
    data: { name: "Bad color", color: "red" },
  });
  expect(blankName.status()).toBe(400);
  expect(badColor.status()).toBe(400);

  const work = await createTag(page.request, " Work ");
  await createTag(page.request, "Existing");
  expect(work).toMatchObject({ name: "Work", color: "#3B82F6" });
  const duplicate = await page.request.post("/api/tags", {
    data: { name: "Work" },
  });
  expect(duplicate.status()).toBe(409);

  const todoResponse = await page.request.post("/api/todos", {
    data: { title: "Work item", tag_ids: [work.id] },
  });
  expect(todoResponse.status()).toBe(201);
  const todo = (await todoResponse.json()) as { id: number; tags: Array<{ id: number }> };

  const attached = await page.request.post(`/api/todos/${todo.id}/tags`, {
    data: { tag_id: work.id },
  });
  const attachedAgain = await page.request.post(`/api/todos/${todo.id}/tags`, {
    data: { tag_id: work.id },
  });
  expect(attached.status()).toBe(200);
  expect(attachedAgain.status()).toBe(200);
  expect((await attachedAgain.json()).tags).toHaveLength(1);
  expect((await page.request.delete(`/api/todos/${todo.id}/tags`, {
    data: { tag_id: work.id },
  })).status()).toBe(200);
  expect((await page.request.delete(`/api/todos/${todo.id}/tags`, {
    data: { tag_id: work.id },
  })).status()).toBe(200);
  expect((await page.request.post(`/api/todos/${todo.id}/tags`, {
    data: { tag_id: work.id },
  })).status()).toBe(200);

  const secondContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    timezoneId: "Asia/Singapore",
  });
  try {
    const secondPage = await secondContext.newPage();
    await register(secondPage, secondContext);
    const sameName = await createTag(secondPage.request, "Work");
    expect(sameName.name).toBe("Work");
    expect(await secondPage.request.get("/api/tags").then(async (response) =>
      (await response.json()).map((tag: { id: number }) => tag.id),
    )).toEqual([sameName.id]);
    expect((await secondPage.request.put(`/api/tags/${work.id}`, {
      data: { name: "Stolen" },
    })).status()).toBe(404);
    expect((await secondPage.request.delete(`/api/tags/${work.id}`)).status())
      .toBe(404);
    expect((await secondPage.request.post(`/api/todos/${todo.id}/tags`, {
      data: { tag_id: sameName.id },
    })).status()).toBe(404);
    expect((await secondPage.request.delete(`/api/todos/${todo.id}/tags`, {
      data: { tag_id: sameName.id },
    })).status()).toBe(404);
    expect((await secondPage.request.post("/api/todos", {
      data: { title: "Cross-user tag", tag_ids: [work.id] },
    })).status()).toBe(400);
  } finally {
    await secondContext.close();
  }

  const updated = await page.request.put(`/api/tags/${work.id}`, {
    data: { color: "#123456", name: "Projects" },
  });
  expect(updated.status()).toBe(200);
  const duplicateUpdate = await page.request.put(`/api/tags/${work.id}`, {
    data: { name: "Existing" },
  });
  expect(duplicateUpdate.status()).toBe(409);
  const todoAfterUpdate = await page.request.get(`/api/todos/${todo.id}`);
  expect((await todoAfterUpdate.json()).tags).toMatchObject([
    { id: work.id, name: "Projects", color: "#123456" },
  ]);
  expect((await page.request.delete(`/api/tags/${work.id}`)).status()).toBe(200);
  const todoAfterDelete = await page.request.get(`/api/todos/${todo.id}`);
  expect((await todoAfterDelete.json()).tags).toEqual([]);
});
