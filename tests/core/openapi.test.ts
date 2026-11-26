import { readFileSync } from 'node:fs';
import openapiTS, { COMMENT_HEADER, astToString, type OpenAPI3 } from 'openapi-typescript';
import { describe, expect, it } from 'vitest';

describe('openapi generated types', () => {
	it('matches openapi/openapi.json', async () => {
		const spec = JSON.parse(
			readFileSync(new URL('../../openapi/openapi.json', import.meta.url), 'utf8'),
		) as OpenAPI3;
		const generated = COMMENT_HEADER + astToString(await openapiTS(spec));
		const committed = readFileSync(new URL('../../src/api/generated/openapi.ts', import.meta.url), 'utf8');
		expect(committed).toBe(generated);
	});
});
