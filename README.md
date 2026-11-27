# Unwatched MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for [Unwatched](https://unwatched.click) that lets AI agents read YouTube videos through the [Unwatched REST API](https://unwatched.click/en/api-docs). It exposes the API's video-reading features as eight MCP tools: subtitles with timestamps, available subtitle tracks, video metadata, frames at given seconds, transcript translation, AI article summaries, search over already-generated articles, and the remaining credit balance.

The server runs locally over stdio via `npx`, or any Streamable HTTP client can connect to the hosted endpoint.

## Requirements

- Node.js 20 or newer (for the local stdio server)
- An Unwatched account for hosted OAuth, or an Unwatched API key for stdio or HTTP header authentication. Create keys at https://unwatched.click/en/developer/keys.

## Quick Start

### Claude Code

```bash
claude mcp add unwatched --env UNWATCHED_API_KEY=unw_sk_your_key -- npx -y unwatched-click-mcp
```

Verify the connection with `claude mcp list`.

### Claude Desktop

Open `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Add the server:

```json
{
  "mcpServers": {
    "unwatched": {
      "command": "npx",
      "args": ["-y", "unwatched-click-mcp"],
      "env": {
        "UNWATCHED_API_KEY": "unw_sk_your_key"
      }
    }
  }
}
```

### Cursor

Open `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level) and add the same `mcpServers` block as in the Claude Desktop example.

### Windsurf

Windsurf is now Devin Desktop. Open `~/.config/devin/mcp_config.json` (Windows: `%APPDATA%\devin\mcp_config.json`) or the project's `.devin/mcp_config.json` and add the same `mcpServers` block as in the Claude Desktop example. Older Windsurf builds read `~/.codeium/windsurf/mcp_config.json`.

### Other MCP clients

The server uses the standard MCP stdio transport: launch it with command `npx`, arguments `-y unwatched-click-mcp`, and the environment variable `UNWATCHED_API_KEY` set to your API key.

## Hosted server (Streamable HTTP)

The hosted server runs at:

```
https://mcp.unwatched.click/mcp
```

The server uses [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) (stateless). Add the URL to your client and sign in to Unwatched with OAuth.

- **Claude.ai** Open **Customize → Connectors** and add a custom web connector. Enter the server URL and connect. [Claude connector setup](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- **ChatGPT** Open **Plugins → Add custom MCP server**, enter the server URL, and select **OAuth**. Use dynamic client registration and sign in when prompted. [ChatGPT custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- **Claude Code** Run the following command, then use `/mcp` in Claude Code to sign in. [Claude Code MCP setup](https://code.claude.com/docs/en/mcp)

```bash
claude mcp add --transport http unwatched https://mcp.unwatched.click/mcp
```

- **Cursor** Add `"unwatched": { "url": "https://mcp.unwatched.click/mcp" }` under `mcpServers` in `.cursor/mcp.json`. Select the server in Cursor and sign in. [Cursor MCP setup](https://cursor.com/docs/mcp)

Clients that support custom request headers can still send an API key as `Authorization: Bearer <your API key>`. In Claude Code, add `--header "Authorization: Bearer unw_sk_your_key"` to the command above.

For OpenAI plugin submission, set `OPENAI_APPS_CHALLENGE` on the hosted server to the exact token shown in the submission portal. The public `GET /.well-known/openai-apps-challenge` returns the token as plain text with no added newline, or `404` when unset. OpenAI checks the root path on the HTTPS MCP hostname (`https://mcp.unwatched.click` for the hosted server) or an eligible HTTPS parent domain selected in the portal. [OpenAI domain verification](https://developers.openai.com/plugins/deploy/submission#domain-verification-details)

## Getting an API key

Sign in at https://unwatched.click and open https://unwatched.click/en/developer/keys. Create a key and pass it to the server as `UNWATCHED_API_KEY` (stdio) or in the `Authorization` header (hosted and self-hosted HTTP). If a key leaks, revoke it on the same page.

## Tools

| Tool | Description | Cost |
|------|-------------|------|
| `get_video_subtitles` | Fetch the subtitle transcript of a YouTube video as timestamped lines. Accepts a video URL or an 11-character video id, with an optional language code. | Charged on the first fetch of a video and language; repeat fetches are served from cache and are free. |
| `list_subtitle_tracks` | List the subtitle languages available for a video, including whether each track is auto-generated and its extraction quality. | Free |
| `get_video_info` | Title, duration, thumbnail URL and publish date of a video. | Free |
| `get_video_frame` | Extract still frames at given timestamps (in seconds) and return them as images with stable URLs, for reading on-screen text, slides and charts. Batch the timestamps into one call. | Charged per newly extracted frame; a timestamp extracted before is free. |
| `translate_transcript` | Translate an already-fetched transcript into another language, keeping timestamps. Run `get_video_subtitles` for the source language first. | Charged per hour of video; cached translations are free. |
| `summarize_video` | Generate a structured article from a video — title, intro, sections, key points, conclusion — in the requested language. Slower than `get_video_subtitles`; prefer the subtitles tool when you only need the raw text. | Charged per hour of video; an already-generated article is returned free. |
| `search_articles` | Search the articles already generated on unwatched.click by title text, category and language. Use it before `summarize_video` to check whether a video has already been processed. | Free |
| `get_credit_balance` | Remaining credits on the connected account. | Free |

`summarize_video` and `translate_transcript` run asynchronously for uncached videos and may take several minutes. Cached results return immediately; otherwise the server polls the job until completion, sending MCP `notifications/progress` updates when the client provides a `progressToken` and stopping immediately if the request is cancelled. If a call hits the client-side wait limit (15 minutes), the job keeps running server-side — calling the tool again with the same inputs re-attaches to the active job.

## Pricing

Unwatched is pay-as-you-go: you buy credits and the tools marked as charged above spend them. One credit costs $0.01. Free tools and cache hits cost nothing. Call `get_credit_balance` at any time to check the remaining credits. Current prices per operation: https://unwatched.click/en/pricing

## Configuration

| Environment variable | Required | Default | Description |
|----------------------|----------|---------|-------------|
| `UNWATCHED_API_KEY` | Stdio only | — | Unwatched API key (`unw_sk_...`). Create one at https://unwatched.click/en/developer/keys. |
| `UNWATCHED_API_BASE` | No | `https://api.unwatched.click` | Base URL of the Unwatched REST API. |
| `MCP_TRANSPORT` | No | `stdio` | Transport to serve: `stdio` or `http`. |
| `MCP_PUBLIC_URL` | No | `https://mcp.unwatched.click` | Public HTTP base URL without `/mcp`. The resource URL advertised to OAuth clients is this base plus `/mcp`. |
| `MCP_AUTH_SERVER` | No | `https://api.unwatched.click` | OAuth issuer advertised to HTTP clients. Keep the default when using the official API, which issues and validates the tokens. |
| `PORT` | No | `3002` | Port to listen on in `http` mode. |
| `GLAMA_CLAIM_TOKEN` | No | — | Claim token for the Glama directory listing of the hosted deployment. Not used in local stdio mode. |
| `MCPRUSH_CLAIM_TOKEN` | No | — | Claim token for the MCPRush directory listing of the hosted deployment. Not used in local stdio mode. |

A template is provided in [`.env.example`](.env.example).

## Local development

```bash
git clone https://github.com/unwatched-click/mcp-server.git
cd mcp-server
npm ci
npm run build
npm test
UNWATCHED_API_KEY=unw_sk_your_key npm run inspect
```

`npm run inspect` starts the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) against the built server; build first and have an API key ready.

When the REST API contract changes, run `npm run openapi:pull && npm run openapi:types` to refresh `openapi/openapi.json` and regenerate `src/api/generated/openapi.ts`.

For maintainers cutting a release, see [RELEASING.md](RELEASING.md).

## Self-hosting (Streamable HTTP)

The server can serve the Streamable HTTP transport instead of stdio:

```bash
npm ci
npm run build
MCP_TRANSPORT=http PORT=3002 node build/index.js
```

`npm run http` does the same. The server listens on `PORT` (default 3002). Set `MCP_PUBLIC_URL` to the public base URL of your instance. The official issuer currently issues OAuth tokens for `https://mcp.unwatched.click/mcp`. For a self-hosted URL using the official API, connect with `Authorization: Bearer <your API key>`. OAuth on a custom URL requires an issuer and API configured for that exact resource.

With Docker:

```bash
docker build -t unwatched-click-mcp .
docker run -i --rm -e UNWATCHED_API_KEY=unw_sk_your_key unwatched-click-mcp
```

For the HTTP transport with Docker, also pass `-e MCP_TRANSPORT=http -p 3002:3002` (and `-e PORT=...` if you change the port).

## Security

Treat your API key as a secret: pass it through environment variables or your MCP client's secret storage, and never commit it. See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[MIT](LICENSE)
