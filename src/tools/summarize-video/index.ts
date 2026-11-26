import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { summarizeVideoHandler } from './handler.js';
import { summarizeVideoInputSchema } from './schema.js';

export function registerSummarizeVideoTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('summarize_video', {
		title: 'Summarize a YouTube video',
		description:
			'Generate a structured article from a YouTube video: title, intro, sections, key points '
			+ 'and conclusion, in the requested language. Priced per hour of video; an already '
			+ 'generated article is returned free. Slower than get_video_subtitles — prefer the '
			+ 'subtitles tool when you only need the raw text.',
		inputSchema: summarizeVideoInputSchema,
	}, (input) => summarizeVideoHandler(input, api));
}
