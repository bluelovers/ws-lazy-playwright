import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DAY_DIR_RE } from './const';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions, type ITaskRangeOptions } from './types';

/**
 * 完整階段：以生成器 (Generator) 逐日解析任務範圍，依序產出任務資料夾路徑
 *
 * 基準路徑：
 *
 * - 單日目錄（basename 為 `YYYY-MM-DD`）：起始天即該日，根目錄為其上層
 * - 根目錄：需以 `range.startDay` 指定起始天，否則記錄後結束
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
	const baseName = basename(basePath);
	const isDayDir = DAY_DIR_RE.test(baseName);
	const root = isDayDir ? dirname(basePath) : basePath;
	const startDay = isDayDir ? baseName : range.startDay;

	if (!startDay)
	{
		_logPhase(EnumPostPhase.AutoPost, options, 'startDay is required when TASK_BASE is a root directory');
		return;
	}

	const dayDirs = (await readdir(root, { withFileTypes: true }).catch(() => []))
		.filter(entry => entry.isDirectory() && DAY_DIR_RE.test(entry.name))
		.map(entry => entry.name)
		.sort((a, b) => a.localeCompare(b))
		.filter(name => name >= startDay)
		.filter(name => !range.endDay || name <= range.endDay);

	let produced = 0;
	let daysWithTask = 0;
	let startTaskApplied = false;

	for (const day of dayDirs)
	{
		if (range.maxTasks !== undefined && produced >= range.maxTasks) break;
		if (range.maxDays !== undefined && daysWithTask >= range.maxDays) break;

		let names = (await readdir(join(root, day), { withFileTypes: true }).catch(() => []))
			.filter(entry => entry.isDirectory())
			.map(entry => entry.name)
			.sort((a, b) => a.localeCompare(b));

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

		if (!names.length) continue;

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
