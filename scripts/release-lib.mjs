const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUMP_TYPES = new Set(['patch', 'minor', 'major']);
const LINK_DEF_RE = /^\[[^\]]+\]:\s+\S+/;
const UNRELEASED_LINK_RE = /^(\[unreleased\]:\s*)(\S+?\/compare\/)(\S+?)\.\.\.HEAD\s*$/i;

/**
 * Parse a strict `major.minor.patch` semver string into numeric parts.
 * @param {string} version
 * @returns {[number, number, number]}
 */
export function parseSemver(version) {
	if (typeof version !== 'string') {
		throw new Error(`Invalid version: expected a string, got ${typeof version}.`);
	}
	const match = SEMVER_RE.exec(version.trim());
	if (!match) {
		throw new Error(`Invalid semver version "${version}". Expected format x.y.z.`);
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compute the next version from `currentVersion` and a bump keyword or explicit `x.y.z`.
 * @param {string} currentVersion
 * @param {string} target
 * @returns {string}
 */
export function computeNextVersion(currentVersion, target) {
	const [curMajor, curMinor, curPatch] = parseSemver(currentVersion);

	if (typeof target !== 'string' || target.trim() === '') {
		throw new Error('Missing version target. Expected patch, minor, major, or x.y.z.');
	}

	const normalized = target.trim();
	if (normalized === 'patch') {
		return `${curMajor}.${curMinor}.${curPatch + 1}`;
	}
	if (normalized === 'minor') {
		return `${curMajor}.${curMinor + 1}.0`;
	}
	if (normalized === 'major') {
		return `${curMajor + 1}.0.0`;
	}

	if (!SEMVER_RE.test(normalized)) {
		throw new Error(
			`Invalid version target "${target}". Expected patch, minor, major, or x.y.z.`,
		);
	}

	const [nextMajor, nextMinor, nextPatch] = parseSemver(normalized);
	const cmp = nextMajor - curMajor || nextMinor - curMinor || nextPatch - curPatch;
	if (cmp <= 0) {
		throw new Error(
			`Explicit version ${normalized} must be greater than current version ${currentVersion}.`,
		);
	}

	return normalized;
}

/**
 * Format a Date as `YYYY-MM-DD` in UTC.
 * @param {Date} [date]
 * @returns {string}
 */
export function formatTodayUtc(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

/**
 * Parse CLI arguments for the release script.
 * @param {string[]} argv
 * @returns {{ target: string, dryRun: boolean }}
 */
export function parseReleaseArgs(argv) {
	let target = null;
	let dryRun = false;

	for (const arg of argv) {
		if (arg === '--dry-run') {
			dryRun = true;
		} else if (arg.startsWith('-')) {
			throw new Error(`Unknown option "${arg}". Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]`);
		} else if (target !== null) {
			throw new Error(`Unexpected argument "${arg}". Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]`);
		} else {
			if (!BUMP_TYPES.has(arg) && !SEMVER_RE.test(arg)) {
				throw new Error(`Invalid version target "${arg}". Expected patch, minor, major, or x.y.z.`);
			}
			target = arg;
		}
	}

	if (target === null) {
		throw new Error('Missing version target. Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]');
	}

	return { target, dryRun };
}

/**
 * Extract the trimmed body lines of `## [Unreleased]` and its slice indices.
 * Throws if the heading is missing or contains no non-empty entry.
 * @param {string[]} lines
 * @returns {{ unreleasedIdx: number, endIdx: number, bodyLines: string[] }}
 */
function findUnreleasedSection(lines) {
	const unreleasedIdx = lines.findIndex((line) => /^## \[Unreleased\]\s*$/.test(line));
	if (unreleasedIdx === -1) {
		throw new Error('CHANGELOG.md is missing a "## [Unreleased]" heading.');
	}

	let endIdx = lines.length;
	for (let i = unreleasedIdx + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (/^##(?:\s|\[)/.test(line) || LINK_DEF_RE.test(line)) {
			endIdx = i;
			break;
		}
	}

	const rawBody = lines.slice(unreleasedIdx + 1, endIdx);
	let first = 0;
	while (first < rawBody.length && rawBody[first].trim() === '') {
		first += 1;
	}
	let last = rawBody.length - 1;
	while (last >= first && rawBody[last].trim() === '') {
		last -= 1;
	}

	const bodyLines = first <= last ? rawBody.slice(first, last + 1) : [];
	const withoutComments = bodyLines.join('\n').replace(/<!--[\s\S]*?-->/g, '');
	const hasEntry = withoutComments
		.split('\n')
		.some((line) => {
			const trimmed = line.trim();
			return trimmed.length > 0 && !/^###\s/.test(trimmed);
		});

	if (!hasEntry) {
		throw new Error(
			'CHANGELOG.md "## [Unreleased]" section has no entries. Add release notes before releasing.',
		);
	}

	return { unreleasedIdx, endIdx, bodyLines };
}

/**
 * Return the preview text for the new release section that will be created from `## [Unreleased]`.
 * @param {string} content
 * @param {string} newVersion
 * @param {string} [dateStr]
 * @returns {string}
 */
export function getChangelogPreview(content, newVersion, dateStr = formatTodayUtc()) {
	const lines = content.split('\n');
	const { bodyLines } = findUnreleasedSection(lines);
	return [`## [${newVersion}] - ${dateStr}`, '', ...bodyLines].join('\n');
}

/**
 * Move the `## [Unreleased]` entries under a new `## [<newVersion>] - <dateStr>` heading,
 * leave an empty `## [Unreleased]` above it, and update bottom link reference definitions if present.
 * @param {string} content
 * @param {string} newVersion
 * @param {string} [dateStr]
 * @returns {string}
 */
export function updateChangelog(content, newVersion, dateStr = formatTodayUtc()) {
	parseSemver(newVersion);
	const endsWithNewline = content.endsWith('\n');
	const lines = content.split('\n');
	const { unreleasedIdx, endIdx, bodyLines } = findUnreleasedSection(lines);

	const trailing = lines.slice(endIdx);
	const hasTrailingContent = trailing.some((line) => line.length > 0);
	const needsTrailingNewline = trailing.length === 0 && endsWithNewline;

	const updatedLines = [
		...lines.slice(0, unreleasedIdx + 1),
		'',
		`## [${newVersion}] - ${dateStr}`,
		'',
		...bodyLines,
		...(hasTrailingContent || needsTrailingNewline ? [''] : []),
		...trailing,
	];

	// Update link reference definitions at the bottom only if an `[Unreleased]: ...compare/...HEAD` line exists.
	const linkIdx = updatedLines.findIndex((line) => UNRELEASED_LINK_RE.test(line));
	if (linkIdx !== -1) {
		const match = UNRELEASED_LINK_RE.exec(updatedLines[linkIdx]);
		const [, prefix, compareBase, prevRef] = match;
		const newRef = prevRef.startsWith('v') ? `v${newVersion}` : newVersion;
		updatedLines.splice(
			linkIdx,
			1,
			`${prefix}${compareBase}${newRef}...HEAD`,
			`[${newVersion}]: ${compareBase}${prevRef}...${newRef}`,
		);
	}

	return updatedLines.join('\n');
}

/**
 * Update `version` and `packages[0].version` in `server.json`, preserving 2-space indentation and trailing newline.
 * @param {string} content
 * @param {string} newVersion
 * @returns {string}
 */
export function updateServerJson(content, newVersion) {
	parseSemver(newVersion);
	const data = JSON.parse(content);
	if (
		!data ||
		typeof data !== 'object' ||
		Array.isArray(data) ||
		!Array.isArray(data.packages) ||
		data.packages.length === 0 ||
		!data.packages[0] ||
		typeof data.packages[0] !== 'object'
	) {
		throw new Error('Invalid server.json: expected top-level object with non-empty packages[0] object.');
	}

	data.version = newVersion;
	data.packages[0].version = newVersion;
	return `${JSON.stringify(data, null, 2)}\n`;
}
