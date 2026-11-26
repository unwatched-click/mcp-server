import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { translateTranscriptHandler } from './handler.js';
import { translateTranscriptInputSchema } from './schema.js';

export function registerTranslateTranscriptTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('translate_transcript', {
		title: 'Translate a transcript',
		description:
			'Translate an already-fetched transcript into another language, keeping timestamps. '
			+ 'Requires get_video_subtitles to have been run for the source language first. '
			+ 'Priced per hour of video; cached translations are free.',
		inputSchema: translateTranscriptInputSchema,
	}, (input) => translateTranscriptHandler(input, api));
}
