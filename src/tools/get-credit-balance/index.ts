import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { getCreditBalanceHandler } from './handler.js';
import { getCreditBalanceInputSchema } from './schema.js';

export function registerGetCreditBalanceTool(server: McpServer, api: UnwatchedApi): void {
	server.registerTool('get_credit_balance', {
		title: 'Get credit balance',
		description:
			'Show the remaining credits on the configured Unwatched API key: free monthly balance, '
			+ 'purchased balance, access tier and the next reset date. Free.',
		inputSchema: getCreditBalanceInputSchema,
	}, (input) => getCreditBalanceHandler(input, api));
}
