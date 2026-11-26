import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from './api/contract.js';
import { registerAllTools } from './tools/index.js';
import { version } from './utils/version.js';

export function createServer(api: UnwatchedApi, pollShutdownSignal?: AbortSignal, toolMeta?: Tool['_meta']): McpServer {
	const server = new McpServer(
		{ name: 'unwatched', version },
		{
			instructions:
				'Tools for reading YouTube videos: subtitles with timestamps, available subtitle '
				+ 'tracks, video metadata, transcript translation, article generation, and search over '
				+ 'already-generated articles. Prefer get_video_subtitles when raw text is enough — it '
				+ 'is faster and cheaper than summarize_video.',
		},
	);
	registerAllTools(server, api, pollShutdownSignal, toolMeta);
	return server;
}
