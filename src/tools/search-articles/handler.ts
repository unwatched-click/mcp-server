import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import type { SearchArticlesInput } from './schema.js';

export async function searchArticlesHandler(
	input: SearchArticlesInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () =>
		json(await api.searchArticles({
			query: input.query,
			category: input.category,
			lang: input.lang,
			page: input.page,
			limit: input.limit,
		})));
}
