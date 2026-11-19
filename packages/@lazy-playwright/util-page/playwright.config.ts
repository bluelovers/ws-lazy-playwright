import { defineConfig } from '@playwright/test';

export default defineConfig({
	/**
	 * 測試檔匹配正則：
	 * Playwright 預設 `testMatch` 只收集以點分隔的 `.(spec|test).` 形式（如 `foo.spec.ts`），
	 * `foo.playwright-spec.ts` 這類非預設命名不會被納入——
	 * 須先於此設定 `testMatch`，
	 * `playwright test <filter>`（如 `playwright test playwright-spec.ts`）
	 * 才能找到並執行對應測試檔；位置參數僅篩選已被 `testMatch` 收集的檔案
	 */
	testMatch: /.*\.playwright(?:-|\.)(?:spec|test)\.(?:ts)/,
});
