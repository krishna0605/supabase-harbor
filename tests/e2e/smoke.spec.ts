import { expect, test } from "@playwright/test";

test("serves the hosted sign-in shell with enforced security headers", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const response = await page.goto("/login");
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(
    page.getByRole("heading", { name: "Sign in to your Harbor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(consoleErrors).toEqual([]);
});

test("reports database-backed readiness without exposing internals", async ({
  request,
}) => {
  const response = await request.get("/api/healthz");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    data: { ready: boolean; service: string };
  };
  expect(body.data).toEqual({
    ready: true,
    service: "supabase-harbor",
  });
  expect(JSON.stringify(body)).not.toContain("postgresql://");
});
