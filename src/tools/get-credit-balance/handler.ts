import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import type { GetCreditBalanceInput } from './schema.js';

export async function getCreditBalanceHandler(
	_input: GetCreditBalanceInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => json(await api.getCredits()));
}
