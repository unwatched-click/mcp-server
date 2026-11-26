import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MAX_FRAMES_PER_REQUEST } from '../../api/contract.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { getVideoFrameHandler } from './handler.js';
import { getVideoFrameInputSchema } from './schema.js';

export function registerGetVideoFrameTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('get_video_frame', {
		title: 'Get a screenshot at a timestamp',
		description:
			'Extract still frames from a YouTube video at given timestamps (seconds) and return them '
			+ 'as images you can look at, plus a stable URL for each. Use it to read on-screen text, '
			+ 'slides, charts or demos that the transcript only alludes to — pick the timestamps from '
			+ `get_video_subtitles output. Costs ${CREDIT_PRICES.screenshotPerFrame} credit(s) per frame `
			+ `(up to ${MAX_FRAMES_PER_REQUEST} per call); a timestamp already extracted `
			+ 'before is free. Batch the timestamps into one call rather than calling repeatedly — it '
			+ 'is both cheaper and faster.',
		inputSchema: getVideoFrameInputSchema,
	}, (input) => getVideoFrameHandler(input, api));
}
