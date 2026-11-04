import type { Page } from 'playwright';
import { DRY_RUN_FROM_BATCH, MAX_PER_BATCH, MAX_PACK_BYTES } from './const';
import { expandFolder, toTaskFolder } from './folder';
import { _logPhase } from './logger';
import { createPostPage, ensureDropzone, publishPost } from './page';
import { packBySize, reportBatch } from './report';
import { collectUploadOrder } from './upload-order';
import { reconcileUpload, uploadPack } from './upload';
import {
	EnumFolderKind,
	EnumPostPhase,
	EnumPublishResult,
	type IFolderInput,
	type IFolderStream,
	type IMessageOptions,
	type IRunSwitches,
	type ITaskFolder,
	type ITaskRangeOptions,
	type IUploadItem,
} from './types';
import { iterateFolderInput } from './source';
import { iterateTaskDirs } from './scan';
import { findAddedFiles, type ITaskProgress } from './progress';
import type { ICompletionRecord } from './record';

/**
 * 完整階段：以生成器 (Generator) 逐項取得來源清單並轉為標準資料夾物件
 *
 * - 指定 `source`（globStream / globAsync / Iterable / Generator / 構建函式）：以其為準
 * - 未指定：以 `basePath` + `range` 掃描
 *
 * 兩分支皆延遲產出 (Lazy Yield)：呼叫端以 `for await` 逐項消費，不建立中間陣列 (Intermediate Array)。
 */
export async function* collectFolders(
	basePath: string,
	range: ITaskRangeOptions,
	options?: IMessageOptions,
	source?: IFolderInput,
): AsyncGenerator<ITaskFolder>
{
	if (source !== undefined)
	{
		yield* iterateFolderInput(source, options);
	}
	else
	{
		for await (const path of iterateTaskDirs(basePath, range, options))
		{
			yield toTaskFolder(path);
		}
	}
}

/**
 * 完整階段（AutoPost）：確認上傳區後依來源串流分批自動發文
 *
 * 為 {@link EnumPostPhase.Upload} 與 {@link EnumPostPhase.Publish} 串起的完整流程：
 * 確認上傳區（失敗時 y/n 提示，中止則不執行後續） → 以 `for await` 逐項執行任務、逐批完整階段：
 *
 * 1. （上傳階段）第一個檔案單獨上傳並等待完成
 * 2. （上傳階段）其餘檔案以 5MB 總和切包陸續上傳，累計至 18 張
 * 3. （上傳階段）`reconcileUpload` 比對數量：符合預期以 success 記錄，
 *    缺漏者（假設為最後幾張）排回佇列進入下一次完整階段，本次以實際數量進入發布階段
 * 4. （發布階段）僅檢查開關，絕不按 save；發布完成（網址跳轉為貼文頁 / 模型頁等落地頁）後
 *    重開建立貼文頁執行下一批次
 *
 * 進度（{@link ITaskProgress}）：已完成的單位於掃描後比對新增檔案——無新增即跳過，有新增僅處理新增者；
 * 僅「確認發布」的批次推進中斷檢查點 (Checkpoint)，中斷後自實際進度續跑（大目錄不重跑整個單位）；
 * 單位全部批次確認發布後標記完成並更新完成邊界（最後處理檔案 + 時間戳）。
 * 出現 dry run 批次、或有批次未執行 / 未確認發布的單位，不標記完成、不寫完成紀錄。
 * agent-scheduler 任務受發布次數上限（{@link IRunSwitches.agsMaxPublish}）截斷時忽略剩餘圖片，
 * 完成邊界僅至實際發布的最後檔案，被忽略者可於日後比對為新增再行執行。
 * 完成任務同時寫入完成紀錄（{@link ICompletionRecord}）：依發布日期分檔保存，含發布網址與完成邊界。
 *
 * 第 {@link DRY_RUN_FROM_BATCH} 批起（批次序號跨任務累計）為 dry run：僅報告批次內容，不上傳、不進入發布階段。
 * 不按 save（草稿）；publish 由 `ENABLE_PUBLISH` 控制，預設停用。
 * 兩者皆可由 {@link IRunSwitches} 於呼叫端解除（CLI 參數）。
 *
 * @param page 已導航至建立貼文頁的頁面（後續重開頁面與其共用同一 context）
 * @param folders 來源串流 (Folder Stream)（由 {@link collectFolders} 逐項產出；同步 / 非同步可迭代皆可）
 * @param options 訊息控制（獨立物件，不併入其他參數）
 * @param progress 任務進度（可選，獨立物件）：記錄完成任務與中斷檢查點，供自實際進度續跑
 * @param switches 執行設定（可選，獨立物件）：解除發布停用與 dry run、指定建立貼文頁網址、任務發布次數上限
 * @param record 完成紀錄（可選，獨立物件）：完成任務依發布日期分檔保存
 */
export async function autoPost(
	page: Page,
	folders: IFolderStream,
	options?: IMessageOptions,
	progress?: ITaskProgress,
	switches?: IRunSwitches,
	record?: ICompletionRecord,
): Promise<void>
{
	/** 發布完成後以同一 context 重開建立貼文頁 */
	const context = page.context();

	/** 目前批次使用的頁面；發布完成後重置 */
	let currentPage = page;

	/** dry run 是否生效：開關解除（`disableDryRun`）時全程實際上傳與發布 */
	const dryRunEnabled = switches?.disableDryRun !== true;

	/** 等待上傳區渲染；失敗時提示手動登入，中止則不執行後續任務 */
	if (!await ensureDropzone(currentPage, options))
	{
		return;
	}

	let batchNo = 0;
	let taskNo = 0;

	/** 來源串流以 `for await` 逐項消費，不建立中間陣列 (Intermediate Array) */
	for await (const folder of folders)
	{
		/** 天目錄展開為任務；其餘模式即為執行單位 */
		for await (const unit of expandFolder(folder, options))
		{
			taskNo++;

			const order = await collectUploadOrder(unit, options);

			if (!order.length)
			{
				_logPhase(EnumPostPhase.AutoPost, options, `task ${taskNo} has no images: ${unit.path}`);
				continue;
			}

			/** 完成紀錄：已完成單位於掃描後比對新增檔案，無新增即跳過 */
			const doneEntry = progress?.done(unit.path);
			const added = doneEntry ? findAddedFiles(order, doneEntry) : undefined;

			if (doneEntry)
			{
				if (!added?.length)
				{
					_logPhase(EnumPostPhase.AutoPost, options, `skipped by progress: no new files (${unit.path})`);
					continue;
				}

				_logPhase(EnumPostPhase.AutoPost, options, `new files after completion: ${added.length} (${unit.path})`);
			}

			/**
			 * 中斷檢查點：接續上次未完成的實際進度——
			 * 佇列取剩餘、批次序號接續、已取得的發布網址併回
			 */
			const checkpointed = progress?.checkpoint(unit.path);

			/** 待上傳佇列：已完成單位只取新增檔案；其餘優先接續檢查點，否則取完整訂單 */
			let queue = added ?? checkpointed?.remaining ?? order;

			const publishedUrls: string[] = [...(checkpointed?.publishedUrls ?? [])];

			/** agent-scheduler 任務的發布次數上限（僅任務模式生效，其他模式不限制） */
			const agsPublishLimit = (unit.kind === EnumFolderKind.DayTask || unit.kind === EnumFolderKind.Task)
				? switches?.agsMaxPublish
				: undefined;

			/** 發布次數 / 是否被上限截斷 / 最後實際發布的檔案（截斷時作為完成邊界） */
			let publishCount = 0;
			let truncated = false;
			let lastPublished: IUploadItem | undefined;

			if (checkpointed)
			{
				batchNo = checkpointed.batchNo;
				publishCount = checkpointed.publishCount ?? 0;

				_logPhase(
					EnumPostPhase.AutoPost,
					options,
					`resumed from checkpoint: batch ${batchNo}, ${queue.length} left (${unit.path})`,
				);
			}

			/** 本單位是否有批次未執行或未確認發布：有即不標記完成 */
			let unpublished = false;

			/** 本單位是否出現 dry run 批次：有即代表未全部實際執行 */
			let hasDryRun = false;

			while (queue.length)
			{
				batchNo++;

				/** 本次完整階段的範圍：最多累計 18 張 */
				const task = queue.slice(0, MAX_PER_BATCH);
				queue = queue.slice(MAX_PER_BATCH);

				const message: IMessageOptions = { ...options, batchNo };

				/** 第 2 批起為 dry run：僅報告批次內容，不上傳、不進入發布階段；可由開關解除 */
				if (dryRunEnabled && batchNo >= DRY_RUN_FROM_BATCH)
				{
					hasDryRun = true;
					_logPhase(EnumPostPhase.Upload, message, `dry run from batch ${DRY_RUN_FROM_BATCH}: report only`);
					reportBatch(batchNo, task.map(item => item.path), 'dry run', options);
					continue;
				}

				/** （上傳階段）第一個檔案必須單獨上傳並等待完成，確認站台接受後才繼續 */
				const [lead, ...rest] = task;

				let setPaths: string[] = [lead.path];
				let actual = await uploadPack(currentPage, [lead.path], 1, message);

				/** （上傳階段）其餘檔案依 5MB 總和切包陸續上傳，累計至 18 張 */
				for (const pack of packBySize(rest, MAX_PACK_BYTES))
				{
					/** 前次數量不符即中止本次上傳階段的後續上傳 */
					if (actual < setPaths.length) break;

					const files = pack.map(item => item.path);
					setPaths = [...setPaths, ...files];
					actual = await uploadPack(currentPage, files, setPaths.length, message);
				}

				/** （上傳階段）比對數量：缺漏者排回佇列；結果與批次報告由該函式輸出 */
				queue = [...reconcileUpload(batchNo, options, task, setPaths, actual), ...queue];

				/** （發布階段）累計滿 18 張後檢查禁用開關（上傳 waiter 結束後），絕不按 save */
				const publishResult = await publishPost(currentPage, message, switches?.enablePublish);

				if (publishResult === EnumPublishResult.Published)
				{
					/**
					 * 發布後的網址須於重置頁面前取得；
					 * 當前頁面已離開建立貼文頁，重開新頁面執行下一批次
					 */
					publishedUrls.push(currentPage.url());
					currentPage = await createPostPage(context, switches?.createUrl);

					publishCount++;

					/**
					 * 實際發布的最後檔案：被忽略（未發布）的圖片留在其後，
					 * 使日後重跑可比對為新增
					 */
					const publishedItems = task.slice(0, actual);

					if (publishedItems.length)
					{
						lastPublished = publishedItems[publishedItems.length - 1];
					}

					/** 達發布次數上限：忽略剩餘圖片，完成邊界僅至實際發布的最後檔案 */
					if (agsPublishLimit !== undefined && publishCount >= agsPublishLimit)
					{
						truncated = true;

						_logPhase(
							EnumPostPhase.Publish,
							message,
							`publish limit ${agsPublishLimit} reached: ${queue.length} left ignored (${unit.path})`,
						);
						break;
					}

					/** 確認發布的批次才推進檢查點：大目錄中斷後自實際進度續跑 */
					await progress?.saveCheckpoint({
						path: unit.path,
						remaining: queue,
						batchNo,
						publishedUrls,
						publishCount,
					});
				}
				else
				{
					/**
					 * 未執行發布（停用）或未確認落地：不推進檢查點、單位不標記完成；
					 * 未確認者中止本單位，避免後續批次的檢查點略過該批次
					 */
					unpublished = true;

					if (publishResult === EnumPublishResult.Unconfirmed)
					{
						break;
					}
				}
			}

			/** 未執行或未確認發布：不標記完成、不寫完成紀錄，留待發布 run 續跑 */
			if (unpublished)
			{
				_logPhase(EnumPostPhase.AutoPost, options, `not marked (publish not completed): ${unit.path}`);
				continue;
			}

			/** dry run 批次未實際執行：不標記完成、不寫完成紀錄，留待實際執行的 run 續跑 */
			if (hasDryRun)
			{
				_logPhase(EnumPostPhase.AutoPost, options, `not marked (dry run): ${unit.path}`);
				continue;
			}

			/**
			 * 完成邊界：截斷時僅至實際發布的最後檔案（被忽略者留在邊界之後）；
			 * 完整完成則為上傳順序末端。供重跑比對新增檔案
			 */
			const last = truncated && lastPublished
				? lastPublished
				: order[order.length - 1];

			/**
			 * 該任務批次全部完成：先寫入進度檔（含完成邊界），
			 * 再寫入完成紀錄（含發布網址與完成邊界，依發布日期分檔）
			 */
			await progress?.mark(unit.path, { lastFile: last.path, lastFileTime: last.mtime });

			await record?.append({
				path: unit.path,
				day: unit.day,
				task: unit.task,
				publishedUrls,
				lastFile: last.path,
				lastFileTime: last.mtime,
			});
		}
	}
}
