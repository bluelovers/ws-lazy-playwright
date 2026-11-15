
import { playwrightModuleRegistry } from '@lazy-playwright/module-registry';
import { chromium } from 'patchright';

playwrightModuleRegistry.register({
	id: 'patchright',
	api: { chromium },
});
