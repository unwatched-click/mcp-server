import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { searchArticlesHandler } from './handler.js';
import { searchArticlesInputSchema } from './schema.js';

export function registerSearchArticlesTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('search_articles', {
		title: 'Search generated articles',
		description:
			'Search the corpus of articles already generated on unwatched.click, by video title '
			+ 'text, category and language. Free. Use this before summarizing to check whether a '
			+ 'video has already been processed.',
		inputSchema: searchArticlesInputSchema,
	}, (input) => searchArticlesHandler(input, api));
}
