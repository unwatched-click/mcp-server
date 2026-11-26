#!/usr/bin/env node
import { runHttp } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

async function main(): Promise<void> {
	const mode = process.env.MCP_TRANSPORT ?? process.argv[2] ?? 'stdio';

	switch (mode) {
		case 'http':
			await runHttp();
			break;
		default:
			await runStdio();
	}
}

main().catch((error: unknown) => {
	console.error('unwatched-click-mcp fatal error:', error);
	process.exit(1);
});
