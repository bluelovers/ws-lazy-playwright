import { defineConfig } from '@playwright/test';

export default defineConfig({
	testMatch: /.*\.playwright-spec\.(?:ts)/,
});
