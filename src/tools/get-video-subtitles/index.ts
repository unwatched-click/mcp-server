import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { READ_EXTERNAL } from '../shared/annotations.js';
import { getVideoSubtitlesHandler } from './handler.js';
import { getVideoSubtitlesInputSchema } from './schema.js';

export function registerGetVideoSubtitlesTool(server: McpServer, api: UnwatchedApi, _meta?: Tool['_meta']): void {
	server.registerTool('get_video_subtitles', {
		title: 'Get YouTube subtitles',
		description:
			'Fetch the full subtitle transcript of a YouTube video as timestamped lines. '
			+ `Costs ${CREDIT_PRICES.subtitleFetch} credit on the first fetch for each video and language. `
			+ 'Cached fetches are free.',
		inputSchema: getVideoSubtitlesInputSchema,
		annotations: READ_EXTERNAL,
		_meta,
	}, (input) => getVideoSubtitlesHandler(input, api));
}
