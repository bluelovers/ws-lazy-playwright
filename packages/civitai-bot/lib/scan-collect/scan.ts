import { readdir } from 'node:fs/promises';
import { dirname, join } from 'upath2';
import { _folderKindIsDayLike, _folderKindIsTaskLike, toTaskFolder } from '../path-kind/folder';
import { _logPhase } from '../util/logger';
import { EnumFolderKind, EnumPostPhase, type IMessageOptions, type ITaskRangeOptions } from '../types/types';
import { fsExists } from '../util/fs';
import { sortNames } from '../util/array';

/**
 * 完整階段：以生成器 (Generator) 逐日解析任務範圍，依序產出任務資料夾路徑
 *
 * 基準路徑：
 *
 * - 單日目錄（basename 為 `YYYY-MM-DD`）：起始天即該日，根目錄為其上層
 * - 根目錄：需以 `range.startDay` 指定起始天，否則記錄後結束
 * - 資料夾模式（{@link EnumFolderKind.Folder}，如 `txt2img-images` 根目錄）：未指定起始天時
 *   以該資料夾本身為執行單位（只取直接位於其內的圖檔），指定起始天時仍掃描其天目錄
 *
 * 天目錄的產出：
 *
 * - 含任務子目錄（`_task(`）→ 各任務為執行單位
 * - 無任務子目錄但含檔案（如 `txt2img-images\YYYY-MM-DD` 直接含圖檔）→ 天目錄本身為執行單位
 *
 * 過濾順序：`startDay` → `endDay` → `startTask`（僅首個有任務的天）→ `maxTasks` / `maxDays`。
 * `maxDays` 僅計算實際有任務的天。
 *
 * 延遲遍歷 (Lazy Traversal)：天目錄逐日 `readdir`，命中 `maxTasks` / `maxDays` 即停止讀取後續天；
 * 不建立中間陣列 (Intermediate Array)，呼叫端以 `for await` 逐項消費。
 */
export async function* iterateTaskDirs(
	basePath: string,
	range: ITaskRangeOptions,
	options?: IMessageOptions,
): AsyncGenerator<string>
{
	const base = toTaskFolder(basePath);
	const isDayDir = _folderKindIsDayLike(base);
	const root = isDayDir ? dirname(basePath) : basePath;
	const startDay = isDayDir ? base.day : range.startDay;

	if (!(await fsExists(base.path)))
	{
		_logPhase(EnumPostPhase.AutoPost, options, `target directory does not exist: ${base.path}`);
		return;
	}

	if (!startDay)
	{
		/** Folder 模式：無天範圍可掃描，基準資料夾本身即執行單位（圖檔直接位於其內） */
		if (base.kind === EnumFolderKind.Folder)
		{
			_logPhase(EnumPostPhase.AutoPost, options, `folder base used as upload unit (no startDay): ${base.path}`);
			yield base.path;
			return;
		}

		_logPhase(EnumPostPhase.AutoPost, options, 'startDay is required when TASK_BASE is a root directory');
		return;
	}

	const dayDirs = sortNames(
		(await readdir(root, { withFileTypes: true }).catch(() => []))
			.filter(entry => entry.isDirectory() && _folderKindIsDayLike(toTaskFolder(join(root, entry.name))))
			.map(entry => entry.name),
	)
		.filter(name => name >= startDay)
		.filter(name => !range.endDay || name <= range.endDay);

	let produced = 0;
	let daysWithTask = 0;
	let startTaskApplied = false;

	for (const day of dayDirs)
	{
		if (range.maxTasks !== undefined && produced >= range.maxTasks) break;
		if (range.maxDays !== undefined && daysWithTask >= range.maxDays) break;

		const items = await readdir(join(root, day), { withFileTypes: true }).catch(() => []);

		let names = sortNames(
			items
				.filter(entry => entry.isDirectory() && _folderKindIsTaskLike(toTaskFolder(join(root, day, entry.name))))
				.map(entry => entry.name),
		);

		/** `startTask` 僅套用於首個天；找不到時保留該天全部任務並記錄 */
		if (!startTaskApplied && range.startTask)
		{
			startTaskApplied = true;

			const index = names.indexOf(range.startTask);

			if (index >= 0)
			{
				names = names.slice(index);
			}
			else
			{
				_logPhase(EnumPostPhase.AutoPost, options, `start task not found in ${day}: ${range.startTask} (keep all tasks of the day)`);
			}
		}

		if (!names.length)
		{
			/**
			 * 純圖檔天目錄（僅含檔案、無子目錄）：天目錄本身即執行單位，
			 * 使 `txt2img-images\YYYY-MM-DD` 這類路徑可掃描並納入進度接續
			 */
			if (items.some(entry => entry.isFile()))
			{
				daysWithTask++;
				produced++;
				yield join(root, day);
			}

			continue;
		}

		daysWithTask++;

		for (const name of names)
		{
			if (range.maxTasks !== undefined && produced >= range.maxTasks) break;

			produced++;
			yield join(root, day, name);
		}
	}

	_logPhase(
		EnumPostPhase.AutoPost,
		options,
		`range resolved: ${produced} tasks, ${daysWithTask} days`
		+ ` (start ${startDay}${range.endDay ? `, end ${range.endDay}` : ''})`,
		['yellow', 'success']
	);
}

/**
 * 完整階段：物化 {@link iterateTaskDirs} 為依天與任務排序的任務資料夾路徑清單
 *
 * 需要清單長度或陣列 API 的呼叫端使用；一般流程以 `for await` 直接消費 {@link iterateTaskDirs}。
 */
export async function collectTaskDirs(
	basePath: string,
	range: ITaskRangeOptions,
	options?: IMessageOptions,
): Promise<string[]>
{
	const paths: string[] = [];

	for await (const path of iterateTaskDirs(basePath, range, options))
	{
		paths.push(path);
	}

	return paths;
}
