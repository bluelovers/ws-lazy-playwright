
/** 依總大小貪心切包：單次上傳總和不超過 `maxBytes`
 *
 * 單檔即超過上限時仍自成一包（檔案無法再拆分）。
 */
export function packBySize<T extends { size: number; }>(items: readonly T[], maxBytes: number): T[][]
{
	const packs: T[][] = [];
	let current: T[] = [];
	let currentSize = 0;

	for (const item of items)
	{
		if (current.length && currentSize + item.size > maxBytes)
		{
			packs.push(current);
			current = [];
			currentSize = 0;
		}

		current.push(item);
		currentSize += item.size;
	}

	if (current.length) packs.push(current);

	return packs;
}
