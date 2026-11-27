# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Hosted `/mcp` now challenges missing or invalid OAuth credentials before rejecting unsupported HTTP methods. Browser clients can complete CORS preflight and read the OAuth challenge.

## [0.3.0] - 2026-11-27

### Added

- `transcribe_video` for opt-in AI transcription of videos without subtitles. It reports progress and returns timestamped segments marked with `kind: "visual"` for on-screen descriptions.
- `aiTranscript` opt-in for `summarize_video` and a `transcriptSource` field in the result.

### Changed

- `NO_SUBTITLES` guidance now shows the estimated AI transcription cost when available and asks for user consent before suggesting a paid retry or transcription.
- The MCP Registry entry for the hosted server no longer requires an `Authorization` header: clients discover OAuth sign-in from the server. API keys still work as a Bearer token.

## [0.2.1] - 2026-11-27

### Added

- Hosted OpenAI domain verification at `/.well-known/openai-apps-challenge` via `OPENAI_APPS_CHALLENGE`.

### Fixed

- Every tool that can spend credits (subtitles, frames, summaries, translations) is now annotated as non-read-only and destructive, because a spent credit cannot be refunded.

## [0.2.0] - 2026-11-26

### Added

- Hosted OAuth discovery and sign-in, with HTTP challenges for missing or expired credentials and tool-level reauthorization when a token expires during a call.
- Explicit read-only, destructive and open-world annotations on every tool, plus OAuth security metadata on hosted tools.

### Changed

- Tool descriptions state credit costs and cache behavior. Insufficient-credit errors link to the informational pricing page.

## [0.1.2] - 2026-11-26

### Changed

- The vendored OpenAPI spec now requires `url` or `videoId` on subtitle, summary and frame requests (`anyOf`).

### Fixed

- README: Windsurf config path now points at Devin Desktop's `~/.config/devin/mcp_config.json`.
- On shutdown, hosted HTTP stops accepting new requests, gives in-flight calls time to finish, and tells agents how to retry jobs that are still running on the API.

## [0.1.1] - 2026-11-26

### Fixed

- A rejected API key (`INVALID_API_KEY`: unknown, revoked or expired) now keeps the reason and tells the agent where to get a new key.
- README: the hosted server at `https://mcp.unwatched.click/mcp` is live; fixed the Claude Code command (no `--url` flag).

## [0.1.0] - 2026-11-26

### Changed

- Switched `summarize_video` and `translate_transcript` to the asynchronous job API (`POST /api/v1/summaries` and `POST /api/v1/transcripts/translate` returning `202` + `GET /api/v1/jobs/{id}` polling), with MCP progress notifications, request cancellation via `AbortSignal`, transient retry/timeout handling, and updated error guidance.
- Reduced the default HTTP request timeout in `ApiClient` from 10 minutes to 60 seconds and added `AbortSignal` support across API client methods.

### Added

- Initial release of `unwatched-click-mcp`, an MCP server for the Unwatched REST API.
- Tools: `get_video_subtitles`, `list_subtitle_tracks`, `get_video_info`, `get_video_frame`, `translate_transcript`, `summarize_video`, `search_articles`, `get_credit_balance`.
- stdio transport (default) and Streamable HTTP transport for self-hosting.
- npm package `unwatched-click-mcp` and MCP registry metadata (`server.json`).
