import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { getVideoInfoHandler } from './handler.js';
import { getVideoInfoInputSchema } from './schema.js';

export function registerGetVideoInfoTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('get_video_info', {
		title: 'Get video metadata',
		description: 'Title, duration, thumbnail URL and publish date for a YouTube video. Free.',
		inputSchema: getVideoInfoInputSchema,
	}, (input) => getVideoInfoHandler(input, api));
}
