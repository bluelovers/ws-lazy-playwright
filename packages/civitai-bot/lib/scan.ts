import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DAY_DIR_RE } from './const';
import { _logPhase } from './logger';
import { EnumPostPhase, type IMessageOptions, type ITaskRangeOptions } from './types';

/**
 * 完整階段：解析任務範圍，回傳依天與任務排序的任務資料夾路徑
 *
 * 基準路徑：
 *
 * - 單日目錄（basename 為 `YYYY-MM-DD`）：起始天即該日，根目錄為其上層
 * - 根目錄：需以 `range.startDay` 指定起始天，否則記錄後回傳空
 *
 * 過濾順序：`startDay` → `endDay` → `startTask`（僅首個有任務的天）→ `maxTasks` / `maxDays`。
 * `maxDays` 僅計算實際有任務的天。
 */
export async function collectTaskDirs(
	basePath: string,
	range: ITaskRangeOptions,
	options?: IMessageOptions,
): Promise<string[]>
{
	const baseName = basename(basePath);
	const isDayDir = DAY_DIR_RE.test(baseName);
	const root = isDayDir ? dirname(basePath) : basePath;
	const startDay = isDayDir ? baseName : range.startDay;

	if (!startDay)
	{
		_logPhase(EnumPostPhase.AutoPost, options, 'startDay is required when TASK_BASE is a root directory');
		return [];
	}

	const dayDirs = (await readdir(root, { withFileTypes: true }).catch(() => []))
		.filter(entry => entry.isDirectory() && DAY_DIR_RE.test(entry.name))
		.map(entry => entry.name)
		.sort((a, b) => a.localeCompare(b))
		.filter(name => name >= startDay)
		.filter(name => !range.endDay || name <= range.endDay);

	const taskDirs: string[] = [];
	let daysWithTask = 0;
	let startTaskApplied = false;

	for (const day of dayDirs)
	{
		if (range.maxTasks !== undefined && taskDirs.length >= range.maxTasks) break;
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
			if (range.maxTasks !== undefined && taskDirs.length >= range.maxTasks) break;
			taskDirs.push(join(root, day, name));
		}
	}

	_logPhase(
		EnumPostPhase.AutoPost,
		options,
		`range resolved: ${taskDirs.length} tasks, ${daysWithTask} days`
		+ ` (start ${startDay}${range.endDay ? `, end ${range.endDay}` : ''})`,
	);

	return taskDirs;
}
