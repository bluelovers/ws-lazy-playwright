
import { createBrowserAutomation } from '#/lib';
import { EnumAutomationEngine } from '@lazy-playwright/shared-types';

(async () => {
	const automation = await createBrowserAutomation({
		engine: EnumAutomationEngine.Camoufox,

		// module: PATCHRIGHT_MODULE_ID,
		// channel: "chrome",
	});

	const context = await automation.newContext();

	await automation.goto('https://www.npmjs.com/search?q=author%3Abluelovers', {
		ensurePage: true,
	});

	await automation.goto('https://www.npmjs.com/search?q=author%3Abluelovers#main2', {
		ensurePage: true,
		newPage: true,
	});



})();
