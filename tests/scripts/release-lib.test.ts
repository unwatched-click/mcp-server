import { describe, expect, it } from 'vitest';
import {
	computeNextVersion,
	formatTodayUtc,
	getChangelogPreview,
	parseReleaseArgs,
	updateChangelog,
	updateServerJson,
} from '../../scripts/release-lib.mjs';

describe('computeNextVersion', () => {
	it('bumps patch, minor, and major versions', () => {
		expect(computeNextVersion('0.1.1', 'patch')).toBe('0.1.2');
		expect(computeNextVersion('0.1.1', 'minor')).toBe('0.2.0');
		expect(computeNextVersion('0.1.1', 'major')).toBe('1.0.0');
		expect(computeNextVersion('1.9.9', 'minor')).toBe('1.10.0');
	});

	it('accepts an explicit version strictly greater than current', () => {
		expect(computeNextVersion('0.1.1', '0.1.2')).toBe('0.1.2');
		expect(computeNextVersion('0.1.1', '0.2.0')).toBe('0.2.0');
		expect(computeNextVersion('0.1.1', '1.0.0')).toBe('1.0.0');
		expect(computeNextVersion('0.1.1', '0.1.10')).toBe('0.1.10');
	});

	it('rejects explicit versions equal to or less than current', () => {
		expect(() => computeNextVersion('0.1.1', '0.1.1')).toThrow(
			'Explicit version 0.1.1 must be greater than current version 0.1.1.',
		);
		expect(() => computeNextVersion('0.1.1', '0.1.0')).toThrow(
			'Explicit version 0.1.0 must be greater than current version 0.1.1.',
		);
		expect(() => computeNextVersion('1.2.0', '1.1.9')).toThrow(
			'Explicit version 1.1.9 must be greater than current version 1.2.0.',
		);
		expect(() => computeNextVersion('2.0.0', '1.9.9')).toThrow(
			'Explicit version 1.9.9 must be greater than current version 2.0.0.',
		);
	});

	it('rejects invalid targets and invalid current versions', () => {
		expect(() => computeNextVersion('0.1.1', 'v0.1.2')).toThrow('Invalid version target');
		expect(() => computeNextVersion('0.1.1', '01.0.0')).toThrow('Invalid version target');
		expect(() => computeNextVersion('0.1.1', 'prerelease')).toThrow('Invalid version target');
		expect(() => computeNextVersion('0.1.1', '')).toThrow('Missing version target');
		expect(() => computeNextVersion('bad', 'patch')).toThrow('Invalid semver version');
	});
});

describe('parseReleaseArgs', () => {
	it('parses version target and optional --dry-run flag', () => {
		expect(parseReleaseArgs(['patch'])).toEqual({ target: 'patch', dryRun: false });
		expect(parseReleaseArgs(['minor', '--dry-run'])).toEqual({ target: 'minor', dryRun: true });
		expect(parseReleaseArgs(['--dry-run', '0.2.0'])).toEqual({ target: '0.2.0', dryRun: true });
	});

	it('rejects missing target, unknown flags, and extra arguments', () => {
		expect(() => parseReleaseArgs([])).toThrow('Missing version target');
		expect(() => parseReleaseArgs(['--dry-run'])).toThrow('Missing version target');
		expect(() => parseReleaseArgs(['patch', '--force'])).toThrow('Unknown option "--force"');
		expect(() => parseReleaseArgs(['patch', 'minor'])).toThrow('Unexpected argument "minor"');
	});
});

describe('updateChangelog', () => {
	it('moves Unreleased entries under the new dated heading without adding link refs when none exist', () => {
		const before = `# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- One-command release script.

### Fixed

- Handled edge case.

## [0.1.1] - 2026-11-26

### Fixed

- Previous fix.
`;

		const expected = `# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.1.2] - 2026-11-27

### Added

- One-command release script.

### Fixed

- Handled edge case.

## [0.1.1] - 2026-11-26

### Fixed

- Previous fix.
`;

		expect(updateChangelog(before, '0.1.2', '2026-11-27')).toBe(expected);
	});

	it('updates link reference definitions at the bottom when present', () => {
		const before = `# Changelog

## [Unreleased]

### Changed

- Updated something.

## [0.1.1] - 2026-11-26

### Fixed

- Old fix.

[Unreleased]: https://github.com/unwatched-click/mcp-server/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/unwatched-click/mcp-server/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/unwatched-click/mcp-server/releases/tag/v0.1.0
`;

		const expected = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-27

### Changed

- Updated something.

## [0.1.1] - 2026-11-26

### Fixed

- Old fix.

[Unreleased]: https://github.com/unwatched-click/mcp-server/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/unwatched-click/mcp-server/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/unwatched-click/mcp-server/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/unwatched-click/mcp-server/releases/tag/v0.1.0
`;

		expect(updateChangelog(before, '0.2.0', '2026-11-27')).toBe(expected);
	});

	it('handles a first release when Unreleased is at the end of the file', () => {
		const before = `# Changelog

## [Unreleased]

### Added

- Initial release.
`;

		const expected = `# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-26

### Added

- Initial release.
`;

		expect(updateChangelog(before, '0.1.0', '2026-11-26')).toBe(expected);
	});

	it('handles Unreleased followed directly by link reference definitions', () => {
		const before = `# Changelog

## [Unreleased]

### Added

- Initial release.

[Unreleased]: https://github.com/unwatched-click/mcp-server/compare/v0.0.0...HEAD
`;

		const expected = `# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-26

### Added

- Initial release.

[Unreleased]: https://github.com/unwatched-click/mcp-server/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/unwatched-click/mcp-server/compare/v0.0.0...v0.1.0
`;

		expect(updateChangelog(before, '0.1.0', '2026-11-26')).toBe(expected);
	});

	it('throws when Unreleased is empty or has no entries', () => {
		const emptyBefore = `# Changelog

## [Unreleased]

## [0.1.1] - 2026-11-26

- Previous release.
`;
		expect(() => updateChangelog(emptyBefore, '0.1.2', '2026-11-27')).toThrow(
			'has no entries',
		);

		const headingOnly = `# Changelog

## [Unreleased]

### Added

## [0.1.1] - 2026-11-26

- Previous release.
`;
		expect(() => updateChangelog(headingOnly, '0.1.2', '2026-11-27')).toThrow(
			'has no entries',
		);

		const missingHeading = `# Changelog

## [0.1.1] - 2026-11-26

- Previous release.
`;
		expect(() => updateChangelog(missingHeading, '0.1.2', '2026-11-27')).toThrow(
			'missing a "## [Unreleased]" heading',
		);
	});

	it('returns changelog preview for dry-run output', () => {
		const before = `# Changelog

## [Unreleased]

### Fixed

- Bug fix.

## [0.1.1] - 2026-11-26

- Earlier.
`;
		expect(getChangelogPreview(before, '0.1.2', '2026-11-27')).toBe(`## [0.1.2] - 2026-11-27

### Fixed

- Bug fix.`);
	});
});

describe('updateServerJson', () => {
	it('updates version and packages[0].version with 2-space indent and trailing newline', () => {
		const before = `{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.unwatched-click/mcp-server",
  "version": "0.1.1",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "unwatched-click-mcp",
      "version": "0.1.1",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
`;

		const expected = `{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.unwatched-click/mcp-server",
  "version": "0.1.2",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "unwatched-click-mcp",
      "version": "0.1.2",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
`;

		expect(updateServerJson(before, '0.1.2')).toBe(expected);
	});

	it('rejects malformed server.json without packages[0]', () => {
		expect(() => updateServerJson('{"version":"0.1.1","packages":[]}', '0.1.2')).toThrow(
			'Invalid server.json',
		);
	});
});

describe('formatTodayUtc', () => {
	it('formats a Date as YYYY-MM-DD in UTC', () => {
		expect(formatTodayUtc(new Date('2026-11-27T01:00:00+02:00'))).toBe('2026-11-26');
	});
});
