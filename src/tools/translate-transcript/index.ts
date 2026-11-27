import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { SPENDS_CREDITS } from '../shared/annotations.js';
import { translateTranscriptHandler } from './handler.js';
import { translateTranscriptInputSchema } from './schema.js';

export function registerTranslateTranscriptTool(
	server: McpServer,
	api: UnwatchedApi,
	pollShutdownSignal?: AbortSignal,
	_meta?: Tool['_meta'],
): void {
	server.registerTool('translate_transcript', {
		title: 'Translate a transcript',
		description:
			'Translate an already-fetched transcript into another language, keeping timestamps. '
			+ 'Call get_video_subtitles for the source language first. '
			+ `Costs ${CREDIT_PRICES.translatePerHour} credits per hour of video with a 1-credit minimum. `
			+ 'Cached translations are free. Translation may take several minutes and reports progress.',
		inputSchema: translateTranscriptInputSchema,
		annotations: SPENDS_CREDITS,
		_meta,
	}, (input, extra) => translateTranscriptHandler(input, api, { ...extra, pollShutdownSignal }));
}
