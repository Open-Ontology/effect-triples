import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`home page in ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const root = page.locator("html");
    if (colorScheme === "dark") {
      await expect(root).toHaveClass(/dark/);
    } else {
      await expect(root).not.toHaveClass(/dark/);
    }
    await expect(
      page.getByRole("heading", { level: 1, name: "The database that remembers why." }),
    ).toBeVisible();
    const content = page.locator("#VPContent");
    await expect(content.getByRole("link", { name: /Get started/ })).toHaveAttribute(
      "href",
      "/getting-started",
    );
    await expect(content.getByRole("link", { name: "Modeling guide for agents" })).toHaveAttribute(
      "href",
      "/agents",
    );
    await expect(
      page.getByRole("heading", { name: "Reading this as a coding agent?" }),
    ).toBeVisible();

    // The journal table and every question are rendered from verified scenario outputs.
    const timeline = page.locator(".triplex-home__timeline table");
    await expect(timeline.locator("tbody tr")).toHaveCount(6);
    await expect(timeline).toContainText("placement:create:maria-harbor");
    const examples = page.locator('.triplex-home__snippet div[class*="language-"]');
    await expect(examples).toHaveCount(8);
    for (const example of await examples.all()) {
      await expect(example).toBeVisible();
    }
    await expect(content).toContainText('"knownAtDecision": true');
    await expect(content).toContainText('"governedBy": "hr-2026.1"');
    await expect(page.getByRole("tab")).toHaveCount(0);

    await expect(page).toHaveScreenshot(`home-${colorScheme}.png`, {
      animations: "disabled",
      fullPage: true,
    });
  });
}

test("home examples remain visible on mobile without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const examples = page.locator('.triplex-home__snippet div[class*="language-"]');
  await expect(examples).toHaveCount(8);
  for (const example of await examples.all()) {
    await expect(example).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("agent-readable documentation is served as plain text", async ({ request }) => {
  const index = await request.get("/llms.txt");
  expect(index.ok()).toBe(true);
  const body = await index.text();
  expect(body).toMatch(/^# Triplex\n\n> The database that remembers why/);
  expect(body).toContain("(https://triplex.build/agents.md)");

  const guide = await request.get("/agents.md");
  expect(guide.headers()["content-type"]).toContain("text/markdown");
  const markdown = await guide.text();
  expect(markdown).toMatch(/^# Modeling a back-office domain/);
  // Code imports are resolved into fenced code rather than left as VitePress directives.
  expect(markdown).toContain('commandId: "placement:create:maria-harbor"');
  expect(markdown).not.toContain("<<<");

  const full = await request.get("/llms-full.txt");
  expect(await full.text()).toContain("# Troubleshooting and FAQ");
});
