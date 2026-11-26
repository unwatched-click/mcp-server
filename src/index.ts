#!/usr/bin/env node
import { startHttpServer } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

async function main(): Promise<void> {
	const mode = process.env.MCP_TRANSPORT ?? process.argv[2] ?? 'stdio';

	switch (mode) {
		case 'http': {
			const { shutdown } = startHttpServer(Number(process.env.PORT ?? 3002));
			const stop = () => {
				// A drain timeout already force-closed the sockets; it is not a crash.
				void shutdown()
					.catch((error: unknown) => console.error('unwatched-click-mcp shutdown:', error))
					.finally(() => process.exit(0));
			};
			process.on('SIGINT', stop);
			process.on('SIGTERM', stop);
			break;
		}
		default:
			await runStdio();
	}
}

function fatal(error: unknown): never {
	console.error('unwatched-click-mcp fatal error:', error);
	process.exit(1);
}

main().catch(fatal);
