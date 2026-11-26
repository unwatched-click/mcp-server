import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { GENERATE } from '../shared/annotations.js';
import { summarizeVideoHandler } from './handler.js';
import { summarizeVideoInputSchema } from './schema.js';

export function registerSummarizeVideoTool(
	server: McpServer,
	api: UnwatchedApi,
	pollShutdownSignal?: AbortSignal,
	_meta?: Tool['_meta'],
): void {
	server.registerTool('summarize_video', {
		title: 'Summarize a YouTube video',
		description:
			'Generate a structured article from a YouTube video: title, intro, sections, key points '
			+ `and conclusion, in the requested language. Costs ${CREDIT_PRICES.summaryPerHour} credits per hour of video `
			+ 'with a 1-credit minimum. Cached articles are free. Generation may take several minutes '
			+ 'and reports progress. Use get_video_subtitles when you only need the transcript.',
		inputSchema: summarizeVideoInputSchema,
		annotations: GENERATE,
		_meta,
	}, (input, extra) => summarizeVideoHandler(input, api, { ...extra, pollShutdownSignal }));
}
