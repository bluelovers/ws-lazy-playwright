import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'upath2';
import { createCompletionRecord } from '#/lib/record';
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
