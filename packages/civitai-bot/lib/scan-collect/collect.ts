import { _logPhase } from '../util/logger';
import { toTaskFolder } from '../path-kind/folder';
import { iterateFolderInput, prependFolder } from '../path-kind/source';
import { type IRunContext, type ITaskFolder, EnumPostPhase } from '../types/types';
import { iterateTaskDirs } from './scan';

/**
 * 完整階段：以生成器 (Generator) 逐項取得來源清單並轉為標準資料夾物件
 *
 * - 指定 `ctx.source`（globStream / globAsync / Iterable / Generator / 構建函式）：以其為準
 * - 未指定：以 `ctx.taskBase` + `ctx.range` 掃描
 *
 * 兩分支皆延遲產出 (Lazy Yield)：呼叫端以 `for await` 逐項消費，不建立中間陣列 (Intermediate Array)。
 *
 * @param ctx 執行期 context（{@link IRunContext}）：需含任務基準路徑 `taskBase`，由呼叫端逐路徑併入
 */
export async function* collectFolders(
	ctx: IRunContext & { taskBase: string; }
): AsyncGenerator<ITaskFolder>
{
	const { taskBase, range, options, source } = ctx;

	if (source !== undefined)
	{
		yield* iterateFolderInput(source, {
			messageOptions: options,
		});
	}

	else
	{
		for await (const path of iterateTaskDirs(taskBase, range, options))
		{
			yield toTaskFolder(path);
		}
	}
}

/**
 * 完整階段：探測來源串流首項，回傳可交給 {@link autoPost} 的完整串流
 *
 * 以 `next()` 探測首項：空串流回傳 `undefined` 並記錄
 * （呼叫端提前中止，不啟動瀏覽器）；有首項則以 {@link prependFolder} 接回，
 * 維持單次 `for await` 延遲產出 (Lazy Yield)，不建立中間陣列。
 *
 * @param folders 來源串流（由 {@link collectFolders} 逐項產出）
 * @param ctx 執行期 context（{@link IRunContext}，僅取訊息控制 `options`）
 */
export async function startFolderStream(
	folders: AsyncGenerator<ITaskFolder>,
	ctx?: IRunContext
): Promise<AsyncGenerator<ITaskFolder> | undefined>
{
	const head = await folders.next();

	if (head.done)
	{
		_logPhase(EnumPostPhase.AutoPost, ctx?.options, 'no folders to run');
		return undefined;
	}

	return prependFolder(head.value, folders);
}
