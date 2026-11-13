import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

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

async function register(page: Page, username: string): Promise<void> {
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

test("registers passkeys on two devices, logs in, and preserves the session", async ({
  browser,
  page,
  context,
}) => {
  await page.goto("/login");
  await addVirtualAuthenticator(context, page);
  const username = `registration-${Date.now()}`;

  await register(page, username);
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();

  const secondContext = await createSignedInContext(
    browser,
    context,
    new URL(page.url()).origin,
  );
  try {
    const secondPage = await secondContext.newPage();
    await secondPage.goto("/");
    await addVirtualAuthenticator(secondContext, secondPage);
    await secondPage.getByRole("button", { name: "Add another passkey" }).click();
    await expect(secondPage.getByText("Passkey added")).toBeVisible({
      timeout: 10_000,
    });

    await page.reload();
    await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const sessionResponse = await page.request.get("/api/auth/me");
    expect(sessionResponse.status()).toBe(401);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL("/", { timeout: 10_000 });

    await secondPage.getByRole("button", { name: "Logout" }).click();
    await expect(secondPage).toHaveURL(/\/login$/);
    await secondPage.getByLabel("Username").fill(username);
    await secondPage.getByRole("button", { name: "Login" }).click();
    await expect(secondPage).toHaveURL("/", { timeout: 10_000 });
  } finally {
    await secondContext.close();
  }
});

test("rejects duplicate usernames and unregistered logins", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await addVirtualAuthenticator(context, page);
  const username = `duplicate-${Date.now()}`;

  await register(page, username);
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("Username already taken", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Username").fill(`missing-${Date.now()}`);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(
    page.getByText("No passkey found for that username.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

async function createSignedInContext(
  browser: Browser,
  sourceContext: BrowserContext,
  baseURL: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    timezoneId: "Asia/Singapore",
  });
  await context.addCookies(await sourceContext.cookies());
  return context;
}

test("protects the calendar and redirects authenticated users away from login", async ({
  page,
  context,
}) => {
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/login$/);

  await addVirtualAuthenticator(context, page);
  await register(page, `redirect-${Date.now()}`);
  await page.goto("/login");
  await expect(page).toHaveURL("/");
});
