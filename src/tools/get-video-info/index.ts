import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { READ_EXTERNAL } from '../shared/annotations.js';
import { getVideoInfoHandler } from './handler.js';
import { getVideoInfoInputSchema } from './schema.js';

export function registerGetVideoInfoTool(server: McpServer, api: UnwatchedApi, _meta?: Tool['_meta']): void {
	server.registerTool('get_video_info', {
		title: 'Get video metadata',
		description: 'Title, duration, thumbnail URL and publish date for a YouTube video. Free.',
		inputSchema: getVideoInfoInputSchema,
		annotations: READ_EXTERNAL,
		_meta,
	}, (input) => getVideoInfoHandler(input, api));
}
