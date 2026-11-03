import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { IMAGE_EXT_RE } from './const';
import { _logPhase } from './logger';
import {
	EnumFolderKind,
	EnumPostPhase,
	EnumUploadKind,
	type IMessageOptions,
	type ITaskFolder,
	type IUploadItem,
} from './types';

/** 依檔名前綴分類；判定順序需先 xyz_grid- 再 grid- */
export function classify(fileName: string): EnumUploadKind
{
	if (fileName.startsWith('xyz_grid-')) return EnumUploadKind.XyzGrid;
	if (fileName.startsWith('grid-')) return EnumUploadKind.Grid;
	return EnumUploadKind.Other;
}

function _sortNames(names: readonly string[]): string[]
{
	return [...names].sort((a, b) => a.localeCompare(b));
}

function _filterImages(names: readonly string[]): string[]
{
	return names.filter(name => IMAGE_EXT_RE.test(name));
}

/** 上傳順序：`xyz_grid-` → `grid-` → 其他（各組內名稱升序） */
function _orderNames(names: readonly string[]): string[]
{
	const xyz = _sortNames(names.filter(name => name.startsWith('xyz_grid-')));
	const grid = _sortNames(names.filter(name => name.startsWith('grid-')));
	const other = _sortNames(names.filter(name => !name.startsWith('xyz_grid-') && !name.startsWith('grid-')));

	return [...xyz, ...grid, ...other];
}

/** 上傳階段：以 stat 取得各路徑大小，過濾不存在者 */
async function _statItems(paths: readonly string[]): Promise<IUploadItem[]>
{
	const items: IUploadItem[] = [];

	for (const path of paths)
	{
		const info = await stat(path).catch(() => undefined);
		if (info) items.push({ path, size: info.size });
	}

	return items;
}

/**
 * 上傳階段：收集資料夾內的待上傳圖片，並排定上傳順序
 *
 * 依資料夾模式分流：
 *
 * - 任務（{@link EnumFolderKind.DayTask} / {@link EnumFolderKind.Task}）：
 *   `txt2img-grids`（`xyz_grid-` → `grid-` → 其他）→ `txt2img-images`
 * - 圖檔資料夾（{@link EnumFolderKind.Day} / {@link EnumFolderKind.Folder}）：
 *   資料夾內直接的圖檔，同以 `xyz_grid-` → `grid-` → 其他` 排序
 *
 * 一併讀取檔案大小；目錄不存在或檔案無法 stat 時該來源視為空。
 */
export async function collectUploadOrder(folder: ITaskFolder, options?: IMessageOptions): Promise<IUploadItem[]>
{
	/** 天（未展開成任務者）與其他資料夾：圖檔直接位於資料夾內 */
	if (folder.kind === EnumFolderKind.Day || folder.kind === EnumFolderKind.Folder)
	{
		const names = _orderNames(_filterImages(await readdir(folder.path).catch(() => [] as string[])));
		const items = await _statItems(names.map(name => join(folder.path, name)));

		_logPhase(EnumPostPhase.AutoPost, options, `collected: ${items.length} images`);
		_logPhase(EnumPostPhase.AutoPost, options, `folder [${folder.kind}]: ${folder.path}`);

		return items;
	}

	const gridsDir = join(folder.path, 'txt2img-grids');
	const imagesDir = join(folder.path, 'txt2img-images');

	const grids = _filterImages(await readdir(gridsDir).catch(() => [] as string[]));
	const images = _filterImages(await readdir(imagesDir).catch(() => [] as string[]));

	/** 排序後第一個即為「第一個 xyz_grid-」，其餘緊隨；已排序故天然滿足先後規則 */
	const paths = _orderNames(grids).map(name => join(gridsDir, name)).concat(
		_sortNames(images).map(name => join(imagesDir, name)),
	);

	const items = await _statItems(paths);

	_logPhase(EnumPostPhase.AutoPost, options, `collected: ${items.length} images`);
	_logPhase(EnumPostPhase.AutoPost, options, `task dir [${folder.kind}]: ${folder.path}`);

	return items;
}
