import { join } from 'upath2';
import { iterateTaskDirs } from '#/lib/scan-collect/scan';
import { __TEST_FIXTURES } from './__root';
import { test, TestContext } from 'node:test';

/** 靜音過程訊息：本測試僅驗證產出的執行單位 */
const QUIET = { verbose: false };

/** Folder 模式：未指定起始天時以基準資料夾本身為執行單位（圖檔直接位於其內） */
test('iterateTaskDirs folder base', async (t: TestContext) => {
	const units: string[] = [];

	for await (const path of iterateTaskDirs(join(__TEST_FIXTURES, 'txt2img-images'), {}, QUIET))
	{
		units.push(path);
	}

	t.assert.deepEqual(units, [join(__TEST_FIXTURES, 'txt2img-images')]);

	/** 快照執行單位清單：Folder 模式以基準資料夾本身為單位 */
	t.assert.snapshot(units);
});

/** 單日目錄：起始天即該日並續掃後續天；純圖檔天目錄（無任務子目錄）產出自身 */
test('iterateTaskDirs day base', async (t: TestContext) => {
	const units: string[] = [];

	for await (const path of iterateTaskDirs(join(__TEST_FIXTURES, 'txt2img-images', '2026-11-09'), {}, QUIET))
	{
		units.push(path);
	}

	t.assert.deepEqual(units, [
		join(__TEST_FIXTURES, 'txt2img-images', '2026-11-09'),
		join(__TEST_FIXTURES, 'txt2img-images', '2026-11-10'),
	]);

	/** 快照執行單位清單：起始天本身與後續天 */
	t.assert.snapshot(units);
});

/** 根目錄（非 Folder 模式）未指定起始天：維持拒絕，不產出任何單位 */
test('iterateTaskDirs root base without startDay', async (t: TestContext) => {
	const units: string[] = [];

	for await (const path of iterateTaskDirs(join(__TEST_FIXTURES, 'agent-scheduler'), {}, QUIET))
	{
		units.push(path);
	}

	t.assert.deepEqual(units, []);

	/** 快照執行單位清單：根目錄未指定起始天時不產出單位 */
	t.assert.snapshot(units);
});
