
/**
 * 依前綴集合過濾 CLI 參數，移除命中任一前綴的參數
 *
 * 用於過濾目標瀏覽器不支援的啟動參數，避免啟動時產生警告或錯誤。
 */
export function filterCliArgsByPrefixes(
	args: readonly string[],
	prefixes: readonly string[],
): string[]
{
	return args.filter(arg =>
	{
		for (const prefix of prefixes)
		{
			if (arg.startsWith(prefix))
			{
				return false;
			}
		}
		return true;
	});
}
