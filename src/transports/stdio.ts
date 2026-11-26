import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from '../http/client.js';
import { createServer } from '../server.js';

/**
 * Local mode: the user's key comes from the environment. Missing key still
 * starts the server — every tool call then fails with a clear ApiError.
 * stdout is reserved for the protocol; diagnostics go to stderr.
 */
export async function runStdio(): Promise<void> {
	const apiKey = process.env.UNWATCHED_API_KEY ?? '';
	if (!apiKey) {
		console.error('Warning: UNWATCHED_API_KEY is not set; every tool call will fail. Get a key at https://unwatched.click/en/developer/keys');
	}
	const server = createServer(new ApiClient(apiKey));
	await server.connect(new StdioServerTransport());
	console.error('unwatched-click-mcp running on stdio');
}
