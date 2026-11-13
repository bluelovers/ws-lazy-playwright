
/** 名稱升序排序：各組內的排序規則單一來源（上傳順序、天目錄、任務清單共用） */
export function sortNames<T extends string>(names: readonly T[]): T[]
{
	return [...names].sort((a, b) => a.localeCompare(b));
}
