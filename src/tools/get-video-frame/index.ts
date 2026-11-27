import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MAX_FRAMES_PER_REQUEST } from '../../api/contract.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { SPENDS_CREDITS } from '../shared/annotations.js';
import { getVideoFrameHandler } from './handler.js';
import { getVideoFrameInputSchema } from './schema.js';

export function registerGetVideoFrameTool(server: McpServer, api: UnwatchedApi, _meta?: Tool['_meta']): void {
	server.registerTool('get_video_frame', {
		title: 'Get a screenshot at a timestamp',
		description:
			'Extract still frames from a YouTube video at given timestamps (seconds) and return them '
			+ 'as images with stable URLs. Use it to read on-screen text, slides or charts. '
			+ 'Use get_video_subtitles to find relevant timestamps. '
			+ `Costs ${CREDIT_PRICES.screenshotPerFrame} credit per newly extracted frame. Cached frames are free. `
			+ `Batch up to ${MAX_FRAMES_PER_REQUEST} timestamps per call.`,
		inputSchema: getVideoFrameInputSchema,
		annotations: SPENDS_CREDITS,
		_meta,
	}, (input) => getVideoFrameHandler(input, api));
}
