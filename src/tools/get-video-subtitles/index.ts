import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { getVideoSubtitlesHandler } from './handler.js';
import { getVideoSubtitlesInputSchema } from './schema.js';

export function registerGetVideoSubtitlesTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('get_video_subtitles', {
		title: 'Get YouTube subtitles',
		description:
			'Fetch the subtitle transcript of a YouTube video with timestamps. '
			+ `Returns the full text as timestamped lines. Costs ${CREDIT_PRICES.subtitleFetch} credit(s) on a first fetch; `
			+ 'repeat fetches of the same video and language are served from cache for free.',
		inputSchema: getVideoSubtitlesInputSchema,
	}, (input) => getVideoSubtitlesHandler(input, api));
}
