import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

export async function registerTestUser(page: Page, context: BrowserContext) {
  await page.goto("/login");
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
  await page.getByLabel("Username").fill(`subtasks-${Date.now()}-${Math.floor(Math.random() * 100000)}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible({
    timeout: 15_000,
  });
}

export async function addSubtask(page: Page, card: Locator, title: string, viaEnter = false) {
  await card.getByLabel("Subtask title").fill(title);
  const response = page.waitForResponse((result) =>
    result.url().includes("/subtasks") && result.request().method() === "POST",
  );
  if (viaEnter) await card.getByLabel("Subtask title").press("Enter");
  else await card.getByRole("button", { name: "Add", exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(card.getByRole("checkbox", { name: `Mark subtask "${title}" as complete` })).toBeEnabled();
}

export async function createTodo(page: Page, title: string, fields: Record<string, unknown> = {}) {
  const response = await page.request.post("/api/todos", {
    data: { title, ...fields },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
