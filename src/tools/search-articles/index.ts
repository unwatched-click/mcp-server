import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { READ_OWN } from '../shared/annotations.js';
import { searchArticlesHandler } from './handler.js';
import { searchArticlesInputSchema } from './schema.js';

export function registerSearchArticlesTool(server: McpServer, api: UnwatchedApi, _meta?: Tool['_meta']): void {
	server.registerTool('search_articles', {
		title: 'Search generated articles',
		description:
			'Search existing Unwatched articles by video title, category and language. Free. '
			+ 'Use this before calling summarize_video to check whether a '
			+ 'video has already been processed.',
		inputSchema: searchArticlesInputSchema,
		annotations: READ_OWN,
		_meta,
	}, (input) => searchArticlesHandler(input, api));
}
