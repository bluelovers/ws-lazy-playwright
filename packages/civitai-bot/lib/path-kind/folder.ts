import { readdir } from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'upath2';
import { AGENT_SCHEDULER_DIR_RE, DAY_DIR_RE, TASK_DIR_RE } from '../util/re';
import { _logPhase } from '../logger';
import {
	EnumFolderKind,
	EnumPostPhase,
	type IFolderInputEntry,
	type IFolderInputObject,
	type IMessageOptions,
	type ITaskFolder,
} from '../types/types';

/** 由路徑推導所屬天：自身為天目錄，或為天目錄下的任務 */
export function _deriveDay(name: string, parent: string): string | undefined
{
	if (DAY_DIR_RE.test(name)) return name;
	if (TASK_DIR_RE.test(name) && DAY_DIR_RE.test(parent)) return parent;

	return undefined;
}

/**
 * 完整階段：由路徑推斷資料夾模式
 *
 * 任務特徵優先（`_task(`），其父層為天目錄則為 {@link EnumFolderKind.AgentSchedulerDayTask}；
 * 無法判斷者一律為 {@link EnumFolderKind.Folder}。
 */
export function _detectFolderKind(path: string): EnumFolderKind
{
	const name = basename(path);

	if (AGENT_SCHEDULER_DIR_RE.test(path))
	{
		return EnumFolderKind.AgentScheduler;
	}

	if (TASK_DIR_RE.test(name))
	{
		if (DAY_DIR_RE.test(basename(dirname(path))))
		{
			return EnumFolderKind.AgentSchedulerDayTask;
		}
		return EnumFolderKind.AgentSchedulerTask;
	}

	if (DAY_DIR_RE.test(name))
	{
		if (AGENT_SCHEDULER_DIR_RE.test(dirname(path)))
		{
			return EnumFolderKind.AgentSchedulerDay;
		}
		return EnumFolderKind.Day;
	}

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
	const path = normalize(source.path).replace(/[/\\]+$/, '');
	const name = basename(path);
	const parent = basename(dirname(path));

	const kind = source.kind ?? _detectFolderKind(path);
	const day = source.day ?? _deriveDay(name, parent);
	const task = source.task ?? (TASK_DIR_RE.test(name) ? name : undefined);

	return { path, kind, day, task };
}

export function _folderKindIsNotDayLike(folder: ITaskFolder): folder is Omit<typeof folder, 'kind'> & {
	kind: Exclude<typeof folder['kind'], EnumFolderKind.Day | EnumFolderKind.AgentSchedulerDay>
}
{
	return !_folderKindIsDayLike(folder);
}

export function _folderKindIsDayLike(folder: ITaskFolder): folder is Omit<typeof folder, 'kind'> & {
	kind: EnumFolderKind.Day | EnumFolderKind.AgentSchedulerDay
}
{
	return folder.kind === EnumFolderKind.Day || folder.kind === EnumFolderKind.AgentSchedulerDay;
}

/**
 * 判斷是否為 agent-scheduler 任務模式（{@link EnumFolderKind.AgentSchedulerDayTask} / {@link EnumFolderKind.AgentSchedulerTask}）
 *
 * 天目錄的任務子目錄與發布次數上限等任務專屬邏輯皆以此兩種模式為準
 */
export function _folderKindIsTaskLike(folder: ITaskFolder): folder is Omit<typeof folder, 'kind'> & {
	kind: EnumFolderKind.AgentSchedulerDayTask | EnumFolderKind.AgentSchedulerTask
}
{
	return folder.kind === EnumFolderKind.AgentSchedulerDayTask || folder.kind === EnumFolderKind.AgentSchedulerTask;
}

/**
 * 完整階段：以生成器 (Generator) 逐項展開資料夾為實際執行單位
 *
 * - {@link EnumFolderKind.Day}：含任務子目錄（`_task(`）時逐項產出各任務（{@link EnumFolderKind.AgentSchedulerDayTask}），
 *   否則產出自身（如 `txt2img-images\2026-11-03` 直接含圖檔）
 * - 其餘模式：產出自身
 *
 * 延遲產出 (Lazy Yield)：不建立中間陣列 (Intermediate Array)，呼叫端以 `for await` 逐項消費。
 */
export async function* expandFolder(folder: ITaskFolder, options?: IMessageOptions): AsyncGenerator<ITaskFolder>
{
	if (_folderKindIsNotDayLike(folder))
	{
		yield folder;
		return;
	}

	const tasks = (await readdir(folder.path, { withFileTypes: true }).catch(() => []))
		.filter(entry => entry.isDirectory() && TASK_DIR_RE.test(entry.name))
		.map(entry => entry.name)
		.sort((a, b) => a.localeCompare(b));

	if (!tasks.length)
	{
		yield folder;
		return;
	}

	_logPhase(EnumPostPhase.AutoPost, options, `day expanded: ${tasks.length} tasks from ${folder.path}`);

	for (const name of tasks)
	{
		yield toTaskFolder({
			path: join(folder.path, name),
			kind: EnumFolderKind.AgentSchedulerDayTask,
			day: folder.day,
			task: name,
		});
	}
}
