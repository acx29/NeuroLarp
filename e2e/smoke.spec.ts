//**
// e2e/smoke.spec.ts
// Unauthenticated smoke: login page renders, auth modal opens, guarded routes redirect
//**
import { test, expect } from "@playwright/test";

test("login page shows the wordmark and tagline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("neurolarp.")).toBeVisible();
  await expect(page.getByText("Become Aphex Twin.")).toBeVisible();
});

test("Login opens the auth modal", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Login", { exact: true }).click();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("guarded routes bounce to the login page", async ({ page }) => {
  await page.goto("/home");
  await page.waitForURL("**/");
  await expect(page.getByText("Become Aphex Twin.")).toBeVisible();
});
