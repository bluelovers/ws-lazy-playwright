import { join } from 'upath2';
import { expandFolder, toTaskFolder } from '#/lib/path-kind/folder';
import { collectUploadOrder } from '#/lib/scan-collect/upload-order';
import { EnumFolderKind } from '#/lib/types/types';
import { __TEST_FIXTURES } from './__root';
import { test, TestContext } from 'node:test';

/** 靜音過程訊息：本測試僅驗證收集結果 */
const QUIET = { verbose: false };

/**
 * Folder 模式執行單位（`txt2img-images` 根目錄）：
 * 不展開為子單位，直接收集資料夾內的圖檔（同名 `.txt` 敘述檔排除）
 */
test('collectUploadOrder folder unit', async (t: TestContext) => {
	const folder = toTaskFolder(join(__TEST_FIXTURES, 'txt2img-images'));

	let units = 0;

	for await (const unit of expandFolder(folder, QUIET))
	{
		units++;

		t.assert.equal(unit.kind, EnumFolderKind.Folder);

		const order = await collectUploadOrder(unit, QUIET);

		// t.assert.deepEqual(order.map(item => item.path), [
		// 	join(__TEST_FIXTURES, 'txt2img-images', '02027.png'),
		// 	join(__TEST_FIXTURES, 'txt2img-images', '03050.png'),
		// ]);

		t.assert.partialDeepStrictEqual(order, [
			{
				path: join(__TEST_FIXTURES, 'txt2img-images', '02027.png'),
			},
			{
				path: join(__TEST_FIXTURES, 'txt2img-images', '03050.png'),
			},
		]);

		t.assert.deepStrictEqual(order.length, 2);

		/** 快照收集順序（剔除 mtime：檔案時間戳不保證穩定） */
		t.assert.snapshot(order.map(({ path, size }) => ({ path, size })));
	}

	t.assert.equal(units, 1);
});
