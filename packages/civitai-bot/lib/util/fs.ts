
import { stat } from 'node:fs/promises';
import { PathLike } from 'node:fs';

export async function fsExists(path: PathLike, opts?: {
	fileOnly?: boolean;
	dirOnly?: boolean;
})
{
	try
	{
		const stats = await stat(path);

		if (opts?.fileOnly && !stats.isFile()) return false;
		if (opts?.dirOnly && !stats.isDirectory()) return false;

		return true;
	}
	catch (error)
	{
		if (error.code === 'ENOENT') return false;
		throw error;
	}
}
