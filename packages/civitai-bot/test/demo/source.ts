/// <reference types="node" />

import { console } from 'debug-color2';
import { consoleLoggerTimeAndLabel } from '@lazy-playwright/logger';
import { EnumLogLabel } from '#/lib/util/logger';
import { iterateFolderInput } from '#/lib/path-kind/source';
import { expandFolder } from '#/lib/path-kind/folder';
import type { IFolderInput } from '#/lib/types/types';
import { globStream, async as globAsync } from 'fast-glob';

/** agent-scheduler 單日目錄（示範用） */
const DAY_BASE = 'D:\\sd-forge\\output\\agent-scheduler\\2026-09-13';

/**
 * 示範：來源輸入的各種模式（不啟動瀏覽器，僅解析與展開）
 *
 * 支援：單一字串、`Iterable<string|object>`、同步 Generator、
 * `globStream`（AsyncIterable）、`globAsync`（Promise）、構建函式。
 *
 * 各模式皆由 {@link iterateFolderInput} 串接為生成器 (Generator)：
 * 解析一項即展開一項，大量目錄時不建立中間陣列 (Intermediate Array)。
 */
async function resolveDemo()
{
	/** 單一字串 */
	const fromString: IFolderInput = `${DAY_BASE}\\14-41-51_task(7gysqd604e7jv3m)`;

	/** `Iterable<object>`：至少含 `path`，可選 `kind` / `day` / `task` */
	const fromIterable: IFolderInput = [
		{ path: `${DAY_BASE}\\14-41-51_task(7gysqd604e7jv3m)` },
		{ path: DAY_BASE },
	];

	/** 同步 Generator */
	function* taskPaths()
	{
		yield `${DAY_BASE}\\14-41-51_task(7gysqd604e7jv3m)`;
		yield DAY_BASE;
	}
	const fromGenerator: IFolderInput = taskPaths();

	/** 構建函式 `() => 以上任一模式`（可逐層展開） */
	const fromBuilder: IFolderInput = () => [DAY_BASE];

	for (const [name, source] of [
		['string', fromString],
		['iterable', fromIterable],
		['generator', fromGenerator],
		['builder', fromBuilder],
	] as const)
	{
		consoleLoggerTimeAndLabel.log(EnumLogLabel.CivitaiBot, `[auto-post] source [${name}] (streaming):`);

		let count = 0;

		for await (const folder of iterateFolderInput(source))
		{
			count++;

			/** 天目錄展開為任務；其餘維持自身 */
			for await (const unit of expandFolder(folder))
			{
				consoleLoggerTimeAndLabel.log(EnumLogLabel.CivitaiBot, `  [${unit.kind}] ${unit.path}`);
			}
		}

		consoleLoggerTimeAndLabel.log(EnumLogLabel.CivitaiBot, `[auto-post] source [${name}]: ${count} folders`);
	}
}

/**
 * 示範：glob 輸入模式（需 fast-glob）
 *
 * `globStream`（AsyncIterable）與 `globAsync`（Promise）皆在迭代當下由
 * {@link iterateFolderInput} 取用並逐項產出。
 */
async function globDemo()
{
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
		consoleLoggerTimeAndLabel.log(EnumLogLabel.CivitaiBot, `[auto-post] source [${name}] (streaming):`);

		let count = 0;

		for await (const folder of iterateFolderInput(source))
		{
			count++;
			consoleLoggerTimeAndLabel.log(EnumLogLabel.CivitaiBot, ` [${folder.kind}] ${folder.path}`);
		}

		consoleLoggerTimeAndLabel.log(EnumLogLabel.CivitaiBot, `[auto-post] source [${name}]: ${count} folders`);
	}
}

async function main()
{
	await resolveDemo();
	await globDemo();
}

main().catch(console.error);
