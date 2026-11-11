import { iterateFolderInput } from '#/lib/source';
import { ITaskFolder } from '#/lib/types';
import { test, TestContext } from 'node:test';


test('iterateFolderInput', async (t: TestContext) => {

	let result: ITaskFolder[] = [];

	for await (const folder of iterateFolderInput([
		'D:\\sd-forge\\output\\agent-scheduler',
		'D:\\sd-forge\\output\\agent-scheduler\\2026-11-09',
		'D:\\sd-forge\\output\\agent-scheduler\\2026-11-09\\14-07-58_task(0kfgui0dg5kmrpx)',

		'D:\\unknown\\14-07-58_task(0kfgui0dg5kmrpx)',

		'D:\\sd-forge\\output\\txt2img-images\\2026-11-09',
		'D:\\sd-forge\\output\\txt2img-images',

		'D:\\unknown\\2026-11-09',
	])) {
		result.push(folder);
	}

	t.assert.snapshot(result)
});
