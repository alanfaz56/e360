import { defineConfig } from "@playwright/test";

// ponytail: local-only e2e smoke test, no CI wiring yet — add webServer/projects when there's
// more than one test.
export default defineConfig({
	testDir: "e2e",
	timeout: 30_000,
	use: {
		baseURL: process.env.TEST_BASE_URL ?? "http://localhost:5173",
	},
});
