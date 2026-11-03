import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DAY_DIR_RE, TASK_DIR_RE } from './const';
import { _logPhase } from './logger';
import {
	EnumFolderKind,
	EnumPostPhase,
	type IFolderInputEntry,
	type IFolderInputObject,
	type IMessageOptions,
	type ITaskFolder,
} from './types';

/** 由路徑推導所屬天：自身為天目錄，或為天目錄下的任務 */
function _deriveDay(name: string, parent: string): string | undefined
{
	if (DAY_DIR_RE.test(name)) return name;
	if (TASK_DIR_RE.test(name) && DAY_DIR_RE.test(parent)) return parent;

	return undefined;
}

/**
 * 完整階段：由路徑推斷資料夾模式
 *
 * 任務特徵優先（`_task(`），其父層為天目錄則為 {@link EnumFolderKind.DayTask}；
 * 無法判斷者一律為 {@link EnumFolderKind.Folder}。
 */
function _detectFolderKind(path: string): EnumFolderKind
{
	const name = basename(path);

	if (TASK_DIR_RE.test(name))
	{
		return DAY_DIR_RE.test(basename(dirname(path))) ? EnumFolderKind.DayTask : EnumFolderKind.Task;
	}

	if (DAY_DIR_RE.test(name)) return EnumFolderKind.Day;

	return EnumFolderKind.Folder;
}

/**
 * 完整階段：將 `string | 物件` 轉換為執行端標準資料夾物件
 *
 * - `kind`：未指明時由路徑推斷（{@link _detectFolderKind}）；無法判斷者一律為 Folder
 * - `day` / `task`：未指明時由路徑補齊，供後續構建與報告使用（減少二次查詢）
 * - 路徑尾斜線（glob `markDirectories`）先去除再取名稱
 */
export function toTaskFolder(entry: IFolderInputEntry): ITaskFolder
{
	const source: IFolderInputObject = typeof entry === 'string' ? { path: entry } : entry;
	const path = source.path.replace(/[/\\]+$/, '');
	const name = basename(path);
	const parent = basename(dirname(path));

	const kind = source.kind ?? _detectFolderKind(path);
	const day = source.day ?? _deriveDay(name, parent);
	const task = source.task ?? (TASK_DIR_RE.test(name) ? name : undefined);

	return { path, kind, day, task };
}

/**
 * 完整階段：展開資料夾為實際執行單位
 *
 * - {@link EnumFolderKind.Day}：含任務子目錄（`_task(`）時展開為各任務（{@link EnumFolderKind.DayTask}），
 *   否則維持自身（如 `txt2img-images\2026-11-03` 直接含圖檔）
 * - 其餘模式：維持自身
 */
export async function expandFolder(folder: ITaskFolder, options?: IMessageOptions): Promise<ITaskFolder[]>
{
	if (folder.kind !== EnumFolderKind.Day) return [folder];

	const tasks = (await readdir(folder.path, { withFileTypes: true }).catch(() => []))
		.filter(entry => entry.isDirectory() && TASK_DIR_RE.test(entry.name))
		.map(entry => entry.name)
		.sort((a, b) => a.localeCompare(b));

	if (!tasks.length) return [folder];

	_logPhase(EnumPostPhase.AutoPost, options, `day expanded: ${tasks.length} tasks from ${folder.path}`);

	return tasks.map(name => toTaskFolder({
		path: join(folder.path, name),
		kind: EnumFolderKind.DayTask,
		day: folder.day,
		task: name,
	}));
}
