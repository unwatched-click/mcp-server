# Releasing

## Prerequisites

- Push access to `unwatched-click/mcp-server` (`main` branch and tags).
- npm Trusted Publishing (OIDC) is already configured on npmjs.com for `unwatched-click-mcp` (`unwatched-click/mcp-server`, workflow `.github/workflows/release.yml`). No `NPM_TOKEN` or registry secrets are needed.

## Release flow

1. Add user-facing notes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) while developing.
2. Preview the release without modifying any files:

   ```bash
   npm run release -- patch --dry-run
   ```

   You can pass `patch`, `minor`, `major`, or an explicit `x.y.z` version greater than the current version.
3. Run the release:

   ```bash
   npm run release -- patch
   ```

   This verifies preflight checks (`main` branch, clean working tree, `main` synced with `origin/main`, tag `v<new>` unused locally and remotely, non-empty `## [Unreleased]`), updates `package.json`, `package-lock.json`, `server.json`, and `CHANGELOG.md`, runs `npm run typecheck` and `npm test`, commits `chore: release <version>`, creates annotated tag `v<version>`, and atomically pushes `main` and `v<version>`.
4. Watch [GitHub Actions](https://github.com/unwatched-click/mcp-server/actions) until the `Release` workflow finishes.

## What the release workflow does

Pushing a `v*` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Verifies that the git tag, `package.json` `version`, `server.json` `version`, and `server.json` `packages[0].version` all match.
2. Sets up Node 22 + npm 11, runs `npm ci`, `npm test`, and `npm run build`.
3. Publishes to npm using OIDC trusted publishing (`npm publish --provenance --access public`), skipping publish if that version is already on npm, then waits up to 5 minutes for the version to appear on npm.
4. Downloads `mcp-publisher`, authenticates via GitHub OIDC, publishes `server.json` to the MCP Registry, and verifies the new version is live with `isLatest: true`.

## Verification

- npm package version:
  ```bash
  npm view unwatched-click-mcp version
  ```
- MCP Registry latest entry:
  `https://registry.modelcontextprotocol.io/v0/servers/io.github.unwatched-click%2Fmcp-server/versions/latest`
- Hosted deployment health:
  `https://mcp.unwatched.click/health`

Note: the hosted deployment picks up the newest `v*` tag automatically within ~15 minutes (operated from a separate private repository; no action needed here).

## Troubleshooting

- **Version mismatch error in Actions**: The tag, `package.json`, and both versions in `server.json` must match. Always use `npm run release` so they stay in sync.
- **Tag already exists**: Only delete a local and remote tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`) if the workflow failed *before* publishing to npm.
- **npm publish succeeded, but MCP Registry publish failed**: Re-run the failed job in GitHub Actions. The npm publish step checks `npm view` first and skips already-published versions, then continues to the MCP Registry steps.
- **Never reuse a published version number**: npm versions are immutable once published. Always bump to a new version.
