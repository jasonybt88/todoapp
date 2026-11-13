import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

export interface TagFixture {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

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
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
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

export async function createTag(
  request: APIRequestContext,
  name: string,
  color?: string,
): Promise<TagFixture> {
  const response = await request.post("/api/tags", {
    data: { name, ...(color === undefined ? {} : { color }) },
  });
  if (!response.ok()) {
    throw new Error(`Tag fixture creation failed: ${response.status()}`);
  }
  return (await response.json()) as TagFixture;
}
