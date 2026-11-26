import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { READ_OWN } from '../shared/annotations.js';
import { getCreditBalanceHandler } from './handler.js';
import { getCreditBalanceInputSchema } from './schema.js';

export function registerGetCreditBalanceTool(server: McpServer, api: UnwatchedApi, _meta?: Tool['_meta']): void {
	server.registerTool('get_credit_balance', {
		title: 'Get credit balance',
		description:
			'Show the remaining credits on the connected Unwatched account: free monthly balance, '
			+ 'purchased balance, access tier and the next reset date. Free.',
		inputSchema: getCreditBalanceInputSchema,
		annotations: READ_OWN,
		_meta,
	}, (input) => getCreditBalanceHandler(input, api));
}
