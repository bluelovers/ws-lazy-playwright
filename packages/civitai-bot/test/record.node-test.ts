import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'upath2';
import { createCompletionRecord, findStartAfterLastPublish } from '#/lib/record';
import { __TEST_TEMP } from './__root';
import { test, TestContext } from 'node:test';

/** 靜音過程訊息：本測試僅驗證比對結果 */
const QUIET = { verbose: false };

/** 目前日期（本地時區，`YYYY-MM-DD`）：與完成紀錄的分檔日期一致 */
function _today(): string
{
	const pad = (n: number): string => String(n).padStart(2, '0');
	const now = new Date();

	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 快照前剔除寫入當下的動態時間戳（`completedAt`），比對不受執行時刻影響 */
function _stripCompletedAt(entries: readonly Record<string, unknown>[]): Record<string, unknown>[]
{
	return entries.map(({ completedAt, ...entry }) => entry);
}

/** 重設固定的測試子目錄：完成紀錄跨執行累積，重設後每次執行皆由空目錄開始 */
async function _resetDir(dir: string): Promise<void>
{
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
}

/** 紀錄檔內為反斜線路徑、查詢為正斜線：累計發布次數仍需命中（反之亦然） */
test('publishedCount normalizes record paths', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免跨執行累積的紀錄影響比對 */
	const dir = join(__TEST_TEMP, 'record-node-test');
	const unit = 'D:/sd-forge/output/x/task';

	await _resetDir(dir);
	await writeFile(join(dir, '2026-11-12.json'), JSON.stringify({
		date: '2026-11-12',
		entries: [{
			path: 'D:\\sd-forge\\output\\x\\task',
			completedAt: '2026-11-12T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/1'],
			publishCount: 2,
		}],
	}));

	const record = createCompletionRecord(dir, QUIET);

	t.assert.equal(await record.publishedCount(unit), 2);

	/** 寫入正斜線後，以反斜線查詢仍命中累加後的次數 */
	await record.append({
		path: unit,
		lastFile: `${unit}/f.png`,
		lastFileTime: 1,
		publishedUrls: [],
		publishCount: 1,
	});

	t.assert.equal(await record.publishedCount('D:\\sd-forge\\output\\x\\task'), 3);

	/** 快照當日寫入的條目（剔除動態 `completedAt`）：路徑以正斜線標準化寫入 */
	const saved = JSON.parse(await readFile(join(dir, `${_today()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };

	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** 每次發布各寫一筆（該筆次數為 1）：各筆合計即為單位的發布總次數 */
test('publishedCount sums per-publish entries', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-sum');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	const record = createCompletionRecord(dir, QUIET);

	for (let i = 0; i < 3; i++)
	{
		await record.append({
			path: unit,
			lastFile: `D:/x/task/f${i}.png`,
			lastFileTime: i,
			publishedUrls: [`https://example.invalid/${i}`],
			publishCount: 1,
		});
	}

	t.assert.equal(await record.publishedCount(unit), 3);

	/** 快照三筆逐次發布的條目（剔除動態 `completedAt`）：各筆次數皆為 1，合計即為總次數 */
	const saved = JSON.parse(await readFile(join(dir, `${_today()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };

	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** 同路徑以 `updateOrAppend` 寫入：既有條目就地更新，不分裂為多筆紀錄 */
test('updateOrAppend keeps one entry per path', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-merge');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	const record = createCompletionRecord(dir, QUIET);

	for (let i = 0; i < 3; i++)
	{
		await record.updateOrAppend({
			path: unit,
			lastFile: `D:/x/task/f${i}.png`,
			lastFileTime: i,
			publishedUrls: [`https://example.invalid/${i}`],
			publishCount: 1,
		});
	}

	t.assert.equal(await record.publishedCount(unit), 3);

	const file = await readdir(dir).then(names => names.find(name => name.endsWith('.json')));
	const saved = JSON.parse(await readFile(join(dir, file!), 'utf8')) as { entries: Record<string, unknown>[] };

	t.assert.equal(saved.entries.length, 1);
	t.assert.equal(saved.entries[0].publishCount, 3);
	t.assert.equal((saved.entries[0].publishedUrls as string[]).length, 3);

	/** 邊界取最後一次發布：重跑由該檔案比對新增 */
	t.assert.equal(saved.entries[0].lastFile, 'D:/x/task/f2.png');

	/** 快照收斂後的單筆條目（剔除動態 `completedAt`）：逐批發布不分裂為多筆 */
	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** 舊版逐批寫入留下的同路徑重複筆：下次 `updateOrAppend` 收斂為一筆，次數不合遺失 */
test('updateOrAppend collapses legacy duplicate entries', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-collapse');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	const record = createCompletionRecord(dir, QUIET);

	for (let i = 0; i < 3; i++)
	{
		await record.append({
			path: unit,
			lastFile: `D:/x/task/f${i}.png`,
			lastFileTime: i,
			publishedUrls: [`https://example.invalid/${i}`],
			publishCount: 1,
		});
	}

	await record.updateOrAppend({
		path: unit,
		lastFile: 'D:/x/task/f3.png',
		lastFileTime: 3,
		publishedUrls: ['https://example.invalid/3'],
		publishCount: 1,
	});

	t.assert.equal(await record.publishedCount(unit), 4);

	const file = await readdir(dir).then(names => names.find(name => name.endsWith('.json')));
	const saved = JSON.parse(await readFile(join(dir, file!), 'utf8')) as { entries: Record<string, unknown>[] };

	t.assert.equal(saved.entries.length, 1);
	t.assert.equal(saved.entries[0].publishCount, 4);
	t.assert.equal((saved.entries[0].publishedUrls as string[]).length, 4);

	/** 快照收斂後的單筆條目（剔除動態 `completedAt`）：三筆重複筆合併、四次發布合計不遺失 */
	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** 起始點只由目前路徑底下的條目推導；完成邊界不受範圍限制，仍全量重建供跨路徑補齊進度 */
test('start point scoped to task base', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免跨執行累積的紀錄影響比對 */
	const dir = join(__TEST_TEMP, 'record-node-test-scope');

	await _resetDir(dir);
	await writeFile(join(dir, '2026-11-12.json'), JSON.stringify({
		date: '2026-11-12',
		entries: [
			{
				path: 'D:/sd-forge/output/agent-scheduler/2026-11-11/15-23-16_task(x)',
				day: '2026-11-11',
				task: '15-23-16_task(x)',
				completedAt: '2026-11-12T00:00:00.000Z',
				publishedUrls: ['https://example.invalid/1'],
				publishCount: 1,
				lastFile: 'D:/sd-forge/output/agent-scheduler/2026-11-11/15-23-16_task(x)/a.png',
				lastFileTime: 1,
			},
			{
				path: 'D:/sd-forge/output/txt2img-images/2026-11-12',
				day: '2026-11-12',
				completedAt: '2026-11-12T00:00:01.000Z',
				publishedUrls: ['https://example.invalid/2'],
				publishCount: 1,
				lastFile: 'D:/sd-forge/output/txt2img-images/2026-11-12/b.png',
				lastFileTime: 2,
			},
		],
	}));

	/** 以 agent-scheduler 為範圍：取該路徑的任務條目推導起始點 */
	const scoped = await findStartAfterLastPublish(dir, 'D:/sd-forge/output/agent-scheduler', QUIET);

	t.assert.equal(scoped?.start?.startDay, '2026-11-11');
	t.assert.equal(scoped?.start?.startTask, '15-23-16_task(x)');

	/** 以 txt2img-images 為範圍：最新條目為天目錄（無 task），不推導起始點，Folder 分支得以執行 */
	const rootScoped = await findStartAfterLastPublish(dir, 'D:/sd-forge/output/txt2img-images', QUIET);

	t.assert.equal(rootScoped?.start, undefined);

	/** 完成邊界不受範圍限制：兩條路徑皆重建，供各路徑 seed 補齊進度 */
	t.assert.equal(scoped?.done.length, 2);

	/** 快照兩種範圍的重建結果：起始點各自限縮，完成邊界皆全量重建 */
	t.assert.snapshot({ scoped, rootScoped });
});
