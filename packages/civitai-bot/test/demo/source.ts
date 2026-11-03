/// <reference types="node" />

import { console } from 'debug-color2';
// @ts-ignore
import { EnumLogLabel, consoleLogger } from '#/lib/logger';
// @ts-ignore
import { resolveFolderInput } from '#/lib/source';
// @ts-ignore
import { expandFolder } from '#/lib/folder';
// @ts-ignore
import type { IFolderInput } from '#/lib/types';

/** agent-scheduler 單日目錄（示範用） */
const DAY_BASE = 'D:\\sd-forge\\output\\agent-scheduler\\2026-09-13';

/**
 * 示範：來源輸入的各種模式（不啟動瀏覽器，僅解析與展開）
 *
 * 支援：單一字串、`Iterable<string|object>`、同步 Generator、
 * `globStream`（AsyncIterable）、`globAsync`（Promise）、構建函式。
 */
async function resolveDemo()
{
	/** 單一字串 */
	const fromString = await resolveFolderInput(`${DAY_BASE}\\14-41-51_task(7gysqd604e7jv3m)`);

	/** `Iterable<object>`：至少含 `path`，可選 `kind` / `day` / `task` */
	const fromIterable = await resolveFolderInput([
		{ path: `${DAY_BASE}\\14-41-51_task(7gysqd604e7jv3m)` },
		{ path: DAY_BASE },
	]);

	/** 同步 Generator */
	function* taskPaths()
	{
		yield `${DAY_BASE}\\14-41-51_task(7gysqd604e7jv3m)`;
		yield DAY_BASE;
	}
	const fromGenerator = await resolveFolderInput(taskPaths());

	/** 構建函式 `() => 以上任一模式`（可逐層展開） */
	const fromBuilder = await resolveFolderInput(() => () => [DAY_BASE]);

	for (const [name, folders] of [
		['string', fromString],
		['iterable', fromIterable],
		['generator', fromGenerator],
		['builder', fromBuilder],
	] as const)
	{
		consoleLogger.log(EnumLogLabel.Temp, `[auto-post] source [${name}]: ${folders.length} folders`);

		for (const folder of folders)
		{
			/** 天目錄展開為任務；其餘維持自身 */
			for (const unit of await expandFolder(folder))
			{
				consoleLogger.log(EnumLogLabel.Temp, `  [${unit.kind}] ${unit.path}`);
			}
		}
	}
}

/**
 * 示範：glob 輸入模式（需 fast-glob；AsyncIterable 會先取完再交由 `for...of` 執行）
 */
async function globDemo()
{
	const { globStream, async: globAsync } = await import('fast-glob');

	/** `globStream`：AsyncIterable（類似 async Generator） */
	const streamSource: IFolderInput = globStream(['**' + '/*_task*'], {
		cwd: DAY_BASE,
		onlyFiles: false,
		onlyDirectories: true,
		markDirectories: true,
		deep: 2,
		objectMode: true,
		absolute: true,
	});

	/** `globAsync`：Promise（陣列） */
	const asyncSource: IFolderInput = globAsync(['**' + '/*_task*'], {
		cwd: DAY_BASE,
		onlyFiles: false,
		onlyDirectories: true,
		markDirectories: true,
		deep: 2,
		objectMode: true,
		absolute: true,
	});

	for (const [name, source] of [
		['globStream', streamSource],
		['globAsync', asyncSource],
	] as const)
	{
		const folders = await resolveFolderInput(source);

		consoleLogger.log(EnumLogLabel.Temp, `[auto-post] source [${name}]: ${folders.length} folders`);

		for (const folder of folders)
		{
			consoleLogger.log(EnumLogLabel.Temp, `  [${folder.kind}] ${folder.path}`);
		}
	}
}

async function main()
{
	await resolveDemo();
	await globDemo();
}

main().catch(console.error);
