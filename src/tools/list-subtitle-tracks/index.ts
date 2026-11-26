import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { READ_EXTERNAL } from '../shared/annotations.js';
import { listSubtitleTracksHandler } from './handler.js';
import { listSubtitleTracksInputSchema } from './schema.js';

export function registerListSubtitleTracksTool(server: McpServer, api: UnwatchedApi, _meta?: Tool['_meta']): void {
	server.registerTool('list_subtitle_tracks', {
		title: 'List subtitle tracks',
		description:
			'List the subtitle languages available for a YouTube video, including whether each '
			+ 'track is auto-generated and its extraction quality. Free.',
		inputSchema: listSubtitleTracksInputSchema,
		annotations: READ_EXTERNAL,
		_meta,
	}, (input) => listSubtitleTracksHandler(input, api));
}
