import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'upath2';
import { createCompletionRecord, findStartAfterLastPublish } from '#/lib/record';
import { __TEST_TEMP } from './__root';
import { test, TestContext } from 'node:test';

/** 靜音過程訊息：本測試僅驗證比對結果 */
const QUIET = { verbose: false };

/** 紀錄檔內為反斜線路徑、查詢為正斜線：累計發布次數仍需命中（反之亦然） */
test('publishedCount normalizes record paths', async (t: TestContext) => {
	const dir = join(__TEST_TEMP, 'record-node-test');
	const unit = 'D:/sd-forge/output/x/task';

	await mkdir(dir, { recursive: true });
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
});

/** 每次發布各寫一筆（該筆次數為 1）：各筆合計即為單位的發布總次數 */
test('publishedCount sums per-publish entries', async (t: TestContext) => {
	/** 獨立子目錄：完成紀錄會跨執行累積，避免與先前執行的結果相加 */
	const dir = join(__TEST_TEMP, 'record-node-test-sum', String(Date.now()));
	const unit = 'D:/x/task';

	await mkdir(dir, { recursive: true });

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
});

/** 起始點只由目前路徑底下的條目推導；完成邊界不受範圍限制，仍全量重建供跨路徑補齊進度 */
test('start point scoped to task base', async (t: TestContext) => {
	const dir = join(__TEST_TEMP, 'record-node-test-scope');

	await mkdir(dir, { recursive: true });
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
});
