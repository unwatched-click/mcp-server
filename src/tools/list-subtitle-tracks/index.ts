import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { listSubtitleTracksHandler } from './handler.js';
import { listSubtitleTracksInputSchema } from './schema.js';

export function registerListSubtitleTracksTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('list_subtitle_tracks', {
		title: 'List subtitle tracks',
		description:
			'List the subtitle languages available for a YouTube video, including whether each '
			+ 'track is auto-generated and its extraction quality. Free.',
		inputSchema: listSubtitleTracksInputSchema,
	}, (input) => listSubtitleTracksHandler(input, api));
}
