import { createBrowserAutomation } from 'lazy-playwright-impl/lib';
import { registerPatchright, PATCHRIGHT_MODULE_ID } from '../../index';

(async () => {
	registerPatchright();

	const automation = await createBrowserAutomation({
		module: PATCHRIGHT_MODULE_ID,
	});

	const context = await automation.newContext();

	await automation.newPage();
})();
