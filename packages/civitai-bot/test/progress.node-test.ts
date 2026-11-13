import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'upath2';
import { findAddedFiles, loadTaskProgress } from '#/lib/progress';
import { __TEST_TEMP } from './__root';
import { test, TestContext } from 'node:test';

/** 靜音過程訊息：本測試僅驗證比對結果 */
const QUIET = { verbose: false };

/** 紀錄檔內為反斜線路徑、查詢為正斜線：仍需相符（進度不因分隔符差異而重置） */
test('loadTaskProgress normalizes record paths', async (t: TestContext) => {
	const file = join(__TEST_TEMP, 'progress-node-test', 'progress.json');
	const unit = 'D:/sd-forge/output/txt2img-images/2026-11-09';

	await mkdir(join(__TEST_TEMP, 'progress-node-test'), { recursive: true });
	await writeFile(file, JSON.stringify({
		version: 2,
		basePath: 'D:\\sd-forge\\output\\txt2img-images',
		done: [{
			path: 'D:\\sd-forge\\output\\txt2img-images\\2026-11-09',
			lastFile: 'D:\\sd-forge\\output\\txt2img-images\\2026-11-09\\02027.png',
			lastFileTime: 1,
		}],
		checkpoint: {
			path: 'D:\\sd-forge\\output\\txt2img-images\\2026-11-10',
			remaining: [],
			batchNo: 3,
			publishedUrls: [],
		},
		updatedAt: new Date().toISOString(),
	}));

	const progress = await loadTaskProgress(file, 'D:/sd-forge/output/txt2img-images', QUIET);

	t.assert.equal(progress.size, 1);
	t.assert.ok(progress.done(unit));
	t.assert.ok(progress.checkpoint('D:/sd-forge/output/txt2img-images/2026-11-10'));

	/** 快照載入後的進度狀態：路徑標準化為正斜線、檢查點保留 */
	t.assert.snapshot({
		size: progress.size,
		hasCheckpoint: progress.hasCheckpoint,
		done: progress.done(unit),
		checkpoint: progress.checkpoint('D:/sd-forge/output/txt2img-images/2026-11-10'),
	});
});

/** 完成邊界為反斜線：仍定位其後的新增檔案，而非退回時間戳比對 */
test('findAddedFiles matches boundary across separators', (t: TestContext) => {
	const order = [
		{ path: 'D:/x/a.png', size: 1, mtime: 100 },
		{ path: 'D:/x/b.png', size: 1, mtime: 50 },
	];

	const added = findAddedFiles(order, {
		path: 'D:\\x',
		lastFile: 'D:\\x\\a.png',
		lastFileTime: 100,
	});

	t.assert.deepEqual(added.map(item => item.path), ['D:/x/b.png']);

	/** 快照比對結果（完整項目）：走邊界定位，未退回時間戳比對 */
	t.assert.snapshot(added);
});

/** 完成紀錄補入的反斜線路徑：以正斜線查詢命中 */
test('seed normalizes entry paths', async (t: TestContext) => {
	const file = join(__TEST_TEMP, 'progress-node-test', 'seed.json');
	const progress = await loadTaskProgress(file, 'D:/base', QUIET);

	await progress.seed([{
		path: 'D:\\base\\unit',
		lastFile: 'D:\\base\\unit\\f.png',
		lastFileTime: 1,
	}]);

	t.assert.ok(progress.done('D:/base/unit'));

	/** 快照補入後的完成記錄：反斜線輸入標準化為正斜線 */
	t.assert.snapshot(progress.done('D:/base/unit'));
});

/** 檢查點須持久化完成邊界：續跑時本次未再發布成功，仍能取得邊界而不誤判整批完成 */
test('checkpoint keeps lastPublished boundary', async (t: TestContext) => {
	const dir = join(__TEST_TEMP, 'progress-node-test');
	const file = join(dir, 'boundary.json');
	const unit = 'D:/x/unit';

	await mkdir(dir, { recursive: true });

	const first = await loadTaskProgress(file, 'D:/x', QUIET);

	await first.saveCheckpoint({
		path: unit,
		remaining: [],
		batchNo: 2,
		publishedUrls: ['https://example.invalid/1'],
		publishCount: 1,
		lastPublished: { path: 'D:/x/a.png', size: 1, mtime: 100 },
	});

	const second = await loadTaskProgress(file, 'D:/x', QUIET);
	const checkpoint = second.checkpoint(unit);

	t.assert.equal(checkpoint?.publishCount, 1);
	t.assert.equal(checkpoint?.lastPublished?.path, 'D:/x/a.png');

	/** 快照重載後的檢查點：完成邊界已持久化 */
	t.assert.snapshot(checkpoint);
});
