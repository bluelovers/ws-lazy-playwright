import type { Page } from 'playwright';
import { DRY_RUN_FROM_BATCH, MAX_PER_BATCH, MAX_PACK_BYTES } from './const';
import { expandFolder } from './folder';
import { _logPhase } from './logger';
import { ensureDropzone, publishPost } from './page';
import { packBySize, reportBatch } from './report';
import { collectUploadOrder } from './upload-order';
import { reconcileUpload, uploadPack } from './upload';
import {
	EnumPostPhase,
	type IFolderInput,
	type IMessageOptions,
	type ITaskFolder,
	type ITaskRangeOptions,
} from './types';
import { resolveFolderInput } from './source';
import { collectTaskDirs } from './scan';
import { toTaskFolder } from './folder';

/**
 * 完整階段：取得來源清單並轉為標準資料夾物件
 *
 * - 指定 `source`（globStream / globAsync / Iterable / Generator / 構建函式）：以其為準
 * - 未指定：以 `basePath` + `range` 掃描
 */
export async function collectFolders(
	basePath: string,
	range: ITaskRangeOptions,
	options?: IMessageOptions,
	source?: IFolderInput,
): Promise<ITaskFolder[]>
{
	return source !== undefined
		? await resolveFolderInput(source, options)
		: (await collectTaskDirs(basePath, range, options)).map(path => toTaskFolder(path));
}

/**
 * 完整階段（AutoPost）：確認上傳區後依來源清單分批自動發文
 *
 * 為 {@link EnumPostPhase.Upload} 與 {@link EnumPostPhase.Publish} 串起的完整流程：
 * 確認上傳區（失敗時 y/n 提示，中止則不執行後續） → 以 `for...of` 逐一執行任務、逐批完整階段：
 *
 * 1. （上傳階段）第一個檔案單獨上傳並等待完成
 * 2. （上傳階段）其餘檔案以 5MB 總和切包陸續上傳，累計至 18 張
 * 3. （上傳階段）`reconcileUpload` 比對數量：符合預期以 success 記錄，
 *    缺漏者（假設為最後幾張）排回佇列進入下一次完整階段，本次以實際數量進入發布階段
 * 4. （發布階段）僅檢查開關，絕不按 save
 *
 * 第 {@link DRY_RUN_FROM_BATCH} 批起（批次序號跨任務累計）為 dry run：僅報告批次內容，不上傳、不進入發布階段。
 * 不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
 *
 * @param page 已導航至建立貼文頁的頁面
 * @param folders 來源清單（由 {@link collectFolders} 取得）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 */
export async function autoPost(page: Page, folders: readonly ITaskFolder[], options?: IMessageOptions): Promise<void>
{
	/** 等待上傳區渲染；失敗時提示手動登入，中止則不執行後續任務 */
	if (!await ensureDropzone(page, options))
	{
		return;
	}

	let batchNo = 0;
	let taskNo = 0;

	/** 來源清單一律以 `for...of` 逐一執行，不建立中間陣列 */
	for (const folder of folders)
	{
		/** 天目錄展開為任務；其餘模式即為執行單位 */
		for (const unit of await expandFolder(folder, options))
		{
			taskNo++;

			const order = await collectUploadOrder(unit, options);

			if (!order.length)
			{
				_logPhase(EnumPostPhase.AutoPost, options, `task ${taskNo} has no images: ${unit.path}`);
				continue;
			}

			/** 待上傳佇列：缺漏檔案會被排回佇列前端，進入下一次完整階段（AutoPost） */
			let queue = order;

			while (queue.length)
			{
				batchNo++;

				/** 本次完整階段的範圍：最多累計 18 張 */
				const task = queue.slice(0, MAX_PER_BATCH);
				queue = queue.slice(MAX_PER_BATCH);

				const message: IMessageOptions = { ...options, batchNo };

				/** 第 2 批起為 dry run：僅報告批次內容，不上傳、不進入發布階段 */
				if (batchNo >= DRY_RUN_FROM_BATCH)
				{
					_logPhase(EnumPostPhase.Upload, message, `dry run from batch ${DRY_RUN_FROM_BATCH}: report only`);
					reportBatch(batchNo, task.map(item => item.path), 'dry run', options);
					continue;
				}

				/** （上傳階段）第一個檔案必須單獨上傳並等待完成，確認站台接受後才繼續 */
				const [lead, ...rest] = task;

				let setPaths: string[] = [lead.path];
				let actual = await uploadPack(page, [lead.path], 1, message);

				/** （上傳階段）其餘檔案依 5MB 總和切包陸續上傳，累計至 18 張 */
				for (const pack of packBySize(rest, MAX_PACK_BYTES))
				{
					/** 前次數量不符即中止本次上傳階段的後續上傳 */
					if (actual < setPaths.length) break;

					const files = pack.map(item => item.path);
					setPaths = [...setPaths, ...files];
					actual = await uploadPack(page, files, setPaths.length, message);
				}

				/** （上傳階段）比對數量：缺漏者排回佇列；結果與批次報告由該函式輸出 */
				queue = [...reconcileUpload(batchNo, options, task, setPaths, actual), ...queue];

				/** （發布階段）累計滿 18 張後檢查禁用開關（上傳 waiter 結束後），絕不按 save */
				await publishPost(page, message);
			}
		}
	}
}
