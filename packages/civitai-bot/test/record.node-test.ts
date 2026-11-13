import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'upath2';
import { createCompletionRecord, findStartAfterLastPublish } from '#/lib/record';
import { __TEST_TEMP } from './__root';
import { test, TestContext } from 'node:test';

/** 靜音過程訊息：本測試僅驗證比對結果 */
const QUIET = { verbose: false };

/** 指定偏移的日（本地時區，`YYYY-MM-DD`，0 為今天）：與完成紀錄的分檔日期一致；跨日測試以相對日期建立舊紀錄，不隨執行日期失效 */
function _day(offset = 0): string
{
	const now = new Date();

	now.setDate(now.getDate() - offset);

	const pad = (n: number): string => String(n).padStart(2, '0');

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
	const saved = JSON.parse(await readFile(join(dir, `${_day()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };

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
	const saved = JSON.parse(await readFile(join(dir, `${_day()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };

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

/** 跨日寫入：新日期條目以 `history*` 欄位繼承前一日的網址與次數；同日續寫只累加自身欄位、繼承維持 */
test('cross-day history inherited on new day entry', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-history');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	/** 前一日的既有紀錄：網址 1 筆、次數 2 */
	await writeFile(join(dir, `${_day(1)}.json`), JSON.stringify({
		date: _day(1),
		entries: [{
			path: unit,
			completedAt: '2026-01-01T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/1'],
			publishCount: 2,
		}],
	}));

	const record = createCompletionRecord(dir, QUIET);

	/** 首次寫入今日：繼承前一日累計 */
	await record.updateOrAppend({
		path: unit,
		lastFile: `${unit}/f1.png`,
		lastFileTime: 1,
		publishedUrls: ['https://example.invalid/2'],
		publishCount: 1,
	});

	/** 同日再次寫入：自身欄位累加，繼承欄位維持不變 */
	await record.updateOrAppend({
		path: unit,
		lastFile: `${unit}/f2.png`,
		lastFileTime: 2,
		publishedUrls: ['https://example.invalid/3'],
		publishCount: 1,
	});

	/** 累計次數只計各日自身：前日 2 + 今日 2，繼承欄位不重複計入 */
	t.assert.equal(await record.publishedCount(unit), 4);

	const saved = JSON.parse(await readFile(join(dir, `${_day()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };

	t.assert.equal(saved.entries.length, 1);
	t.assert.equal(saved.entries[0].publishCount, 2);
	t.assert.equal(saved.entries[0].historyPublishCount, 2);
	t.assert.deepEqual(saved.entries[0].historyPublishedUrls, ['https://example.invalid/1']);
	t.assert.deepEqual(saved.entries[0].publishedUrls, [
		'https://example.invalid/2',
		'https://example.invalid/3',
	]);

	/** 快照今日條目（剔除動態 `completedAt`）：自身欄位與繼承欄位並存 */
	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** 再次跨日：新條目的 history 為「前一日自身 + 前一日 history」合併後的結果 */
test('cross-day history merges prior history', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-history-merge');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	/** 兩日前：自身發布 1 筆（無可繼承，故無 history 欄位） */
	await writeFile(join(dir, `${_day(2)}.json`), JSON.stringify({
		date: _day(2),
		entries: [{
			path: unit,
			completedAt: '2026-01-01T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/1'],
			publishCount: 1,
		}],
	}));

	/** 前一日：自身發布 1 筆，且已帶有繼承自兩日前的 history */
	await writeFile(join(dir, `${_day(1)}.json`), JSON.stringify({
		date: _day(1),
		entries: [{
			path: unit,
			completedAt: '2026-01-02T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/2'],
			publishCount: 1,
			historyPublishedUrls: ['https://example.invalid/1'],
			historyPublishCount: 1,
		}],
	}));

	const record = createCompletionRecord(dir, QUIET);

	await record.updateOrAppend({
		path: unit,
		lastFile: `${unit}/f3.png`,
		lastFileTime: 3,
		publishedUrls: ['https://example.invalid/3'],
		publishCount: 1,
	});

	const saved = JSON.parse(await readFile(join(dir, `${_day()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };
	const entry = saved.entries[0];

	/** 合併結果 = 前一日自身（1）+ 前一日 history（1）：次數 2、網址兩筆皆保留 */
	t.assert.equal(entry.historyPublishCount, 2);
	t.assert.deepEqual(entry.historyPublishedUrls, [
		'https://example.invalid/1',
		'https://example.invalid/2',
	]);

	/** 累計次數不因繼承而重複：三日自身各 1 */
	t.assert.equal(await record.publishedCount(unit), 3);

	/** 快照今日條目（剔除動態 `completedAt`） */
	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** append 跨日寫入：同樣由前一日紀錄繼承累計發布 */
test('append inherits cross-day history', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-history-append');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	/** 前一日的既有紀錄：網址 1 筆、次數 1 */
	await writeFile(join(dir, `${_day(1)}.json`), JSON.stringify({
		date: _day(1),
		entries: [{
			path: unit,
			completedAt: '2026-01-01T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/1'],
			publishCount: 1,
		}],
	}));

	const record = createCompletionRecord(dir, QUIET);

	await record.append({
		path: unit,
		lastFile: `${unit}/f1.png`,
		lastFileTime: 1,
		publishedUrls: ['https://example.invalid/2'],
		publishCount: 1,
	});

	const saved = JSON.parse(await readFile(join(dir, `${_day()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };

	t.assert.equal(saved.entries[0].publishCount, 1);
	t.assert.equal(saved.entries[0].historyPublishCount, 1);
	t.assert.deepEqual(saved.entries[0].historyPublishedUrls, ['https://example.invalid/1']);

	/** 累計次數只計各日自身 */
	t.assert.equal(await record.publishedCount(unit), 2);

	/** 快照今日條目（剔除動態 `completedAt`） */
	t.assert.snapshot(_stripCompletedAt(saved.entries));
});

/** 鏈式承接：只接最新一筆含該路徑的舊檔（自身 + 其 history），不回頭累加更舊檔案 */
test('cross-day history chains from latest old entry', async (t: TestContext) => {
	/** 固定子目錄：執行前重設，避免完成紀錄跨執行累積 */
	const dir = join(__TEST_TEMP, 'record-node-test-history-chain');

	await _resetDir(dir);
	const unit = 'D:/x/task';

	/** 兩日前：自身發布 3 筆（舊版紀錄，無 history 欄位） */
	await writeFile(join(dir, `${_day(2)}.json`), JSON.stringify({
		date: _day(2),
		entries: [{
			path: unit,
			completedAt: '2026-01-01T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/1'],
			publishCount: 3,
		}],
	}));

	/** 前一日：最新一筆舊紀錄（亦無 history 欄位）：只承接此筆 */
	await writeFile(join(dir, `${_day(1)}.json`), JSON.stringify({
		date: _day(1),
		entries: [{
			path: unit,
			completedAt: '2026-01-02T00:00:00.000Z',
			publishedUrls: ['https://example.invalid/2'],
			publishCount: 1,
		}],
	}));

	const record = createCompletionRecord(dir, QUIET);

	await record.updateOrAppend({
		path: unit,
		lastFile: `${unit}/f1.png`,
		lastFileTime: 1,
		publishedUrls: ['https://example.invalid/3'],
		publishCount: 1,
	});

	const saved = JSON.parse(await readFile(join(dir, `${_day()}.json`), 'utf8')) as { entries: Record<string, unknown>[] };
	const entry = saved.entries[0];

	/** 鏈式只接前一筆：history = 前一日自身（1），不回頭累加兩日前 */
	t.assert.equal(entry.historyPublishCount, 1);
	t.assert.deepEqual(entry.historyPublishedUrls, ['https://example.invalid/2']);

	/** 累計次數仍全量合計：兩日前 3 + 前日 1 + 今日 1 */
	t.assert.equal(await record.publishedCount(unit), 5);

	/** 快照今日條目（剔除動態 `completedAt`） */
	t.assert.snapshot(_stripCompletedAt(saved.entries));
});
