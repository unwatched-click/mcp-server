import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	computeNextVersion,
	formatTodayUtc,
	getChangelogPreview,
	parseReleaseArgs,
	updateChangelog,
	updateServerJson,
} from './release-lib.mjs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_FILES = ['package.json', 'package-lock.json', 'server.json', 'CHANGELOG.md'];
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runCommand(cmd, args, { inheritStdio = false } = {}) {
	return execFileSync(cmd, args, {
		cwd: ROOT_DIR,
		encoding: 'utf8',
		stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
	});
}

function git(args, options) {
	return runCommand('git', args, options);
}

function npm(args, options) {
	return runCommand(NPM_BIN, args, options);
}

function fail(message) {
	console.error(`Error: ${message}`);
	process.exit(1);
}

function main() {
	let target;
	let dryRun;
	try {
		({ target, dryRun } = parseReleaseArgs(process.argv.slice(2)));
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}

	// 1. Preflight: must be on branch `main`
	const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
	if (branch !== 'main') {
		fail(`Releases must run from branch "main" (current branch: "${branch}").`);
	}

	// 2. Preflight: working tree must be clean
	const status = git(['status', '--porcelain']).trim();
	if (status !== '') {
		fail('Working tree is not clean. Commit or stash your changes before releasing.');
	}

	// 3. Preflight: fetch origin and confirm local `main` matches `origin/main`
	console.log('Fetching origin...');
	try {
		git(['fetch', 'origin'], { inheritStdio: true });
	} catch {
		fail('Failed to fetch from origin.');
	}

	let localSha;
	let remoteSha;
	try {
		localSha = git(['rev-parse', 'main']).trim();
		remoteSha = git(['rev-parse', 'origin/main']).trim();
	} catch {
		fail('Could not resolve "main" and "origin/main". Ensure origin/main exists.');
	}

	if (localSha !== remoteSha) {
		fail(
			`Local "main" (${localSha.slice(0, 7)}) does not match "origin/main" (${remoteSha.slice(0, 7)}). Pull or push before releasing.`,
		);
	}

	// 4. Compute new version from package.json
	const packageJsonPath = resolve(ROOT_DIR, 'package.json');
	const serverJsonPath = resolve(ROOT_DIR, 'server.json');
	const changelogPath = resolve(ROOT_DIR, 'CHANGELOG.md');

	const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	const currentVersion = pkg.version;
	let newVersion;
	try {
		newVersion = computeNextVersion(currentVersion, target);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}

	const tagName = `v${newVersion}`;

	// 5. Preflight: tag `v<new>` must not exist locally or remotely
	const localTag = git(['tag', '-l', tagName]).trim();
	if (localTag !== '') {
		fail(`Tag "${tagName}" already exists locally.`);
	}

	const remoteTagCheck = spawnSync(
		'git',
		['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tagName}`],
		{ cwd: ROOT_DIR, encoding: 'utf8' },
	);
	if (remoteTagCheck.status === 0) {
		fail(`Tag "${tagName}" already exists on origin.`);
	}
	if (remoteTagCheck.status !== 2) {
		const details = remoteTagCheck.stderr?.trim() || `exit code ${remoteTagCheck.status}`;
		fail(`Failed to check remote tags on origin: ${details}`);
	}

	// 6. Preflight: validate CHANGELOG.md and server.json transforms
	const todayUtc = formatTodayUtc();
	const changelogBefore = readFileSync(changelogPath, 'utf8');
	const serverJsonBefore = readFileSync(serverJsonPath, 'utf8');

	let changelogAfter;
	let changelogPreview;
	let serverJsonAfter;
	try {
		changelogPreview = getChangelogPreview(changelogBefore, newVersion, todayUtc);
		changelogAfter = updateChangelog(changelogBefore, newVersion, todayUtc);
		serverJsonAfter = updateServerJson(serverJsonBefore, newVersion);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}

	if (dryRun) {
		console.log('');
		console.log('Dry run passed. No files were modified and nothing was committed or pushed.');
		console.log(`Version: ${currentVersion} -> ${newVersion} (tag ${tagName})`);
		console.log(`Files to update: ${RELEASE_FILES.join(', ')}`);
		console.log('');
		console.log('Changelog preview:');
		console.log('---');
		console.log(changelogPreview);
		console.log('---');
		console.log('Checks: npm run typecheck && npm test');
		console.log(`Git: commit "chore: release ${newVersion}", tag "${tagName}", git push --atomic origin main ${tagName}`);
		return;
	}

	// 7. Apply updates and run verification; restore files on any failure before commit
	let filesModified = false;
	try {
		console.log(`Updating version to ${newVersion}...`);
		npm(['version', newVersion, '--no-git-tag-version'], { inheritStdio: true });
		filesModified = true;

		writeFileSync(serverJsonPath, serverJsonAfter, 'utf8');
		writeFileSync(changelogPath, changelogAfter, 'utf8');

		console.log('Running typecheck...');
		npm(['run', 'typecheck'], { inheritStdio: true });

		console.log('Running tests...');
		npm(['test'], { inheritStdio: true });
	} catch (error) {
		if (filesModified) {
			console.error('Checks failed. Restoring modified release files...');
			try {
				git(['checkout', '--', ...RELEASE_FILES], { inheritStdio: true });
			} catch (restoreErr) {
				console.error('Warning: failed to restore some files:', restoreErr);
			}
		}
		fail(error instanceof Error ? error.message : 'Release aborted due to failed checks.');
	}

	// 8. Commit, annotated tag, and atomic push
	try {
		console.log(`Committing release ${newVersion}...`);
		git(['commit', '-m', `chore: release ${newVersion}`, '--', ...RELEASE_FILES], {
			inheritStdio: true,
		});

		console.log(`Creating annotated tag ${tagName}...`);
		git(['tag', '-a', tagName, '-m', `Release ${tagName}`], { inheritStdio: true });

		console.log(`Pushing main and ${tagName} atomically to origin...`);
		git(['push', '--atomic', 'origin', 'main', tagName], { inheritStdio: true });
	} catch (error) {
		fail(error instanceof Error ? error.message : 'Git commit/tag/push failed.');
	}

	console.log('');
	console.log(`Released ${newVersion} (${tagName}).`);
	console.log('Watch the release pipeline:');
	console.log('  GitHub Actions: https://github.com/unwatched-click/mcp-server/actions');
	console.log('  npm package:    https://www.npmjs.com/package/unwatched-click-mcp');
	console.log(
		'  MCP Registry:   https://registry.modelcontextprotocol.io/v0/servers/io.github.unwatched-click%2Fmcp-server/versions/latest',
	);
}

main();
