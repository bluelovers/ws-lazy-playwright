
import { playwrightModuleRegistry } from '@lazy-playwright/module-registry';
import { chromium } from 'patchright';

export const PATCHRIGHT_MODULE_ID = 'patchright' as const;

export { PATCHRIGHT_MODULE_ID as MODULE_ID }

export function registerPatchright()
{
	playwrightModuleRegistry.register({
		id: PATCHRIGHT_MODULE_ID,
		api: { chromium },
	});
}

export default registerPatchright;
