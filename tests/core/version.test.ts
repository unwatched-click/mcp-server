import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { version } from '../../src/utils/version.js';

describe('version', () => {
	it('is read from package.json at runtime', () => {
		const packageJson = JSON.parse(
			readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
		) as { version: string };
		expect(version).toBe(packageJson.version);
		expect(version).not.toBe('0.0.0');
	});
});
