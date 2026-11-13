import { readdir, stat } from 'node:fs/promises';
import { join } from 'upath2';
import { IMAGE_EXT_RE } from '../util/re';
import { sortNames } from '../util/array';
import { _logPhase } from '../logger';
import { EnumStableDiffusionFolder } from '../types/sd-webui';
import {
	EnumFolderKind,
	EnumPostPhase,
	EnumUploadKind,
	type IMessageOptions,
	type ITaskFolder,
	type IUploadItem,
} from '../types/types';

/** xyz 交叉網格圖前綴：分類與排序共用的單一來源 */
export const XYZ_GRID_PREFIX = 'xyz_grid-';

/** 一般網格圖前綴：分類與排序共用的單一來源 */
export const GRID_PREFIX = 'grid-';

/** 依檔名前綴分類；判定順序需先 {@link XYZ_GRID_PREFIX} 再 {@link GRID_PREFIX} */
export function classify(fileName: string): EnumUploadKind
{
	if (fileName.startsWith(XYZ_GRID_PREFIX)) return EnumUploadKind.XyzGrid;
	if (fileName.startsWith(GRID_PREFIX)) return EnumUploadKind.Grid;
	return EnumUploadKind.Other;
}

function _filterImages(names: readonly string[]): string[]
{
	return names.filter(name => IMAGE_EXT_RE.test(name));
}

/** 上傳順序：`xyz_grid-` → `grid-` → 其他（各組內名稱升序）；前綴判定取自 {@link classify}，分組順序取自 {@link EnumUploadKind} 宣告順序 */
function _orderNames(names: readonly string[]): string[]
{
	const kinds = Object.values(EnumUploadKind);
	const groups = new Map<EnumUploadKind, string[]>(kinds.map(kind => [kind, []]));

	for (const name of names)
	{
		groups.get(classify(name))!.push(name);
	}

	return kinds.flatMap(kind => sortNames(groups.get(kind)!));
}

/** 上傳階段：以 stat 取得各路徑大小，過濾不存在者 */
async function _statItems(paths: readonly string[]): Promise<IUploadItem[]>
{
	const items: IUploadItem[] = [];

	for (const path of paths)
	{
		const info = await stat(path).catch(() => undefined);
		if (info) items.push({ path, size: info.size, mtime: info.mtimeMs });
	}

	return items;
}

/**
 * 上傳階段：收集資料夾內的待上傳圖片，並排定上傳順序
 *
 * 依資料夾模式分流：
 *
 * - 任務（{@link EnumFolderKind.AgentSchedulerDayTask} / {@link EnumFolderKind.AgentSchedulerTask}）：
 *   `txt2img-grids`（`xyz_grid-` → `grid-` → 其他）→ `txt2img-images`
 * - 圖檔資料夾（{@link EnumFolderKind.Day} / {@link EnumFolderKind.Folder}）：
 *   資料夾內直接的圖檔，同以 `xyz_grid-` → `grid-` → 其他` 排序
 *
 * 一併讀取檔案大小；目錄不存在或檔案無法 stat 時該來源視為空。
 */
export async function collectUploadOrder(folder: ITaskFolder, options?: IMessageOptions): Promise<IUploadItem[]>
{
	/** 天（未展開成任務者）與其他資料夾：圖檔直接位於資料夾內；其餘為任務目錄的兩個子來源 */
	const direct = folder.kind === EnumFolderKind.Day || folder.kind === EnumFolderKind.Folder;

	let items: IUploadItem[];
	let source: string;

	if (direct)
	{
		const names = _orderNames(_filterImages(await readdir(folder.path).catch(() => [] as string[])));

		items = await _statItems(names.map(name => join(folder.path, name)));
		source = 'folder';
	}
	else
	{
		const gridsDir = join(folder.path, EnumStableDiffusionFolder.txt2img_grids);
		const imagesDir = join(folder.path, EnumStableDiffusionFolder.txt2img_images);

		const grids = _filterImages(await readdir(gridsDir).catch(() => [] as string[]));
		const images = _filterImages(await readdir(imagesDir).catch(() => [] as string[]));

		/** 排序後第一個即為「第一個 xyz_grid-」，其餘緊隨；已排序故天然滿足先後規則 */
		const paths = _orderNames(grids).map(name => join(gridsDir, name)).concat(
			sortNames(images).map(name => join(imagesDir, name)),
		);

		items = await _statItems(paths);
		source = 'task dir';
	}

	_logPhase(EnumPostPhase.AutoPost, options, `collected: ${items.length} images`, 'info');
	_logPhase(EnumPostPhase.AutoPost, options, `${source} [${folder.kind}]: ${folder.path}`, 'info');

	return items;
}
