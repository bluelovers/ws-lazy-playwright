import { _logPhase } from './logger';
import { reportBatch } from './report';
import { EnumPostPhase, type IMessageOptions, type IRunContext, type IUploadItem } from './types/types';
import { debug } from 'node:console';

/**
 * 上傳階段：數量不符時，假設缺少者為已設定檔案中的最後 N 張
 *
 * 回傳應排入下一次完整階段（AutoPost）的檔案路徑。
 */
export function takeMissing(setPaths: readonly string[], actual: number): string[]
{
	return actual >= setPaths.length ? [] : setPaths.slice(actual);
}

/**
 * 上傳階段：比對預期與實際數量，輸出結果並回傳應排回佇列的項目
 *
 * 數量符合預期以 success 記錄；缺漏者（假設為最後幾張）連同未上傳者
 * 排入下一次完整階段，本次以實際數量進入發布階段。
 *
 * @param ctx 執行期 context（{@link IRunContext}）：由上而下傳遞，報告時轉交 {@link reportBatch}
 */
export function reconcileUpload(
	batchNo: number,
	ctx: IRunContext | undefined,
	task: readonly IUploadItem[],
	setPaths: readonly string[],
	actual: number,
): IUploadItem[]
{
	const options = ctx?.options;
	const message: IMessageOptions = { ...options, batchNo };
	const missing = takeMissing(setPaths, actual);

	if (missing.length)
	{
		_logPhase(
			EnumPostPhase.Upload,
			message,
			`expected ${setPaths.length}, actual ${actual}, missing ${missing.length} -> next ${EnumPostPhase.AutoPost}`,
		);

		reportBatch(batchNo, task.slice(0, actual).map(item => item.path), `missing ${missing.length}`, ctx);

		/** 缺漏者假設為最後幾張：以項目本身排回佇列，保留大小資訊供 5MB 切包 */
		return task.slice(actual);
	}

	_logPhase(EnumPostPhase.Upload, message, `upload complete, ${actual} files (as expected)`, 'success');
	reportBatch(batchNo, task.map(item => item.path), 'uploaded', ctx);

	return [];
}
