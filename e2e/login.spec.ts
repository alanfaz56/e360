import { test, expect } from "@playwright/test";

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

test("un usuario válido entra y llega a /panel", async ({ page }) => {
	if (!email || !password) throw new Error("Faltan TEST_USER_EMAIL / TEST_USER_PASSWORD en .env");

	await page.goto("/login");
	await page.getByLabel("Correo").fill(email);
	await page.getByLabel("Contraseña").fill(password);
	await page.getByRole("button", { name: "Entrar" }).click();

	await expect(page).toHaveURL(/\/panel/);
});
