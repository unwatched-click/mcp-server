import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { CREDIT_PRICES } from '../pricing.js';
import { SPENDS_CREDITS } from '../shared/annotations.js';
import { transcribeVideoHandler } from './handler.js';
import { transcribeVideoInputSchema } from './schema.js';

export function registerTranscribeVideoTool(
	server: McpServer,
	api: UnwatchedApi,
	pollShutdownSignal?: AbortSignal,
	_meta?: Tool['_meta'],
): void {
	server.registerTool('transcribe_video', {
		title: 'Transcribe a YouTube video with AI',
		description:
			'Generate a timestamped AI transcript for a YouTube video without subtitles. Try get_video_subtitles first. '
			+ `Fresh transcription costs ${CREDIT_PRICES.aiSubtitlesPerHour} credits per hour of video. Ask the user for consent before calling this tool. `
			+ 'Cached transcripts are free. Transcription may take several minutes and reports progress. '
			+ 'Segments with kind: "visual" describe what appears on screen. Other segments contain transcribed speech.',
		inputSchema: transcribeVideoInputSchema,
		annotations: SPENDS_CREDITS,
		_meta,
	}, (input, extra) => transcribeVideoHandler(input, api, { ...extra, pollShutdownSignal }));
}
