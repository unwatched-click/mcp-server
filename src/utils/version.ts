import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let packageVersion = '0.0.0';

try {
	// `src/utils/version.ts` and `build/utils/version.js` sit two levels below
	// the package root, so the same relative lookup works before and after tsc.
	const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
	packageVersion = packageJson.version ?? packageVersion;
} catch {
	// Running from a bundle or a repackaged install without package.json.
}

export const version = packageVersion;
